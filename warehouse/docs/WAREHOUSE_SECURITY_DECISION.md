# Warehouse Security Decision: RLS (Sprint 11, Workstream 17)

## The decision

**RLS remains disabled on all 44 tables across `core`, `mart`, `meta`,
and `staging`. This is the correct, deliberate choice — not an oversight,
and not something to "fix" by blindly flipping RLS on to silence the
Supabase advisor.**

This decision was first made explicitly in Sprint 9
(`WAREHOUSE_READONLY_ACCESS_DESIGN.md`) and is re-confirmed, unchanged,
by this workstream's live audit.

## Why not RLS

Retrofitting row-level security across 44 tables would mean writing and
testing per-table policies for data that has **no natural per-row
ownership concept** — these are research facts (a suburb's median sale
price, a Census cell, a rent quarterly figure), not user-owned records
like `watchlist_items` or `portfolio_properties`. There is no "which user
can see this row" question to answer for `mart.suburb_market_snapshot` —
every row is equally public research data, or none of it is.

## The actual security boundary: schema visibility, not row policies

Instead, `core`/`mart`/`meta`/`staging` are **entirely invisible to
PostgREST** (Supabase's REST API layer) — `anon`/`authenticated` have
**zero grants** of any kind on any table in these four schemas, confirmed
live by this audit (`information_schema.role_table_grants` returns no
rows for these schemas). A small, deliberately-curated `public.*` surface
(8 views, 7 functions as of this audit) exposes only the specific fields
each interface actually needs, via `SECURITY DEFINER`
functions/`security_invoker=false` views that run with the view/function
owner's privileges, not the querying `anon` role's (which has none on the
underlying tables at all).

This is architecturally equivalent in outcome to "deny by default, allow
by explicit exception" — the same goal RLS would achieve — but implemented
at the schema-exposure layer instead of the row-policy layer, which is
the right layer for data that has no per-row access distinction to make.

## Is each schema API-exposed?

| schema | API-exposed? | how |
|---|---|---|
| `core` | No | zero grants to anon/authenticated |
| `mart` | No | zero grants to anon/authenticated |
| `meta` | No | zero grants to anon/authenticated |
| `staging` | No | zero grants to anon/authenticated, and staging data is never promoted to a public view in the first place |
| `public` | Yes, narrowly | 8 views + 7 functions, each hand-reviewed for which columns/rows they expose (see `database_security_audit.md`) |

## Grants in place (summary — full detail in `database_security_audit.md`)

- `anon`/`authenticated`: `SELECT` on 8 `public.v_*` views, `EXECUTE` on 7
  `public.*` functions. Nothing else, on nothing else.
- **Fixed this workstream**: excess `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`
  grants that Supabase's platform-level default privileges had silently
  added to every `public.v_*` view — explicitly revoked (migration 023).

## Public interface boundaries

Every public function enforces its own bounds internally (not just
documented, verified live by this audit):
- `search_market_geographies_v2`: limit clamped 1-50.
- `compare_market_geographies_v1`: 2-10 geographies.
- `get_market_map_markers_v1`: bounding box validated to Australia's
  range, limit clamped 1-1500.
- `get_market_snapshot_v2`, `get_market_timeseries_v1`/`_v2`: scoped to a
  single `geography_id`, no cross-geography scan possible.

## Residual risks

1. **`get_market_timeseries_v1`/`_v2` have no explicit row cap** — low
   risk in practice (a single geography's history tops out at a few
   hundred rows) but not an *enforced* limit like every other function.
   Flagged as a recommendation, not fixed this pass (see
   `database_security_audit.md` finding 4).
2. **The Supabase advisor's "SECURITY DEFINER view"/"anon can execute
   SECURITY DEFINER function" warnings are expected and intentional**,
   not residual risk — they describe the deliberate design itself
   (`security_invoker=false` views and `SECURITY DEFINER` functions are
   *how* the schema-hiding boundary works), not a misconfiguration. A
   future reviewer re-running the Supabase advisor should expect to see
   these specific warnings and should not "fix" them by switching to
   `SECURITY INVOKER`, which would require granting `anon` direct table
   access and defeat the entire design.
3. **The validation branch is a full structural clone of production**,
   meaning the application's own tables (`watchlist_items`,
   `portfolio_properties`, etc.) exist here too with production's
   existing RLS/grant configuration — unrelated to and unmodified by any
   warehouse work, but worth a human noting before ever treating this
   branch's schema as a complete security reference for the whole app.

## Production recommendation

**Ready for controlled staging**, specifically for the warehouse's public
research surface. This RLS/grants architecture is sound and has now been
live-audited twice (Sprint 9's initial design, this workstream's
follow-up) with one real gap found and fixed. It should not block a
staging or preview release on its own. The application's own tables
(finding 2 in `database_security_audit.md`) are a separate, pre-existing
concern that a human should review before any production decision that
touches those tables specifically — not something this warehouse-focused
audit is positioned to resolve.
