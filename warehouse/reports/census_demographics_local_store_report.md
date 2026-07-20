# Census Demographics Local Store Report (Sprint 9, Phase 2)

Generated: 2026-07-20T19:13:45.762Z
Store: `warehouse/data/local/census_demographics.duckdb` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

## Source verification

Official ABS sources verified (per `census_demographics_source_manifest.json`
live_verification): **true**.
Raw/local data files tracked by git: **0** ✅

## Coverage

| geography_type | rows | matched to core.dim_geography |
|---|---|---|
| POA | 2643 | 2641 |
| SAL | 15352 | 15334 |

Unmatched: **20** (tolerance 30 — expected special/
offshore/no-usual-address pseudo-codes with no geometry, same pattern seen in every
prior sprint's geography join).

## Checks

| check | value |
|---|---|
| duplicate natural keys | 0 |
| negative population | 0 |
| negative households | 0 |
| negative income | 0 |
| NULL geography_id on a publishable row, EXCLUDING expected ABS special codes (Migratory/Offshore/No-usual-address, suffix 9494/9797) | 0 |
| invalid census_year (must be 2021) | 0 |
| rows not labelled direct_or_derived='direct' | 0 |
| rows with NULL total_population (kept NULL, not zero) | 0 |
| rows with NULL median_weekly_household_income (kept NULL, not zero) | 0 |

## population_2016 / population_growth_2016_2021_pct

Intentionally **not populated** this sprint — 2016 Census SAL/POA boundaries (ASGS Ed.1)
do not align with the 2021 boundaries (ASGS Ed.3) this warehouse's geography backbone
uses. See the source manifest's `census_population_2016_comparison` entry for the full
scope decision. Left NULL rather than approximated across mismatched boundaries.

- Every row is direct_or_derived='direct' — G01/G02/G35 are native SAL/POA GCP DataPack tables, no ASGS correspondence weighting used or needed.
- Missing/unpublished cells stay NULL (never zero-filled) — see null_population_kept_null / null_income_kept_null counts for how many rows have a genuinely NULL measure (typically very small/zero-population localities where ABS suppresses or does not compute a cell).
- Census self-reported median rent/mortgage (G02) are stored as census_median_weekly_rent / census_median_monthly_mortgage — kept distinct from the DCJ administrative rent series and the RBA-rate-based repayment estimate elsewhere in the warehouse; never blended into the same column.
