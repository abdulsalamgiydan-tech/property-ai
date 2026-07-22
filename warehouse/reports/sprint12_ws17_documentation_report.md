# Sprint 12, Workstream 17 — Documentation and Operations

## What was done

`warehouse/docs/WAREHOUSE_OPERATIONS_RUNBOOK.md` (Sprint 11 WS21) was the
single operational entry point for this project — updated it to cover
everything Sprint 12 added, rather than leaving it Sprint-11-only and
letting operators discover the new systems by reading source code:

- **Refresh workflow**: now documents `refresh_engine_v3.mjs` as the
  normal entry point (wraps v2, adds the WS9 quality gate + freshness
  updates), including the new `--domain=`/`--affected-by=`/`--stale`
  filters and `warehouse:refresh:validate`/`:status` npm scripts.
- **New "Data quality checks" section** (WS9): the 3 npm scripts, the
  "adding a new rule means one row in the catalogue" principle, the
  idempotent-incident/quarantine-not-delete operational model.
- **New "Field-level lineage" section** (WS8): how to (re-)populate the
  registry, how to check completeness, how to query "About this metric"
  for a specific geography.
- **New "The public API" section** (WS11): the flag, where the full
  contract lives.
- **Corrected stale numbers**: 44→53 internal tables, 8/7→11/10 public
  views/functions (both re-verified live during WS14, not just copied
  from an old report).
- **Feature flags table**: `SCENARIO_LAB_ENABLED` updated from "not
  built yet" to built (WS7); added `PUBLIC_API_V1_ENABLED` (WS11).
- **New Sprint 12 reports index** — every workstream's report, verified
  to actually exist on disk before listing it (not assumed from memory).

## Validation

- Verified every cross-referenced doc/report path in the runbook update
  actually exists on disk (`ls`/`test -f`, not assumed).
- `npm test`/`lint`/`build`: unaffected (documentation-only change).
- Production: unaffected.

## Documentation this project now has, end to end

A reader starting from `WAREHOUSE_OPERATIONS_RUNBOOK.md` can reach: the
refresh engine (v2 + v3), the quality/lineage/freshness systems, the
public API contract, the reproducibility guide, the security decision
record, the scheduling design, and every workstream's individual report
— the runbook is genuinely the single entry point it claims to be, not
an aspirational one.

## Exact next workstream

WS18 — final validation and delivery (the last workstream of the Sprint
12 mission).
