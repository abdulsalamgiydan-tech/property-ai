# Building Approvals Source Manifest (Sprint 4)

Generated: 2026-07-20T08:26:00.812Z
Statuses: 1 discovered, 2 out_of_scope.

Primary source: **ABS Data API**, dataflow `BA_SA2` v2.0.0 — "Building Approvals by
SA2 and above, from July 2021 onwards". SA2 is the current ASGS Edition 3 grain,
directly joinable to `core.dim_geography` without an edition mismatch.

Scope for this sprint: dwelling units approved (MEASURE=1), Total Sectors (SECTOR=9),
New work only (WORK_TYPE=1), Houses / Total Other Residential / Total Residential
(BUILDING_TYPE=110/150/100). Value of building jobs (MEASURE=2) is catalogued under
`variables_deferred` but not loaded.

Policy: official ABS Data API only, explicit dimension key (never a wildcard bulk
export); raw pulls land in `warehouse/data/raw/building_approvals` (gitignored). Full details:
`building_approvals_source_manifest.json`.

| dataset_id | access | geography | status |
|---|---|---|---|
| building_approvals_sa2_2021 | api | SA2 | discovered |
| building_approvals_ba_lga2021 | api_dataflow_alternative | LGA (2021 boundaries) | out_of_scope |
| building_approvals_ba_sa2_2016-21 | api_dataflow_alternative | SA2, 2016 boundaries, superseded by BA_SA2 v2.0.0 | out_of_scope |

## Verification evidence

- ABS Data API dataflow list (`/rest/dataflow/ABS?detail=allstubs`): `BA_SA2`
  version `2.0.0` present.
- ABS Data API datastructure (`/rest/datastructure/ABS/BA_SA2?references=children`):
  dimension order `MEASURE.SECTOR.WORK_TYPE.BUILDING_TYPE.REGION_TYPE.REGION.FREQ` confirmed; all required
  codes present in the live codelists (MEASURE, SECTOR/CL_BA_OWNERSHIP, WORK_TYPE,
  BUILDING_TYPE, REGION_TYPE).
- Sample data pull (2026-02–2026-03) returned 2,458 of 2,473 backbone SA2s reporting
  for Houses/New/Total-Sectors — the gap is SA2s with genuinely zero approvals that
  month (ABS omits zero rows rather than publishing explicit zeros), not a boundary
  mismatch.

## Next actions

- Review this manifest, then run `build_building_approvals_local_store.mjs` to pull
  the full July 2021–latest series via the explicit filter key
  `1.9.1.110+150+100.SA2..M` and build the local DuckDB store. No Supabase contact until
  the branch-load step.
