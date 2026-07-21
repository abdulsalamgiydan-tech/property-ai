# Cross-Census Harmonisation Method (Sprint 11, Workstream 4)

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

## Scripts

- `warehouse/scripts/geography/build_cross_census_harmonisation.mjs` —
  local-only build (downloads already done manually this sprint; script
  parses and converts). No Supabase connection.
- `warehouse/scripts/geography/validate_cross_census_harmonisation.mjs` —
  read-only validation against the branch's live 2021 population.
- Branch promotion is a separate, explicit UPSERT step (see
  `warehouse/reports/cross_census_harmonisation_branch_load_report.json`
  once run) — following the same no-DELETE, ON CONFLICT DO UPDATE pattern
  used throughout this project.
