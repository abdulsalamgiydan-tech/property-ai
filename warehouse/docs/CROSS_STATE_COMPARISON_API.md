# Cross-State Comparison API (Sprint 10, Phase 11)

Four public, read-only interfaces (all `SECURITY DEFINER`, pinned
`search_path`, `SELECT`/`EXECUTE` granted to `anon`/`authenticated` only —
zero direct grants on `core`/`mart`/`meta`). Defined in migration
`016_market_comparison_interfaces.sql`, alongside (not replacing) the
existing v1 interfaces from migration 014.

## `public.search_market_geographies_v2(p_query, p_jurisdiction, p_geography_type, p_limit)`

Jurisdiction-aware suburb/postcode search for the explore/compare UI.

- `p_query` — optional substring match against `geography_name`, or exact
  `geography_code` match.
- `p_jurisdiction` — optional, must exist in `meta.jurisdiction` (`'NSW'`
  or `'VIC'`) or the call raises an exception.
- `p_geography_type` — optional, must be `'SAL'` or `'POA'` or the call
  raises an exception.
- `p_limit` — clamped to 1-50 inside the function; a caller-supplied value
  outside that range is silently clamped, not rejected.

No ranking, no scoring — results ordered alphabetically by name only.

## `public.get_market_snapshot_v2(p_geography_id)`

Single-geography snapshot (SAL or POA, whichever matches), including
`jurisdiction`, `geography_method`, all sales/rent/yield/supply/
demographic/affordability fields, `confidence_label`, and
`missing_metric_reasons`. Supersedes `v_suburb_market_snapshot_v1` /
`v_postcode_market_snapshot_v1` for the multi-state UI — those v1 views
remain available for backward compatibility with the existing `/research`
preview.

## `public.compare_market_geographies_v1(p_geography_ids text[])`

Side-by-side comparison of **2 to 5** geographies (any mix of NSW/VIC,
suburb/postcode) — array length is validated inside the function and out-
of-range calls raise an exception. Returns raw metric columns per
geography with `jurisdiction`, `confidence_label`, and
`missing_metric_reasons` — **no composite score, no ranking, no buy/pass
output**, consistent with this sprint's explicit prohibition on hidden
scoring or investment recommendations.

## `public.get_market_timeseries_v2(p_geography_id)`

Same shape as `get_market_timeseries_v1` (migration 014) plus
`jurisdiction` and `state_code` columns, unioning
`mart.suburb_market_timeseries` and `mart.postcode_market_timeseries`.

## Security model

Identical to migration 014's established pattern:

- Functions run `SECURITY DEFINER` with an explicit `search_path` — anon/
  authenticated never need a direct grant on `core`/`mart`/`meta`.
- `meta.jurisdiction` (new in migration 015) is explicitly `REVOKE`d from
  anon/authenticated; it is reachable only through
  `search_market_geographies_v2`'s internal join.
- Row limits and array-length bounds are enforced **inside** the function
  body (`LEAST`/`GREATEST` clamp, explicit `RAISE EXCEPTION`), not just
  documented — a caller cannot request an unbounded result set.
- Verified via `warehouse/reports/cross_state_security_test.{json,md}`:
  anon can execute all four functions, cannot read or write `mart.*`/
  `meta.jurisdiction` directly, and a SQL-injection-shaped query parameter
  is treated as a literal value (PL/pgSQL parameter binding, not string
  concatenation).

## Explicitly out of scope (per this sprint's guardrails)

No suburb/postcode ranking, no composite investment score, no automated
valuation, no price forecast, no buy/pass recommendation, no financial
advice. `repayment_estimate` and related affordability fields are always
paired with a "descriptive research context only" framing in the
interface layer (Phase 12).
