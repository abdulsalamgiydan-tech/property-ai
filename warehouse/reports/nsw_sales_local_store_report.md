# NSW Sales Local Store Report (Sprint 5 Pilot)

Generated: 2026-07-20T09:39:05.862Z
Store: `warehouse/data/local/nsw_sales.duckdb` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

Pilot LGAs: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour
(suburb/postcode allow-list derived spatially from the local ASGS backbone —
see `warehouse/metadata/nsw_sales_pilot_sals.json` / `_pilot_poas.json`).

## Source files

34 raw files hashed (all: ✅).
Raw/local data files tracked by git: **0** ✅

## Volumes

- Residential rows (pilot area): **211266** (of 218213 total matched rows;
  6947 excluded as non-residential)
- Summary rows built (monthly + annual, SAL + POA, by dwelling_type): **34866**

## By dwelling type

| dwelling_type | rows |
|---|---|
| apartment_unit | 70573 |
| detached_house | 114086 |
| residential_land | 26607 |

## Checks

| check | value |
|---|---|
| duplicate natural keys (district+property_id+sale_counter+contract_date) | 0 |
| summary duplicate keys | 0 |
| rows with no transaction date at all | 0 |
| NULL sale price | 0 |
| non-positive sale price | 0 (all flagged `missing_or_invalid`: ✅) |
| missing suburb | 0 |
| missing postcode | 304 |
| classified into a dwelling type | 211266 / 211266 (0 as `unknown_residential`, low confidence, preserved not forced) |
| flagged nominal/non-market transfers (excluded from stats) | 137 |
| flagged invalid price (excluded) | 0 |
| flagged statistical outlier (excluded) | 6162 |
| rows contributing to median/mean/quartile stats | 204967 |
| geography unmatched (excluded from marts) | 0 |

- Non-arm's-length/nominal-value transfers (price < $10,000) and IQR-based outliers per dwelling_type are flagged and excluded from median/mean/quartile statistics — never silently included, never dropped from the transaction table.
- geo_unmatched rows have neither a pilot suburb-name match nor a pilot postcode match despite being in the scanned files (e.g. a locality name variant) — excluded from marts, counted here for transparency.
- unknown_residential rows are preserved with a 'low' confidence label rather than forced into a specific dwelling type, per the no-PDF field-mapping limitation documented in the source manifest.
