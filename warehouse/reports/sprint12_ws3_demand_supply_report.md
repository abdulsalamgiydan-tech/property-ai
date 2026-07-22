# Sprint 12, Workstream 3 — National Demand and Supply Context

## Priority gaps from the checkpoint

1. internal migration
2. dwelling commencements
3. dwelling completions
4. regional population change
5. current population estimates
6. housing supply context

## What was delivered

**Dwelling commencements and completions (priorities 2 & 3)**, a genuine
new national data source: ABS "Building Activity, Australia" (cat.
8752.0), a live quarterly publication (current release March 2026
quarter, released 8 July 2026). Discovered, verified (content-type, ZIP/
xlsx file signature, correct table titles cross-checked against cell
content, not just filename), downloaded, parsed, and loaded:

- **6,390 rows** into a new table, `core.fact_dwelling_construction_activity`
  (migration 029) — deliberately separate from `core.fact_building_approvals`
  (a different, earlier pipeline stage at a finer SAL/POA grain; this
  source only publishes commencements/completions at STATE grain, no free
  suburb-level breakdown exists).
- All 8 states/territories, both `detached_house` and `attached_dwelling`
  (ABS's own bundled units+townhouses+semis category — a new dwelling_type
  value, deliberately not reusing `apartment_unit` which means something
  narrower elsewhere in this warehouse), both `commenced` and `completed`
  stages, Original (not seasonally-adjusted) series.
- Real historical depth: commencements from Q3 1980, completions from Q3
  1969, both through Q1 2026.
- "Total Sectors" only (private+public combined); excluded "Dwellings
  excluding new residential" (alterations, not new stock) and the
  redundant "Total (Type of Building)" rows; excluded the "Australia"
  national-total column (a derivable aggregate of the 8 states, not a
  distinct geography).

## Validated (independently re-queried against the committed branch)

- 6,390 rows present ✓
- 0 negative counts ✓
- 0 duplicate natural keys ✓
- 0 orphan geographies ✓
- All 8 states/territories covered ✓
- Every row has `source_id`, `dataset_id`, `confidence_label` ✓

Spot-checked NSW March 2026 detached-house commencements (4,753) directly
against the raw extracted xlsx cell value — exact match, confirming the
column-parsing logic pulls the correct series.

## Storage impact

Branch: 2,661.5 MB → 2,663.8 MB (+2.3 MB) — negligible, well under the
3,375 MB Sprint 12 budget.

## National coverage registry updated

Re-ran `build_national_coverage_registry.mjs` (Sprint 12 WS1's generator)
— `dwelling_commencements`/`dwelling_completions` now report `available`
with real row counts and periods per jurisdiction, replacing the
`unavailable` status WS1 recorded. Generated automatically from live
state, not hand-edited.

## Deferred, documented not hidden (priorities 1, 4, 5, 6)

- **Internal migration**: live-checked ABS's "Regional internal
  migration estimates, provisional" (SA2 grain) — exists, but its
  latest-release page shows March 2021 as the most recent issue, 5+
  years stale as of this check (2026-07-22). Not confirmed still
  maintained. Not pursued further this pass — a future workstream should
  re-check for a newer edition or successor publication before building
  an adapter. This is a genuine open gap, not a licence/access blocker.
- **Regional population change**: substantially covered by Sprint 12
  WS4's 2016-2021 boundary reconciliation (population_growth_2016_2021_pct,
  now genuinely available with full lineage) — a true "current" annual
  ERP series (distinct from Census-to-Census change) was not investigated
  this pass.
- **Current population estimates / housing supply context** (as a
  distinct composite indicator): not pursued this pass, given the time
  already invested in the commencements/completions source and the
  broader Sprint 12 scope (WS6/WS8/WS9/WS10 still pending). Recorded as
  a gap, not silently dropped.

Per this project's hard-stop policy ("a missing individual dataset is not
automatically a hard stop — record the gap and continue with the
remaining valid work"), these gaps are documented rather than blocking
the rest of the Sprint 12 foundation block.

## Tests

`warehouse/scripts/supply/dwelling_construction_activity.test.ts` — 6
tests, 4 run the real build script against real local ABS files (skip
cleanly in CI, which never has the gitignored raw data), 2 structural
safety tests (production rejection, dry-run default, idempotent
ON CONFLICT, read-only validator) that always run. All 6 pass locally.

## Files

- `supabase/migrations/029_dwelling_construction_activity.sql`
- `warehouse/scripts/supply/download_dwelling_construction_activity_source.mjs`
- `warehouse/scripts/supply/build_dwelling_construction_activity_local_store.mjs`
- `warehouse/scripts/supply/load_dwelling_construction_activity_to_branch.mjs`
- `warehouse/scripts/supply/validate_dwelling_construction_activity.mjs`
- `warehouse/scripts/supply/dwelling_construction_activity.test.ts`
- `warehouse/scripts/audit/build_national_coverage_registry.mjs` (updated
  to query the new fact table + the internal-migration finding)
- `warehouse/metadata/national_coverage_registry.yml`,
  `warehouse/reports/national_coverage_audit.{md,json}` (regenerated)
- `warehouse/reports/abs_dwelling_construction_activity_download_inventory.json`
- `warehouse/reports/dwelling_construction_activity_local_build_report.json`
- `warehouse/reports/dwelling_construction_activity_branch_load_report.json`
