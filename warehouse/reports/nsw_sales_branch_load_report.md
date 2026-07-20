# NSW Sales Branch Load Report (Sprint 5 Pilot, Part F)

Generated: 2026-07-20 (run details: `nsw_sales_branch_load_report.json`)
Source: local DuckDB store `nsw_sales.duckdb` (validated PASSED), curated summary only.
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after commit). **Frontend changed: NO.** Migration 008 applied to the branch only.
**Raw transactions loaded to branch: NO** — the full 211,266-row transaction
history stays in the local DuckDB store; only 34,866 pre-aggregated summary rows
were promoted.

## Pilot scope

LGAs: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour
(suburb/postcode allow-list derived spatially from the ASGS backbone: 236 SALs,
63 POAs — see `warehouse/metadata/nsw_sales_pilot_sals.json` / `_pilot_poas.json`).
Years: 2021 to current (2026-07-20, 29 published weeks).

## Loaded (branch core + mart)

| table | rows | notes |
|---|---|---|
| `core.fact_residential_sales_summary` | 34,866 | 30,827 monthly + 4,039 annual; SAL 24,795 / POA 10,071; 0 rows skipped (every summary geography matched `core.dim_geography`) |
| `mart.suburb_sales_monthly` | 21,829 | |
| `mart.suburb_sales_annual` | 2,966 | 228 distinct suburbs represented (of 236 pilot SALs — remainder had zero qualifying sales, expected for very small/industrial localities) |
| `mart.postcode_sales_monthly` | 8,998 | |
| `mart.postcode_sales_annual` | 1,073 | |

Marts were built directly from the branch-resident fact table (no SA1/SA2
correspondence apportionment needed — this source is natively at SAL/POA grain
via suburb-name/postcode text matching, unlike the Census/Building-Approvals
loads which start at SA1/SA2).

## Blocking gates (in-transaction, re-verified independently after commit)

Duplicate fact grain **0** · NULL `geography_id` **0** · negative median/mean
prices **0** · orphan geography ids **0** · invalid transaction counts **0**.

## Sample-size confidence distribution

| confidence | rows |
|---|---|
| high (30+) | 4,717 |
| medium (10-29) | 7,238 |
| low (5-9) | 7,120 |
| insufficient (<5) | 15,791 |

Nearly half the cells are `insufficient` — expected at monthly grain for
individual suburbs/dwelling-types with genuinely low transaction volume; medians
for these cells are still published (per the task spec) but consumers must
check `sample_size_confidence` before treating them as reliable. Annual-grain
cells have materially larger samples and skew toward `medium`/`high`.

## Sanity check

`median_sale_price` across all suburb-monthly rows ranges **$10,000 – $3,015,000**
— no absurd values reached the marts (the local build's non-market/nominal and
IQR-outlier flagging did its job upstream).

## Next step

Sprint 5 remains a **pilot** (6 of ~128 NSW LGAs). Options: expand to all of NSW
2001-current (the parsing/classification/flagging pipeline is already proven —
this would mean processing all 35,555+ district files without the pilot filter,
still local-first with only curated summaries promoted), backfill the 1990-2000
archive, or move to yield calculation once rental data (NSW Rental Bonds) is
loaded. RLS on warehouse schemas remains undecided before anything approaches
production.
