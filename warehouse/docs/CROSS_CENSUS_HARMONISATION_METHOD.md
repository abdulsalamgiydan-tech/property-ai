# Cross-Census Harmonisation Method (Sprint 11 WS4, extended Sprint 12 WS4)

> **Sprint 12 WS4 update**: this document originally described a
> data-only population conversion (Sprint 11 WS4). Sprint 12 WS4 replaced
> the underlying implementation with a genuine version-aware geography
> bridge — the population figures and formula are unchanged, but the
> lineage defect Sprint 12 WS1's audit found (population_growth sharing
> the same row-level `geography_method`/`confidence_label` as the direct
> 2021 figures) is now fixed with dedicated lineage columns, and the full
> correspondence relationship (not just the final converted number) is
> now persisted to the branch as real, queryable rows — see "Sprint 12 WS4
> extension" below for what changed and why.

Resolves the Sprint 9 limitation that left `population_2016` and
`population_growth_2016_2021_pct` NULL on every row of
`mart.suburb_demographic_profile_2021` / `mart.postcode_demographic_profile_2021`
because of 2016-to-2021 ASGS boundary differences.

## Sources

- **2016 population**: ABS 2016 Census General Community Profile,
  Table G01 ("Selected Person Characteristics by Sex"), at 2016 State
  Suburb (SSC) and Postal Area (POA) grain. Downloaded live this sprint
  from `abs.gov.au/census/find-census-data/datapacks` (no bot protection,
  plain `curl` succeeded).
- **Correspondence**: ABS official 2016-to-Edition-3-(2021) geographic
  correspondence files (`CG_SSC_2016_SAL_2021.csv`,
  `CG_POA_2016_POA_2021.csv`), downloaded live from
  `abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/.../correspondences`.
  Both are population-weighted, machine-readable CSV, CC-licensed ABS
  content.
- **2021 population**: already on the branch
  (`mart.suburb_demographic_profile_2021` /
  `mart.postcode_demographic_profile_2021`, loaded Sprint 9).

## Formula

```
converted_population_2016(target_2021_geography) =
  SUM over matching 2016 source rows of (
    population_2016(source) * RATIO_FROM_TO(source -> target)
  )
  WHERE OVERALL_QUALITY_INDICATOR IN ('Good', 'Acceptable')

growth_pct = (population_2021 - converted_population_2016)
             / converted_population_2016 * 100
```

`RATIO_FROM_TO` is ABS's own population-weighted allocation factor — the
share of the 2016 source region's population that falls within the 2021
target region. `Poor`-quality correspondence rows are excluded entirely,
not down-weighted — if a target geography's *only* correspondence rows are
`Poor`, its `population_2016`/growth stays NULL rather than being computed
from an unreliable source.

## Confidence and suppression rule

A growth rate is only published where the converted 2016 population base
is **at least 50 people**. Below that threshold, percentage growth is
statistically unstable (a change from 3 to 6 people is "100% growth" but
meaningless) — this mirrors this project's established small-cell caution
(Sprint 9's ABS Census small-cell-perturbation handling). Suppressed rows
keep `population_2016` NULL, not a fabricated or interpolated value.

## Validation performed

- **Reconciliation**: converted 2016 population summed across all target
  geographies reconciles to **100.00%** of the true national 2016 Census
  population, for both SAL (23,401,518) and POA (23,401,861) — proving the
  correspondence weights and join logic are correct, not merely plausible.
- **Coverage**: 15,352 of ~15,353 known SAL geographies and 2,644 of 2,644
  known POA geographies received a converted 2016 value.
- **Live match against 2021**: 15,333 of 15,334 live branch SAL rows and
  2,641 of 2,641 live branch POA rows matched a converted 2016 value.
- **Spot check**: the 5 largest SAL geographies by 2021 population were
  individually inspected — all produced plausible, directionally sensible
  growth figures (double-digit growth for fast-growing outer-metro
  corridors, consistent with known 2016-2021 Australian population trends).

## What this does NOT do

- Does not touch 2016 or 2021 SA1/SA2/LGA correspondence, which were also
  downloaded this sprint (`CG_SA1_2016_SA1_2021.csv`,
  `CG_SA2_2016_SA2_2021.csv`, `CG_LGA_2016_LGA_2021.csv`) but not yet used
  — reserved for Workstream 9's SA2/LGA-level marts.
- Does not attempt household or dwelling growth this pass — only total
  population. Household/dwelling growth would need the same treatment
  applied to different G01 columns, not built this sprint.
- Does not modify the 2021 population figures themselves — only fills the
  previously-NULL 2016 comparison point.

## Scripts (Sprint 11 originals — superseded, kept for history)

- `warehouse/scripts/geography/build_cross_census_harmonisation.mjs` —
  local-only build (downloads already done manually this sprint; script
  parses and converts). No Supabase connection.
- `warehouse/scripts/geography/validate_cross_census_harmonisation.mjs` —
  read-only validation against the branch's live 2021 population.
- Branch promotion is a separate, explicit UPSERT step (see
  `warehouse/reports/cross_census_harmonisation_branch_load_report.json`
  once run) — following the same no-DELETE, ON CONFLICT DO UPDATE pattern
  used throughout this project.

## Sprint 12 WS4 extension — a genuine version-aware geography bridge

### What changed

Sprint 11 WS4's scripts computed `population_2016`/`population_growth_2016_2021_pct`
entirely inside a local DuckDB store and only ever pushed the *final
converted numbers* to the branch via a plain `UPDATE` — the correspondence
relationship itself (which 2016 source rows contributed, at what weight,
what quality) never left the local machine. That made the population
figures real and correct, but meant the branch had no queryable record of
*how* they were derived — exactly the gap Sprint 12 WS1's audit flagged.

Sprint 12 WS4 persists the full relationship to the branch:

1. **`core.dim_geography_version`**: 2 new rows, `SSC_ABS_2016` and
   `POA_ABS_2016` — the 2016 geography editions, explicitly dated
   (`valid_from`/`valid_to`), distinct from `SAL_ASGS3_2021`/`POA_ASGS3_2021`.
2. **`core.dim_geography`**: every distinct 2016 SSC and 2016 POA source
   geography referenced by the correspondence files (15,304 SSC + 2,670
   POA), `is_current = false`, `boundary_version = 'ABS_2016'`, no
   geometry (these are correspondence-only rows, never rendered — the
   existing `is_current` filter used everywhere else in this codebase,
   confirmed by grep before writing the loader, keeps them invisible to
   every other query).
3. **`core.bridge_geography_correspondence`**: every 2016→2021
   correspondence row **at every quality level** (18,616 rows:
   15,735 SSC→SAL + 2,881 POA→POA) — `Poor`-quality rows are preserved
   with their `quality_label`, not silently dropped; only excluded from
   the *derived population figure* (unchanged from Sprint 11's rule).
   Extended with 3 new columns (migration 027): `quality_label` (the raw
   ABS label, not just a numeric score), `reconciliation_residual_pct`
   (per-source: how much of this 2016 geography's population is captured
   at Good/Acceptable quality vs its full published total), and
   `source_dataset_id`. A natural-key uniqueness constraint (migration
   028) was added since none existed — re-running the loader is
   idempotent (`ON CONFLICT DO NOTHING`).
4. **The lineage fix** (migration 027): `mart.suburb_demographic_profile_2021`
   / `postcode_demographic_profile_2021` gained 4 new columns —
   `population_growth_method` (always `'derived'`), `population_growth_confidence`,
   `population_growth_correspondence_version`, `population_growth_source_dataset_id`
   — dedicated to the growth metric specifically, **never** the same
   value as the row's `geography_method`/`confidence_label` (which
   continue to describe the directly-published 2021 figures, unchanged).
   Verified live, not just asserted: `validate_2016_2021_geography_bridge.mjs`
   checks `population_growth_method != geography_method` for every row.

### Special/non-spatial codes — handled explicitly, not silently dropped

Inspecting every row that didn't fit the expected shape (rather than
filtering blindly) found 3 genuine categories, none of which represents a
parsing defect:

1. **NULL source code**: a 2021 target with no 2016 predecessor at all
   (e.g. a new SAL, "Prince Regent River") or ABS's "Outside Australia"
   placeholder (`ZZZZZ`/`ZZZZ`).
2. **NULL target code**: a 2016 source's tiny unallocated residual (as
   small as 0.00005% of its population) that ABS itself could not
   confidently assign to a single 2021 target.
3. **Non-spatial pseudo-geographies**: `SAL`/`POA` codes ABS assigns to
   "No usual address (`<state>`)" and "Migratory - Offshore - Shipping
   (`<state>`)" — one per jurisdiction. These were never part of the ASGS
   geography backbone this project loaded in Sprint 2-4 (no boundary, no
   geometry, correctly excluded then) — the bridge stays consistent with
   that by excluding them too, rather than unilaterally introducing
   geography rows nothing else in the platform recognises.

All 3 categories are logged explicitly by the build script (which target/
source codes, how many rows) rather than disappearing via a silent
`WHERE ... IS NOT NULL`. Excluding them dropped the naive national
reconciliation figure from a misleadingly-perfect 100.00% to a more
honest **99.80%** — the 0.20% gap is exactly the "no fixed address" /
migratory population that genuinely cannot be geographically attributed,
not a defect.

### Validated

- **National reconciliation**: SAL and POA both 99.80%, within the
  documented ±0.5% tolerance (`build_2016_2021_geography_bridge.mjs`
  refuses to proceed to branch load if outside tolerance).
- **Duplicate natural keys**: 0 (enforced by a real DB constraint,
  migration 028, not just a report claim).
- **Orphan geographies**: 0 source, 0 target (source enforced by a real
  FK to `core.dim_geography`; target independently re-verified).
- **Invalid weights**: 0 (`population_weight` outside `[0, 1.01]`).
- **Lineage completeness**: 100% of populated `population_growth_2016_2021_pct`
  values carry all 4 lineage fields (0 rows found missing any of them).
- **Split geography manually verified**: `SSC_12199_ABS_2016` (a Snowy
  Mountains 2016 locality) splits into 9 real 2021 SALs — Thredbo
  (80.5%), Perisher Valley (14.4%), and 7 near-zero-population
  wilderness slivers — ratios sum to 0.9999999. Plausible and correct: a
  known alpine-resort area where 2016's single locality was subdivided
  into the individual named villages by 2021.
- All of the above independently re-queried against the **committed**
  branch after `COMMIT`, not read from the load script's own report (see
  `validate_2016_2021_geography_bridge.mjs`).

### Deferred, not attempted this pass

- SA2-grain 2016→2021 correspondence (`CG_SA2_2016_SA2_2021.csv`,
  already downloaded, not yet used) — SAL/POA are this project's primary
  residential research grains; SA2 remains available for a future
  validation cross-check.
- Household/dwelling growth (only total population converted, matching
  Sprint 11 WS4's original scope).

### Current scripts

- `warehouse/scripts/geography/build_2016_2021_geography_bridge.mjs` —
  local-first, no Supabase connection, refuses to proceed if national
  reconciliation falls outside tolerance.
- `warehouse/scripts/geography/load_2016_2021_geography_bridge_to_branch.mjs` —
  dry-run default, one transaction, blocking gates, idempotent.
- `warehouse/scripts/geography/validate_2016_2021_geography_bridge.mjs` —
  read-only, independent re-query of the committed branch.
