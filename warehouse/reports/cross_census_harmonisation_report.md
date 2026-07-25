# Cross-Census Harmonisation Report (Sprint 11, Workstream 4)

Generated: 2026-07-21T13:28:16.921Z

## Method

Population-weighted ABS official correspondence (`RATIO_FROM_TO`),
restricted to `Good`/`Acceptable` quality rows (`Poor` excluded).
Growth rates are only published where the converted 2016 population base
is at least 50 people — below that, small-number volatility makes a
percentage misleading, so it stays NULL (matches this project's
established small-cell caution from Sprint 9).

Full methodology: `warehouse/docs/CROSS_CENSUS_HARMONISATION_METHOD.md`.

## Results

| geography | matched | publishable growth rate | suppressed (low base) |
|---|---|---|---|
| SAL (suburb) | 15333 | 10935 | 4398 |
| POA (postcode) | 2641 | 2596 | 45 |

## Reconciliation (from the local build step)

Both SAL and POA conversions reconcile to **100.00%** of the true national
2016 Census population (23,401,518 / 23,401,861 respectively) — see
`cross_census_harmonisation_local_build.json`.

## Spot check (5 largest SAL geographies by 2021 population)

- **SAL22086**: 2016 (converted) 49,913 -> 2021 66,781 (33.79%, confidence: medium)
- **SAL20661**: 2016 (converted) 50,347 -> 2021 65,178 (29.46%, confidence: medium)
- **SAL22451**: 2016 (converted) 34,562 -> 2021 56,370 (63.1%, confidence: medium)
- **SAL21640**: 2016 (converted) 47,312 -> 2021 54,941 (16.13%, confidence: medium)
- **SAL22027**: 2016 (converted) 46,578 -> 2021 54,118 (16.19%, confidence: medium)

## Status

Computed and validated locally, read-only against the branch. **Not yet
promoted** to `mart.suburb_demographic_profile_2021` /
`mart.postcode_demographic_profile_2021`'s existing (currently all-NULL)
`population_2016` / `population_growth_2016_2021_pct` columns — that
promotion is a follow-up branch-load step, applying the exact same
UPSERT-only, no-DELETE pattern established throughout this project.
