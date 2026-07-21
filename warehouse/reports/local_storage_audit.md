# Local Storage Audit (Sprint 11, Workstream 7)

Generated: 2026-07-21T20:25:18.941Z

**Grand total: 9865.89 MB** across `warehouse/data/{raw,processed,local}` (all gitignored).

## By zone

### raw/ — 1680.4 MB, 295 files

| dataset | files | size (MB) |
|---|---|---|
| census | 6 | 566.66 |
| asgs | 13 | 529.71 |
| nsw_sales | 54 | 330.65 |
| census_2016 | 2 | 117.16 |
| nsw_rents | 15 | 50.78 |
| building_approvals | 1 | 26.18 |
| sa_rents | 71 | 24.77 |
| wa_rents | 116 | 21.4 |
| qld_rents | 1 | 5.96 |
| abs_correspondence | 5 | 3.42 |
| vic_rents | 2 | 1.73 |
| abs_regional_population | 2 | 1.38 |
| vic_sales | 4 | 0.48 |
| rba_rates | 3 | 0.12 |

### processed/ — 6374.55 MB, 149062 files

| dataset | files | size (MB) |
|---|---|---|
| census | 645 | 3068.14 |
| nsw_sales | 148072 | 1487.89 |
| asgs | 105 | 1197.09 |
| census_2016 | 240 | 621.43 |

### local/ — 1810.89 MB, 32 files

| dataset | files | size (MB) |
|---|---|---|
| asgs_2021.duckdb | 1 | 667.26 |
| asgs_geography.parquet | 1 | 492.9 |
| nsw_sales.duckdb | 1 | 410.51 |
| nsw_sales_transactions.parquet | 1 | 134.73 |
| census_2021.duckdb | 1 | 37.51 |
| nsw_sales_summary.parquet | 1 | 25.74 |
| nsw_rents.duckdb | 1 | 10.26 |
| qld_rents.duckdb | 1 | 5.01 |
| building_approvals.duckdb | 1 | 4.51 |
| wa_rents.duckdb | 1 | 3.01 |
| asgs_correspondence.parquet | 1 | 2.8 |
| vic_rents.duckdb | 1 | 2.51 |
| cross_census_harmonisation.duckdb | 1 | 2.01 |
| correspondence_dwelling_weights.parquet | 1 | 1.88 |
| census_dwelling_stock.parquet | 1 | 1.64 |
| census_household_tenure.parquet | 1 | 1.29 |
| census_demographics.duckdb | 1 | 1.01 |
| national_population.duckdb | 1 | 1.01 |
| sa_rents.duckdb | 1 | 1.01 |
| nsw_rental_summary.parquet | 1 | 0.84 |
| qld_rental_summary.parquet | 1 | 0.68 |
| rba_rates.duckdb | 1 | 0.51 |
| vic_sales.duckdb | 1 | 0.51 |
| vic_rental_summary.parquet | 1 | 0.37 |
| census_demographics.parquet | 1 | 0.33 |
| wa_rental_summary.parquet | 1 | 0.28 |
| building_approvals.parquet | 1 | 0.27 |
| sa_rental_summary.parquet | 1 | 0.21 |
| sa2_population_2001_2025.parquet | 1 | 0.17 |
| vic_sales_summary.parquet | 1 | 0.06 |
| sa2_population_growth.parquet | 1 | 0.05 |
| rba_interest_rates.parquet | 1 | 0.01 |


## .gitignore coverage check

| check | result |
|---|---|
| blanket `warehouse/data/` rule present | true |
| extensions found on disk | cpg, csv, dat, dbf, duckdb, parquet, prj, sbn, sbx, shp, shx, txt, xls, xlsx, xml, zip |
| extensions not explicitly covered (irrelevant if blanket rule present) | none |
| git-tracked file count under warehouse/data/ | 0 |
| **effectively covered** | **true** |
| **git check passed (0 tracked files)** | **true** |

## Reclaimable space

**6374.55 MB** in `warehouse/data/processed/` — warehouse/data/processed/ (extraction scratch space) can be safely deleted and re-derived from warehouse/data/raw/ if ever needed again, since every processed dataset already has a corresponding built output in warehouse/data/local/. See plan_local_cleanup.mjs for the actual cleanup plan — this script only identifies the candidate, it does not delete anything.
