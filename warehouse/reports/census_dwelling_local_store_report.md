# Census Dwelling Local Store Report (Sprint 3)

Generated: 2026-07-20T06:15:41.541Z
Store: `warehouse/data/local/census_2021.duckdb` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

## Source files (hashes in `census_dwelling_download_inventory.json`)

| dataset | size (MB) | sha256 | on disk |
|---|---|---|---|
| census_gcp_lga_2021 | 13.2 | ✅ | ✅ |
| census_gcp_poa_2021 | 36.3 | ✅ | ✅ |
| census_gcp_sa1_2021 | 364.6 | ✅ | ✅ |
| census_gcp_sa2_2021 | 40.3 | ✅ | ✅ |
| census_gcp_sal_2021 | 97.9 | ✅ | ✅ |
| census_mb_counts_2021 | 14.4 | ✅ | ✅ |

Raw/local data files tracked by git: **0** ✅

## By geography level

| level | geographies | dwelling cells | tenure cells | measures | joined to ASGS | unjoined (special) | ASGS w/o census |
|---|---|---|---|---|---|---|---|
| SAL | 15352 | 122816 | 92112 | 8/8 | 15334 | 18 | 0 |
| POA | 2643 | 21144 | 15858 | 8/8 | 2641 | 2 | 0 |
| SA2 | 2472 | 19776 | 14832 | 8/8 | 2454 | 18 | 0 |
| SA1 | 61844 | 494752 | 371064 | 8/8 | 61811 | 33 | 0 |
| LGA | 565 | 4520 | 3390 | 8/8 | 547 | 18 | 0 |

## National total private dwellings by level (cross-level consistency)

| level | total private dwellings |
|---|---|
| SAL | 10,318,975 |
| POA | 10,318,990 |
| SA2 | 10,318,900 |
| SA1 | 10,318,926 |
| LGA | 10,319,010 |
| MB counts | 10,866,421 |

## Checks

| check | value |
|---|---|
| NULL geography codes | 0 |
| duplicate dwelling keys | 0 |
| duplicate tenure keys | 0 |
| negative counts (quarantined) | 0 |
| quarantined dwelling / tenure cells | 0 / 0 |
| unpublished cells kept NULL | 0 |
| MB rows / total dwellings | 368285 / 10866421 |
| dwelling-weight pairs (NULL zero-dwelling) | 227318 (5773) |
| dwelling-weight reconciliation violations (±0.001) | 0 |

- Unjoined census geographies are ABS special codes (e.g. ZZZZ 'no usual address' style rows) and Census-only outside-ASGS rows — counted, kept quarantine-free in the store, and excluded at branch load by the dim join.
- asgs_without_census counts backbone areas with no Census row (expected ~0).
- NULL value_count cells are unpublished ABS cells kept NULL — never zero-filled.
- Dwelling-weight ratios: per-source sums reconcile to 1.0 (±0.001); zero-dwelling sources stay NULL and fall back to area weights at load time.
