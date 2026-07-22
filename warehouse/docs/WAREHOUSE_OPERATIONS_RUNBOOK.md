# Warehouse Operations Runbook (Sprint 11, Workstream 21)

How to actually operate the warehouse day to day, using the tooling built
in Sprint 11 (WS14-20). **Supersedes `REFRESH_OPERATING_MODEL.md`** (Sprint
10), which describes the older single-jurisdiction `run_refresh.mjs` — that
file is kept for history, not deleted, but `refresh_engine_v2.mjs` is now
the orchestrator to use for anything spanning more than one dataset.

## Before running anything

1. Confirm you're targeting the validation branch, never production:
   `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` must reference
   `lzonauinzatmtytyoems`. The orchestrator refuses to start if it
   references `oshquaxsloolqucwvigc` (production) — this is enforced in
   code, not just convention (see `warehouse/scripts/orchestration/refresh_engine_v2.mjs`
   lines 83-91).
2. Check current state before changing anything: `/research/data-status`
   (needs `WAREHOUSE_PREVIEW_ENABLED=true` and `DATA_OPERATIONS_ENABLED=true`
   locally) shows per-dataset freshness, refresh-run history, and branch
   storage in MB.

## Normal refresh workflow

```bash
# 1. See what would run, without touching anything
node warehouse/scripts/orchestration/refresh_engine_v2.mjs --plan

# 2. Run locally only (build + validate scripts, no DB writes)
node warehouse/scripts/orchestration/refresh_engine_v2.mjs --execute --local-only

# 3. Once local output looks right, publish to the branch
node warehouse/scripts/orchestration/refresh_engine_v2.mjs --execute --branch-load
```

Useful filters: `--jurisdiction=NSW|VIC|QLD|SA|WA|ALL`,
`--dataset=<id>[,<id>...]`, `--changed-only` (skip datasets whose
`local_report` hash hasn't changed since the last recorded run).

Every run prints a `run_id` (a UUID) and writes its state to
`warehouse/data/local/refresh_runs/<run_id>.json` (gitignored — local
scratch, never committed).

## If a run fails partway through

The engine isolates failures per dataset — one dataset failing doesn't
stop or corrupt the others (see `refresh_engine_v2.mjs`'s dispatch loop,
lines 234-300). Datasets that depend on a failed one will very likely fail
their own validation too; the engine doesn't pre-emptively skip them, it
lets their own gates catch it — check the printed summary for exactly
which dataset(s) failed and why (`entry.error`, truncated to 2000 chars).

To retry only what didn't succeed:

```bash
node warehouse/scripts/orchestration/refresh_engine_v2.mjs --resume=<run_id>
```

This skips every dataset already marked `succeeded` in that run's state
file and retries the rest.

## If the orchestrator refuses to start ("another refresh run appears to be in progress")

A lock file at `warehouse/data/local/refresh_runs/.lock` prevents two
concurrent orchestrator runs from corrupting each other's state. If you're
certain no other run is actually in progress (e.g. a prior run crashed
without cleaning up — normally `process.on("exit", releaseLock)` handles
this, but a hard kill/power loss can leave it behind):

1. Check the lock's `run_id`/`pid`/`acquired_at` (printed in the refusal
   message).
2. If it's genuinely stale, either wait — locks older than 2 hours are
   automatically treated as stale and bypassed on the next run — or delete
   `warehouse/data/local/refresh_runs/.lock` manually once you've
   confirmed that `pid` is not actually running.

## Capacity

Before any `--branch-load`, the engine queries `pg_database_size` and
refuses if the branch is at or above 90% of the internal 4,500 MB working
ceiling (the branch's actual Supabase Pro allocation is 8,192 MB — 4,500 MB
is a deliberately conservative internal number, not the hard platform
limit). If you hit this gate, check `/research/data-status`'s operations
summary for current usage before considering any cleanup — this project has
never needed to reclaim branch space so far.

## Feature flags (see `lib/warehouse/env.ts`, WS18)

All default to disabled. Set the exact string `"true"` (any other value,
including `"1"` or `"TRUE"`, stays disabled):

| flag | gates |
|---|---|
| `WAREHOUSE_PREVIEW_ENABLED` | all of `/research/*` |
| `MULTI_STATE_RESEARCH_ENABLED` | `/research/explore`, `/research/map`, `/research/compare` |
| `DATA_OPERATIONS_ENABLED` | `/research/data-status` |
| `SCENARIO_LAB_ENABLED` | `/research/scenario` (not built yet — Sprint 12) |

## Security posture (see `WAREHOUSE_SECURITY_DECISION.md`, WS17)

RLS is deliberately disabled on all 44 `core`/`mart`/`meta`/`staging`
tables — don't "fix" this by enabling RLS in response to the Supabase
advisor. The actual boundary is schema visibility: `anon`/`authenticated`
have zero grants on those four schemas; only a curated `public.*` surface
(8 views, 7 functions as of WS20) is reachable, each with limits enforced
inside the function/view itself. If the Supabase advisor flags
`security_definer_view` or `anon_security_definer_function_executable` on
any of these, that's the design working as intended, not a regression —
see `database_security_audit.md` (WS17) and `sprint11_ws20_migration_audit_report.md`
(WS20, which re-ran both advisors and found no new findings).

## Migrations

Every migration in `supabase/migrations/003_*.sql` onward has been applied
live to `lzonauinzatmtytyoems` via the Supabase MCP `apply_migration` tool
and is tracked by `list_migrations`. **`020_market_map_markers.sql` was
found and fixed for a real replay bug in WS20** (see
`sprint11_ws20_migration_audit_report.md`) — if you ever need to rebuild
the branch from a clean database by replaying every migration file in
order, that fix is why it will now actually work. When authoring a new
migration that gets live-debugged interactively (multiple `apply_migration`
calls to fix issues found live), make sure the *final* checked-in file
reflects the corrected SQL exactly — don't leave the first, broken attempt
as the committed version.

## Reports index (Sprint 11)

| workstream | report |
|---|---|
| WS14 | `sprint11_ws14_refresh_engine_report.md` |
| WS15 | `NATIONAL_REFRESH_SCHEDULE.md` |
| WS17 | `database_security_audit.{md,json}`, `query_performance_report.{md,json}` |
| WS18 | `sprint11_ws18_feature_flags_report.md` |
| WS19 | `sprint11_ws19_test_coverage_report.md` |
| WS20 | `sprint11_ws20_migration_audit_report.md` |
