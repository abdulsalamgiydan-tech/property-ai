# Warehouse Operations Runbook (Sprint 11 WS21, extended Sprint 12 WS17)

How to actually operate the warehouse day to day. **Supersedes
`REFRESH_OPERATING_MODEL.md`** (Sprint 10), which describes the older
single-jurisdiction `run_refresh.mjs` — kept for history, not deleted.
`refresh_engine_v3.mjs` (Sprint 12 WS10) is now the orchestrator to use
for anything spanning more than one dataset — it wraps `refresh_engine_v2.mjs`
(still the actual execution engine underneath) and adds a blocking
quality gate, freshness updates, and dependency-aware selection. Use v2
directly only if you specifically don't want the WS9 quality gate in the
loop (rare — v3 is the normal entry point).

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

## Normal refresh workflow (v3 — the WS9-integrated entry point)

```bash
# 1. See what would run, with reasons, without touching anything
node warehouse/scripts/orchestration/refresh_engine_v3.mjs --plan

# 2. Read-only sanity check: does the branch currently pass every
#    blocking quality rule? (no local raw data needed)
npm run warehouse:refresh:validate

# 3. Publish to the branch. After a successful branch-load, v3
#    automatically runs the WS9 quality gate -- a BLOCKING rule failure
#    marks the run "promotion_blocked" (exit 1), not "succeeded", and
#    freshness is only updated after a genuinely promoted run.
node warehouse/scripts/orchestration/refresh_engine_v3.mjs --execute --branch-load
```

Useful filters (all v3): `--jurisdiction=NSW|VIC|QLD|SA|WA|ALL`,
`--domain=<category>` (maps onto the registry's `category` field —
sales/rent/supply/geography/census/macro/snapshot/correspondence/
population/lineage), `--dataset=<id>[,<id>...]`,
`--affected-by=<dataset_id>` (dependency-aware: selects every downstream
dataset that transitively depends on the one named — a geography change
correctly pulls in everything built on it; a rate change only pulls in
the 2 snapshot datasets that use it), `--stale` (queries
`meta.dataset_freshness_status` via the registry's `meta_dataset_ids`
cross-reference — NOT every registry entry has this mapping yet, see
`sprint12_ws10_refresh_engine_report.md`), `--changed-only`.

`npm run warehouse:refresh:status` prints the last recorded v3 run.
Every run still writes v2's own state to
`warehouse/data/local/refresh_runs/<run_id>.json` (gitignored).

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

## Data quality checks (Sprint 12 WS9)

```bash
npm run warehouse:quality:check              # dry run, prints results, persists nothing
node warehouse/scripts/quality/run_quality_check.mjs --execute   # persists to meta.data_quality_run/result, opens/resolves incidents
npm run warehouse:quality:report              # aggregate summary (freshness, incidents, quarantine, confidence/lineage completeness)
npm run warehouse:incidents                   # open incidents + quarantine summary, read-only
```

35 active rules across 16 generic rule families (registered in
`warehouse/scripts/quality/rule_catalogue.mjs` — adding coverage for a
new dataset means adding a row there, not writing a new script). A
BLOCKING rule failure should stop promotion; ADVISORY failures stay
visible via `meta.data_incident` but never block. Re-running the same
check twice does not duplicate incidents (enforced by a database-level
partial unique index, not application logic) — an incident's
`occurrence_count` increments instead. If a rule finds real bad data:
quarantine it (`data_quality_status = 'quarantined'` on the fact row,
never `DELETE`), record a `meta.data_quarantine_summary` row, and fix any
downstream mart rows the bad data had corrupted — see
`warehouse/scripts/quality/quarantine_future_dated_sales.mjs` for the
worked example.

## Field-level lineage (Sprint 12 WS8)

```bash
node warehouse/scripts/lineage/build_metric_lineage_registry.mjs --execute   # (re-)populate meta.metric_lineage_registry
npm run warehouse:lineage:check               # "no mart metric may be considered publishable if mandatory lineage is absent"
```

Adding a new dataset that feeds a published metric requires a
corresponding row in `warehouse/scripts/lineage/rule_catalogue.mjs`'s
counterpart, `build_metric_lineage_registry.mjs`'s `REGISTRY_ROWS` —
`validate_metric_lineage_completeness.mjs` will otherwise flag the gap on
its next run. Query "About this metric" for a specific geography/metric
via `warehouse/scripts/lineage/lineage_service.mjs`'s `getMetricLineage()`,
or the public `GET /api/v1/metrics/:geographyId/:martTable/:metricFamily`.

## The public API (Sprint 12 WS11)

`/api/v1/*` — gated behind `PUBLIC_API_V1_ENABLED` (independent of the
internal `/research` UI's `WAREHOUSE_PREVIEW_ENABLED`). Full contract:
`warehouse/docs/PUBLIC_API_V1_CONTRACT.md`. Every endpoint reads through
a hand-reviewed `public` schema view/function — the same audited
architecture the internal UI already uses, not a new access model.

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
| `SCENARIO_LAB_ENABLED` | `/research/scenario` (built Sprint 12 WS7) |
| `PUBLIC_API_V1_ENABLED` | `/api/v1/*` (built Sprint 12 WS11; independent of `WAREHOUSE_PREVIEW_ENABLED`) |

## Security posture (see `WAREHOUSE_SECURITY_DECISION.md`, WS17; re-audited Sprint 12 WS14)

RLS is deliberately disabled on all `core`/`mart`/`meta`/`staging` tables
(53 as of Sprint 12, up from 44 at WS17) — don't "fix" this by enabling
RLS in response to the Supabase advisor. The actual boundary is schema
visibility: `anon`/`authenticated` have zero grants on those four
schemas (re-verified live, Sprint 12 WS14 — every table added this
sprint correctly inherited the boundary); only a curated `public.*`
surface (11 views, 10 functions as of WS14, up from 8/7) is reachable,
each with limits enforced inside the function/view itself, every
`SECURITY DEFINER` function with a fixed `search_path`. If the Supabase
advisor flags `security_definer_view` or
`anon_security_definer_function_executable` on any of these, that's the
design working as intended, not a regression — see
`database_security_audit.md` (WS17), `sprint11_ws20_migration_audit_report.md`
(WS20), and `sprint12_ws14_security_audit_report.md` (WS14, which also
added CORS headers to `/api/v1/*` — a real gap the earlier audits
predate, since the public API surface didn't exist yet).

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

## Reports index (Sprint 12)

Master report: `sprint12_foundation_block_report.{md,json}` (WS3/4/6/8/9/10).

| workstream | report |
|---|---|
| WS1 | `national_coverage_audit.{md,json}` |
| WS2 | `sprint12_ws2_tas_act_nt_report.md` |
| WS3 | `sprint12_ws3_demand_supply_report.md` |
| WS4 | `sprint12_ws4_boundary_reconciliation_report.md` |
| WS5 | `sprint12_ws5_evidence_catalogue_report.md`, `evidence_catalogue_report.md` |
| WS6 | `sprint12_ws6_national_market_marts_report.md` |
| WS7 | `sprint12_ws7_scenario_lab_report.md` |
| WS8 | `sprint12_ws8_data_lineage_report.md` |
| WS9 | `sprint12_ws9_data_quality_report.md`, `sprint12_cross_border_anomaly_report.md` |
| WS10 | `sprint12_ws10_refresh_engine_report.md`, `sprint12_refresh_engine_report.md` |
| WS11 | `sprint12_ws11_public_api_v1_report.md` |
| WS12 | `sprint12_ws12_research_interface_report.md` |
| WS13 | `sprint12_ws13_export_reproducibility_report.md` |
| WS14 | `sprint12_ws14_security_audit_report.md` |
| WS15 | `sprint12_ws15_performance_report.md` |
| WS16 | `sprint12_ws16_testing_report.md` |
| WS17 | this file, plus `sprint12_ws17_documentation_report.md` |
| known gaps / capacity / quality summary | `sprint12_foundation_known_gaps.md`, `sprint12_foundation_capacity_report.md`, `sprint12_quality_summary.md` |
