# NSW Rental Bonds Branch Load Report (Sprint 6, Part E)

Generated: 2026-07-20 (run details: `nsw_rental_bonds_branch_load_report.json`)
Source: local DuckDB store `nsw_rents.duckdb` (validated PASSED), curated summary only.
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after commit). **Frontend changed: NO.** Migration 009 applied to the branch only.
**Raw sheet rows loaded to branch: NO** — only the 28,139-row curated summary was promoted.

## Pilot scope

LGAs: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour.
Quarters: 15 (2021-Q1 to 2024-Q2, and 2026-Q1; Sep 2024/Mar 2025 excluded as
CMS soft-404 artefacts, not real data — see source manifest).

## Loaded (branch core + mart)

| table | rows | notes |
|---|---|---|
| `core.fact_rental_market_summary` | 28,139 | LGA 2,661 + POA 25,478; 0 rows skipped (every summary geography matched `core.dim_geography`) |
| `mart.postcode_rent_quarterly` | 4,649 | direct from POA-grain facts (DCJ's native fine grain) |
| `mart.suburb_rent_quarterly` | 3,305 | **derived** — DCJ never publishes at suburb (SAL) grain; built by chaining the existing SA1→POA and SA1→SAL dwelling-weighted correspondence (Sprints 2-3) into a POA→SAL weight, then taking a weighted average of contributing postcodes' median rents. Published only where combined POA coverage ≥ 30%. `correspondence_method = 'poa_to_sal_dwelling_weighted'`. |

## Blocking gates (in-transaction, re-verified independently after commit)

Duplicate fact grain **0** · NULL `geography_id` **0** · negative rent **0** · orphan geography ids **0**
· yield rows published without an insufficient-confidence label where required **0** · duplicate yield grain **0**.

## Notes on the derived suburb rent figures

The weighted-average-of-postcode-medians approach is an approximation — DCJ does not
publish record-level rent data, so a true recomputed suburb median isn't possible from
this source. This is documented in each row's `source_summary` (`method:
weighted_average_of_postcode_medians`, plus the POA weight coverage achieved) and in
`correspondence_method`. Postcode-level figures (`mart.postcode_rent_quarterly`) are
DCJ's own direct numbers and carry no such approximation.

## Capacity

Branch DB now **1,596 MB**.

## Next step

See `nsw_yield_pilot_report.md` for the gross-yield results.
