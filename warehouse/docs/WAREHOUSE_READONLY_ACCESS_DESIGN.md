# Warehouse Read-Only Access Design (Sprint 9, Phase 9)

## Decision

**Core, staging, mart and meta schemas stay un-exposed to PostgREST.** A minimal
set of `public.*` views and one RPC function (migration
`014_warehouse_readonly_access.sql`) expose only the fields the internal
`/research` preview needs. This resolves the RLS-disabled advisory
(35 warehouse tables, flagged since Sprint 2) **without** retrofitting RLS
policies across all of them — that remains explicitly out of scope for this
sprint (see "What was NOT done" below).

## Why this pattern, not RLS-on-everything

Retrofitting row-level security across 35 tables spanning meta/staging/core/mart
would mean writing and testing per-table policies for data that has no natural
per-row ownership concept (these are research facts, not user-owned records) —
a much larger, separate security project. The narrower, faster, and arguably
safer fix for *this* sprint's actual need (a read-only research preview) is: keep
the wide/internal schemas invisible to the REST API entirely, and publish a
small, deliberately-curated `public.*` surface.

## Security model

- **Views**: `security_invoker = false` (Postgres's classic view behaviour — the
  view runs with its **owner's** privileges on the underlying `mart`/`meta`
  tables). This is a deliberate, non-default choice: `security_invoker = true`
  would require granting `anon`/`authenticated` direct `SELECT` on the
  underlying tables to work at all, which defeats the purpose of keeping those
  schemas un-exposed. There are no RLS policies on the underlying tables for
  `security_invoker` to usefully compose with here, so the definer-privilege
  view pattern is correct for this use case.
- **RPC function** (`get_market_timeseries_v1`): `SECURITY DEFINER` with an
  explicit `set search_path = public, mart` (standard hardening against
  search-path hijacking for definer functions).
- **Grants**: `anon` and `authenticated` get `SELECT` on the 6 views and
  `EXECUTE` on the 1 function — nothing else. Explicit `REVOKE INSERT, UPDATE,
  DELETE, TRUNCATE` statements on every view (defence in depth; these were
  never granted in the first place). Explicit `REVOKE ALL ON SCHEMA core, mart,
  staging, meta FROM anon, authenticated` — even if a future migration
  accidentally granted something on an underlying table, this schema-level
  revoke is the backstop.

## Public surface

| object | purpose |
|---|---|
| `public.v_suburb_market_snapshot_v1` | Suburb market snapshot (sales/rent/yield/supply/demographics/affordability) |
| `public.v_postcode_market_snapshot_v1` | Same, postcode grain |
| `public.v_market_geography_search_v1` | Suburb/postcode search + disambiguation (name/state/type) |
| `public.v_suburb_demographic_profile_v1` | Census demographic/income/tenure detail |
| `public.v_postcode_demographic_profile_v1` | Same, postcode grain |
| `public.v_metric_assumptions_v1` | Current baseline affordability scenario, for transparent display |
| `public.get_market_timeseries_v1(p_geography_id text)` | Recent-trend time series for one geography |

None of these expose internal lineage columns (`load_run_id`, `source_file_id`,
raw `sales_summary_id`s, etc.) — only fields the UI actually renders.

## Verification

`warehouse/scripts/market_intelligence/test_readonly_access.mjs` connects with
the branch's **anon key only** (via `supabase-js`, exactly as the app will) and
proves:

- Allowed reads succeed: geography search, both snapshot views, demographic
  profile, metric assumptions, and the time-series RPC.
- `INSERT`/`UPDATE`/`DELETE` against every public view fail with "permission
  denied".
- Direct PostgREST access to `core.*`, `mart.*`, `meta.*` fails with "Invalid
  schema" — these schemas are not in PostgREST's exposed-schema list at all.

Full results: `warehouse/reports/warehouse_readonly_security_test.{json,md}`
(12/12 tests passed).

## What was NOT done (explicitly out of scope this sprint)

- **RLS is still disabled on all 35 underlying `meta`/`staging`/`core`/`mart`
  tables.** This remains a real Supabase advisory finding. It is not currently
  reachable by any client (nothing in the app points the anon key at the branch
  project except this new, tested, minimal view layer), but a future sprint
  should still decide whether to enable RLS with permissive policies across
  those tables for defence-in-depth, independent of this view-layer fix.
- No `service_role` key is used anywhere in this design or in the `/research`
  app code — confirmed in the Phase 10 secret-bundle check.
