# Database Security Audit (Sprint 11, Workstream 17)

Generated: 2026-07-22. Live audit against `warehouse-validation`
(`lzonauinzatmtytyoems`) — every finding below was queried directly from
`information_schema`/`pg_catalog`, not assumed.

## Public surface inventory (as of this audit)

### Views (`public.v_*`)

| view | purpose | grants (anon/authenticated) |
|---|---|---|
| `v_suburb_market_snapshot_v1` | Wide NSW/VIC snapshot, SAL grain | SELECT only |
| `v_postcode_market_snapshot_v1` | Same, POA grain | SELECT only |
| `v_market_geography_search_v1` | Suburb/postcode search | SELECT only |
| `v_suburb_demographic_profile_v1` | Census profile, SAL grain | SELECT only |
| `v_postcode_demographic_profile_v1` | Same, POA grain | SELECT only |
| `v_metric_assumptions_v1` | Affordability assumption scenario | SELECT only |
| `v_dataset_freshness_v1` | Per-dataset freshness (WS16) | SELECT only |
| `v_refresh_run_history_v1` | Refresh run history (WS16) | SELECT only |

### Functions (`public.*`, all `SECURITY DEFINER` except `set_updated_at`)

| function | purpose | row/geography limits enforced inside the function |
|---|---|---|
| `search_market_geographies_v2` | Jurisdiction-aware search | limit clamped 1-50 |
| `get_market_snapshot_v2` | Single-geography snapshot | single row by geography_id |
| `get_market_timeseries_v1` / `_v2` | Time series for one geography | single geography_id, no separate row cap (see notes) |
| `compare_market_geographies_v1` | 2-10 geography comparison | array length validated 2-10 |
| `get_market_map_markers_v1` | Map markers | bounding box validated to Australia's range, limit clamped 1-1500 |
| `get_warehouse_operations_summary_v1` | Ops console aggregate | single-row aggregate, no per-row exposure |

`rls_auto_enable` and `set_updated_at` are Supabase platform/trigger
infrastructure, not application-level public API — see "Non-findings"
below.

## Findings

### 1. FIXED — Excess grants on every warehouse view (migration 023)

**Before this audit**: every `public.v_*` warehouse view carried
`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` grants to `anon` and `authenticated`,
in addition to `SELECT`. No migration in this project ever explicitly
granted these — they came from Supabase's platform-level
`ALTER DEFAULT PRIVILEGES` on the `public` schema, applied automatically
to every new object.

**Risk in practice**: low but real. Every affected view is a multi-table
JOIN with no `INSTEAD OF` trigger, so Postgres would already reject an
actual `INSERT`/`UPDATE`/`DELETE` attempt against them ("cannot insert
into view... use an unconditional ON INSERT DO INSTEAD rule"). The grant
was inert, not exploitable — but relying on that implementation detail
rather than an explicit policy is fragile, and directly contradicts this
project's "no anonymous writes" hard rule if read literally (a grant that
merely happens not to work is not the same as a grant that doesn't exist).

**Fix**: migration `023_revoke_excess_view_grants.sql` explicitly revokes
`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` on all 8 warehouse views, and adds
an `ALTER DEFAULT PRIVILEGES` statement to reduce (not guaranteed to fully
prevent, since Supabase's platform automation may run under a different
role — see caveat in the migration) this recurring for future objects.
**Verified live after the fix**: every warehouse view now shows only
`SELECT`/`REFERENCES`/`TRIGGER` (the latter two are vestigial, no-op
privileges on a view) for `anon`/`authenticated`.

### 2. DOCUMENTED, OUT OF SCOPE — Application tables inherit production's grants

The Supabase branch is a full structural clone of production, which means
the application's own tables (`portfolio_properties`, `property_comparisons`,
`property_reports`, `strategy_generations`, `strategy_reports`, `waitlist`,
`watchlist_items`) exist on the validation branch too, with whatever
RLS/grants production already has for them (full `anon`/`authenticated`
CRUD observed on the branch). **This is not a warehouse-introduced
vulnerability** — these tables are unrelated to the research/warehouse
feature set and were never touched by any Sprint 11 migration. Auditing
and potentially hardening them is a separate, production-facing decision
outside this workstream's scope (changing RLS/grants on live application
tables that other app features depend on is not something to do
unilaterally inside a warehouse security audit). **Flagged for a human
decision, not fixed here.**

### 3. Non-findings (reviewed, no action needed)

- **`rls_auto_enable`**: a Supabase platform-managed event trigger
  function (auto-enables RLS on any newly-created `public` schema table).
  Not something this project created; harmless — it can only be invoked
  by the DDL event trigger mechanism, not called directly to bypass
  anything.
- **`set_updated_at`**: a standard `BEFORE UPDATE` trigger helper
  function. Has `EXECUTE` granted to `anon` by Postgres's default (all
  functions are `PUBLIC`-executable unless explicitly revoked), but
  calling it directly as a plain function does nothing useful — it
  operates on trigger-context `NEW`/`OLD` records that don't exist
  outside an actual trigger invocation.
- **`core`/`mart`/`meta` schema access**: confirmed zero direct grants to
  `anon`/`authenticated` on any table in these three schemas — every
  public read path goes through a `SECURITY DEFINER` function or a
  `security_invoker=false` view, matching the design established in
  Sprint 9 (`WAREHOUSE_READONLY_ACCESS_DESIGN.md`) and unchanged since.
- **SQL injection resistance**: every parameterised function uses typed
  arguments (`text`, `numeric`, `text[]`) bound via Postgres's own
  function-call parameter binding, not string concatenation — no
  dynamic SQL construction from user input anywhere in the public
  surface.
- **Bounded response sizes**: every function that could return an
  unbounded result set has an explicit, enforced cap: search (50),
  compare (10 geographies), map markers (1,500 rows, plus a validated
  bounding box so a caller can't request "everything"), refresh run
  history view (`LIMIT 200` baked into the view definition itself, not
  just documented).

### 4. Recommendation — `get_market_timeseries_v1`/`_v2` have no row cap

Unlike every other function, the timeseries functions don't clamp a
maximum row count — they return every row for the requested
`geography_id`. In practice this is self-limiting (a single geography's
time series across all metric families is at most a few hundred rows,
confirmed live: 31 rows for a typical NSW suburb), but it is not an
*enforced* limit the way the others are. **Recommendation for a future
pass**: add a `LIMIT` inside these functions as defense in depth, even
though no exploit path currently exists (a single `geography_id` can't be
made to return more than what that one geography genuinely has data for).

## Environment variable / credential review

- `WAREHOUSE_SUPABASE_URL` / `WAREHOUSE_SUPABASE_ANON_KEY`: anon key,
  intended to be public (same trust model as any Supabase JS client-side
  app) — used only in `lib/warehouse/client.ts`, which is server-only by
  project convention (no `"use client"` file imports it).
- `WAREHOUSE_VALIDATION_DB_URL`: the direct Postgres connection string
  used by branch-load scripts and `refresh_engine_v2.mjs`. Never printed
  by any script (confirmed by code review — every loader reads it via
  `process.env` and passes it straight to the `pg.Client` constructor,
  never interpolated into a `console.log`). Not present in any client
  bundle (only referenced from `.mjs` scripts run via Node, never from
  `app/`/`components/`).
- No service-role key is used anywhere in this project's warehouse code.

## Summary

| check | result |
|---|---|
| Anonymous read-only where intentionally allowed | PASS |
| No anonymous writes | PASS (fixed this audit — see finding 1) |
| Direct core/mart/meta schema access denied | PASS |
| Bounded response rows | PASS (one recommendation — finding 4) |
| Bounded geography counts | PASS |
| Bounded geometry payloads | PASS (map markers use centroid lat/lon only, never full polygon geometry) |
| Validated geography/jurisdiction codes | PASS |
| SQL injection resistance | PASS |
| No service credentials in browser assets | PASS |
| No internal branch identifiers returned publicly | PASS |
| No local paths returned publicly | PASS |

See `warehouse/docs/WAREHOUSE_SECURITY_DECISION.md` for the RLS decision
this workstream was explicitly asked to make (not automatically enable
RLS on advisor-flagged tables).
