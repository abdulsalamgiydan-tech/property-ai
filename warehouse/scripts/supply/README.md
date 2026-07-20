# Supply scripts

Scripts for loading ABS housing-supply datasets onto the ASGS geography backbone
(Sprint 4+). Manifest: `warehouse/reports/building_approvals_source_manifest.json`.

| Script | Status | Purpose |
|---|---|---|
| `discover_building_approvals_sources.mjs` | done | Verify the official ABS Data API dataflow `BA_SA2` v2.0.0 (dataflow list + datastructure + required codes) into the source manifest. No bulk data pulled. |
| `build_building_approvals_local_store.mjs` | in progress | Pull the full July 2021–latest SA2 series via an explicit SDMX dimension key (never a wildcard bulk export) into gitignored raw storage, then build the local DuckDB/Parquet store. No Supabase contact. |
| `validate_building_approvals_local_store.mjs` | in progress | Read-only validation of the local store; writes `building_approvals_local_store_report.{json,md}`. |
| `load_building_approvals_to_branch.mjs` | in progress | Branch-only load: curated recent-month + rolling-12m facts, dwelling-weighted SA2→SAL/POA correspondence, and the two supply marts (incl. approvals per 1,000 existing 2021 Census dwellings). |

Ground rules (same as geography/census scripts):

- Official ABS Data API only; every pull uses an explicit dimension key
  (`MEASURE.SECTOR.WORK_TYPE.BUILDING_TYPE.REGION_TYPE.REGION.FREQ`) — never an
  unbounded wildcard scrape.
- Raw pulls and local stores live under `warehouse/data/` (gitignored) — never in git.
- Local-first: the full monthly SA2 series stays local; only curated recent months,
  rolling-12m totals, and the two marts are promoted to the branch (branch disk is
  near capacity — see Sprint 3 notes).
- Missing data stays NULL — ABS omits zero-approval rows rather than publishing
  explicit zeros; nothing is zero-filled or invented.
- Branch loads (warehouse-validation only) happen in a separate, approval-gated step;
  these scripts never touch Supabase directly except the final loader.
