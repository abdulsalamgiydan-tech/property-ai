# VIC Sales Local Store Report (Sprint 10, Phase 5)

Generated: 2026-07-21T10:09:38.109Z

Scope: Victoria VPSR sales local store (warehouse/data/local/vic_sales.duckdb), suburb (SAL) grain, Q4 2025 release

## Summary

| metric | value |
|---|---|
| total summary rows | 7145 |
| unresolved locality count | 39 |
| carried-forward (no-sales) rows | 76 |

### By dwelling type

| dwelling_type | rows | geographies |
|---|---|---|
| apartment_unit | 2220 | 419 |
| detached_house | 3860 | 735 |
| residential_land | 1065 | 206 |

### Geography confidence distribution

| confidence | rows |
|---|---|
| alias | 1495 |
| direct | 5305 |
| unresolved | 345 |

## Validation gates

| gate | result |
|---|---|
| duplicate summary grain | 0 |
| negative prices | 0 |
| missing required dates | 0 |
| geography mapping confidence present on every row | true |
| transaction rows promoted to Supabase | false |
| raw/local files tracked by git | false |
| **all gates pass** | **true** |

## Notes

- VPSR is a pre-aggregated median-price product (no individual transactions), so there is no transactions table and no transaction-level duplicate-key gate for VIC — this differs structurally from NSW and is documented, not a gap.
- geography_confidence: direct/alias rows are used in downstream marts; unresolved rows are retained in the local store (never dropped) but excluded from anything promoted to Supabase, per warehouse/config/vic_locality_aliases.yml.
- carried_forward_no_sales rows have median_sale_price=NULL (never the stale carried-forward source figure) — see the '*' flag handling in build_vic_sales_local_store.mjs.
