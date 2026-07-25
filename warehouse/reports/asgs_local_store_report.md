# ASGS Local Store Report

Generated: 2026-07-20T03:27:48.614Z
Store: local DuckDB + Parquet under `warehouse/data/local/` (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

| file | size (MB) |
|---|---|
| `warehouse/data/local/asgs_2021.duckdb` | 667.3 |
| `warehouse/data/local/asgs_geography.parquet` | 492.9 |
| `warehouse/data/local/asgs_correspondence.parquet` | 2.8 |

## Geography (`asgs_geography`)

| level | rows | quarantined | expected |
|---|---|---|---|
| GCCSA | 35 | 19 | 35 |
| LGA | 566 | 19 | 566 |
| POA | 2644 | 3 | 2644 |
| SA1 | 61845 | 34 | 61845 |
| SA2 | 2473 | 19 | 2473 |
| SA3 | 359 | 19 | 359 |
| SA4 | 108 | 19 | 108 |
| SAL | 15353 | 19 | 15353 |
| STATE | 10 | 1 | 10 |

## Correspondences (`asgs_correspondence`)

| pair | rows | quarantined | expected |
|---|---|---|---|
| SA1->LGA | 62372 | 34 | 62372 |
| SA1->POA | 65318 | 34 | 65318 |
| SA1->SAL | 73131 | 34 | 73131 |
| SA2->LGA | 3097 | 19 | 3097 |
| SA2->POA | 5904 | 19 | 5904 |
| SA2->SAL | 17496 | 19 | 17496 |

## Checks

| check | value |
|---|---|
| NULL geography codes | 0 |
| duplicate codes (non-quarantined) | 0 |
| non-quarantined rows missing geometry | 0 |
| invalid geometries (ST_IsValid) | 0 |
| zero-area geometries | 0 |
| quarantined geography rows | 152 |
| quarantined correspondence rows | 159 |
| non-quarantined NULL ratios | 0 |
| weight reconciliation violations (±0.001) | 0 |

Quarantined rows are ABS special-purpose codes (Migratory - Offshore - Shipping, No usual address, Outside Australia): no published geometry / zero Albers area. Preserved with reasons, never dropped, nothing invented.

CRS: geometry stored EPSG:4326 (transformed from GDA2020 EPSG:7844 at build); parquet geom is WKB
