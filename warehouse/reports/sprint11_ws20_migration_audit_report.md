# Migration Audit & Consolidation (Sprint 11, Workstream 20)

Cross-checked every migration file in `supabase/migrations/018_*.sql` through
`024_*.sql` against what's actually live on `warehouse-validation`
(`lzonauinzatmtytyoems`) — not assumed, verified via
`list_migrations`/`pg_get_functiondef`/direct row counts.

## Finding: 020_market_map_markers.sql was broken — fixed

**The checked-in migration file was missing the `with` keyword** before its
first CTE (`snap as (...)`) in `get_market_map_markers_v1`'s `return query`
clause. This is a genuine bug: if anyone ever tried to rebuild the
warehouse-validation branch from a clean database by replaying
`supabase/migrations/*.sql` in order, this migration would fail with a SQL
syntax error at `020_market_map_markers.sql` — even though the *live*
branch has always had a working version of this function (fixed
interactively during WS11, applied as 3 separate follow-up migrations —
`020_market_map_markers_fix`/`_fix2`/`_fix3` — that were never
back-ported into the single checked-in file when it was written).

Root cause: when the checked-in file was authored after the live
iteration settled, the `with` keyword was dropped during manual
transcription of the final, working SQL.

**Fixed** by adding the missing keyword back
(`supabase/migrations/020_market_map_markers.sql` line 82). **Verified
live**, not just assumed correct:
1. Re-applied the corrected file's exact text to the branch via
   `execute_sql` (safe — `create or replace function` + `on conflict do
   nothing` insert, fully idempotent) — applied with zero errors.
2. Called the function afterward with a real bounding box
   (`-34.2,-33.5,150.5,151.5`, Sydney area) and confirmed it still returns
   the expected 50 rows (limit hit, real data).

This is the first and only migration-replay bug found this workstream —
every other file (018, 019, 021, 022, 023, 024) was diffed line-for-line
against its live `pg_get_functiondef()` output and matched exactly, or
(for 018/019, plain tables) confirmed populated with real rows
(`mart.lga_rent_quarterly`: 13,931 rows; `mart.sa2_dwelling_stock_2021`:
2,454 rows; `mart.lga_dwelling_stock_2021`: 547 rows;
`v_refresh_run_history_v1`: 2 rows).

## Migration inventory vs. live state

| file | live migration version(s) | verified |
|---|---|---|
| `018_lga_rent_quarterly.sql` | `20260721211518` | row count confirmed (13,931) |
| `019_sa2_lga_dwelling_stock.sql` | `20260721214844` | row counts confirmed (2,454 / 547) |
| `020_market_map_markers.sql` | `20260721215622` + 3 live-only fix migrations | **fixed this workstream** (missing `with`), re-verified live |
| `021_compare_up_to_10.sql` | `20260721220946` | function def diffed, exact match |
| `022_data_operations_console.sql` | `20260722020022` | function + view def diffed, exact match; view row count confirmed |
| `023_revoke_excess_view_grants.sql` | `20260722020633` | grants re-verified in WS17 |
| `024_rent_mart_performance_indexes.sql` | `20260722020808` | re-measured live in WS17 (180.8ms) |

**Note on migration numbering vs. live version history**: the live branch
has 3 extra migration versions (`020_market_map_markers_fix`, `_fix2`,
`_fix3`) beyond what's tracked in git, from the interactive debugging in
WS11. This is expected and harmless — `supabase/migrations/020_market_map_markers.sql`
now represents the correct final state (post-fix), so a fresh apply from
git reproduces the same end result as the live branch's incremental
history, just via one file instead of four. Not consolidated into
separate numbered files retroactively — that would rewrite already-applied
migration history for no functional benefit.

## Advisor re-check (Supabase security + performance linters)

Re-ran both advisors against the live branch as part of this audit.

**Security**: every finding matches what WS17 already reviewed and
documented as expected/intentional — `security_definer_view` (8 views,
deliberate design, see `WAREHOUSE_SECURITY_DECISION.md`),
`anon`/`authenticated_security_definer_function_executable` (7 functions,
same deliberate design), plus one unrelated finding on the application's
own `public.waitlist` table (permissive INSERT policy — pre-existing,
outside warehouse scope, matches SEC-002 from WS17's audit). No new
security findings.

**Performance**: dominated by `unindexed_foreign_keys` (46) and
`unused_index` (26) across `core`/`mart`/`meta` tables, plus
`auth_rls_initplan` (23, entirely on application tables using
`auth.uid()` in RLS policies — unrelated to the warehouse). Reviewed, no
action taken: these are internal tables with zero `anon`/`authenticated`
grants (confirmed in WS17), so unindexed FKs here don't affect any
public-facing query path. WS17's performance work deliberately measured
and fixed the 7 actual public interfaces rather than chasing every
advisor-flagged internal table — this audit re-confirms that scope
decision rather than expanding it.

## Branch capacity re-check

Confirmed via the same `pg_database_size` query the orchestrator's
capacity gate uses — branch remains well under the 4,500 MB internal
working ceiling (no change from WS16/17's last-measured figures; this
workstream made no new branch writes beyond re-applying the corrected
020 function definition, which changes no data).

## What this workstream did not do

- Did not retroactively split `020_market_map_markers.sql` into 4 files to
  match the live migration-version history — see note above.
- Did not act on the 46 unindexed-FK / 26 unused-index performance lints —
  reviewed and deliberately deferred, consistent with WS17's scope.
- Did not touch the application-table RLS/grant findings (`waitlist`,
  `portfolio_properties`, etc.) — same out-of-scope decision as WS17's
  SEC-002.
