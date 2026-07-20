# Market Intelligence Branch Load Report (Sprint 9, Phases 5-7)

Generated: 2026-07-20 (run details: `market_intelligence_branch_load_report.json`)
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`,
re-verified via independent MCP query after commit). **Frontend changed: NO.**

## What was loaded

| object | final row count |
|---|---|
| `meta.metric_assumption` | 7 (baseline scenario `standard_20pct_deposit_30yr_pi`) |
| `core.fact_residential_sales_summary` (new `townhouse_villa_semidetached` rows) | 12,543 |
| `mart.suburb_sales_monthly` / `_annual` (new townhouse_villa rows) | 685 / 6,793 |
| `mart.postcode_sales_monthly` / `_annual` (new townhouse_villa rows) | 582 / 4,483 |
| `mart.suburb_yield_quarterly` / `mart.postcode_yield_quarterly` (new townhouse_villa rows) | 0 / 5,052 |
| `mart.suburb_demographic_profile_2021` | 15,334 |
| `mart.postcode_demographic_profile_2021` | 2,641 |
| `mart.suburb_market_snapshot` (wide rows, `dwelling_type IS NULL`) | 15,334 |
| `mart.postcode_market_snapshot` (wide rows) | 2,641 |
| `mart.suburb_market_timeseries` | 61,603 |
| `mart.postcode_market_timeseries` | 22,641 |

Branch DB size: **2,052 MB → 2,177 MB** (+125 MB, within the 200 MB budget from
`sprint9_capacity_plan.md`).

## Scope decisions (documented, not hidden)

- **`detached_house` medians on the branch are NOT re-synced** to reflect the Phase
  3 reclassification — only the NEW `townhouse_villa_semidetached` cells were added
  (purely additive). Only 0.73% of records moved category (18,712 of 2,556,681, see
  `nsw_dwelling_type_reclassification_report.json`), so branch drift is small; a
  full historical re-sync is deferred to a future sprint.
- **"Latest 12-month" sales figures** use the ANNUAL summary row for the most
  recent calendar year with data — a genuinely recomputed median, not a
  median-of-monthly-medians (which would be statistically invalid).
- **`population_2016` / `population_growth_2016_2021_pct`** intentionally NULL —
  2016/2021 ASGS boundary mismatch, see `census_demographics_source_manifest.json`.
- **`suburb_yield_quarterly` new rows = 0** while `postcode_yield_quarterly` = 5,052:
  expected — suburb (SAL) rent is *derived* via POA→SAL correspondence and has much
  thinner per-suburb-per-quarter coverage than postcode (POA), which is the DCJ
  source's native grain; fewer SAL geographies clear the sample-size bar for a
  computable townhouse/villa yield this early after the type was introduced.

## Bug found and fixed during this load

The snapshot's `gross_yield_pct` initially came out **entirely NULL** across all
15,334 rows. Root cause: `mart.suburb_yield_quarterly`/`postcode_yield_quarterly`
rows with `dwelling_type='all'` are *always* null-yield by construction (NSW VG
sales data has no "all dwelling types" bucket to join against — only the DCJ rent
side publishes a Total/'all' category). Fixed by selecting the best-available
**real** dwelling-type yield row per geography (preferring a computed non-null
yield, then most recent quarter) instead of the always-empty `'all'` row. Verified
after the fix: yield populated for 371 suburbs, range 1.4%–7.4%, avg 3.67% —
consistent with the Sprint 6/7 pilot's plausibility check.

## Data-quality clamp (ABS small-area Census perturbation)

`renter_household_pct` / `owner_with_mortgage_pct` / `owner_outright_pct` are
computed only when total households ≥ 20 (below that, ABS's small-cell
randomisation for privacy can make subcategories not sum cleanly to the stated
total — observed directly: a 3-household total with 5 "rented" + 4 "other_tenure"
recorded). Even above that threshold, each percentage is bounded to the
mathematically valid [0,100] range — the underlying raw counts in
`core.fact_household_tenure` are never altered, only this derived, labelled
percentage column is clamped. This affected roughly 1% of SAL rows.

## Post-load gates (in-transaction, re-verified independently via MCP after commit)

Duplicate snapshot grain **0** · orphan geography **0** · negative values **0** ·
out-of-range percentages **0** · yield without confidence label **0** ·
affordability computed without price/rate/income inputs **0** · price without
sample-size label **0** · future-dated periods **0** · duplicate time-series grain **0**.

## Coverage summary (independently re-verified)

| metric | suburbs with data (of 15,334) |
|---|---|
| Sales (median 12m) | 4,080 |
| Rent | 504 |
| Yield | 371 |
| Demographics | 15,334 (full) |
| Affordability (repayment estimate) | 4,080 |

`coverage_status`: full (sales+rent both present) 500 · partial 3,584 ·
insufficient (demographics only) 11,250 — expected for NSW's many small/rural
localities with little recorded transaction or rental activity.

## Next step

Proceed to Phase 8 (data-quality/provenance validation report), Phase 9 (read-only
access security tests), then the Suburb Intelligence UI (Phase 10).
