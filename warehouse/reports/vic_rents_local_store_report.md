# VIC Rents Local Store Report (Sprint 10, Phase 6)

Generated: 2026-07-21T10:14:55.574Z

Scope: Victoria rental local store (warehouse/data/local/vic_rents.duckdb) — dual grain: suburb (SAL, resolved subset) + LGA (fallback, full-state)

## Summary

| metric | value |
|---|---|
| total summary rows | 150709 |
| unresolved suburb (SAL) localities | 67 |
| unresolved LGA localities | 3 |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
| LGA | alias | 2224 | 3 |
| LGA | direct | 44934 | 73 |
| LGA | unresolved | 2152 | 0 |
| SAL | alias | 16826 | 24 |
| SAL | direct | 37081 | 55 |
| SAL | unresolved | 47492 | 0 |

## Validation gates

| gate | result |
|---|---|
| duplicate rental grain | 0 |
| negative rents | 0 |
| invalid period values | 0 |
| geography mapping confidence present on every row | true |
| direct vs derived clearly labelled | true |
| unsupported metrics remain NULL | true |
| **all gates pass** | **true** |

## Notes

- Suburb-grain (SAL) rows come from Homes Victoria's 'Moving annual rent by suburb' — its custom town-group locality labels only map 1:1 to a single ASGS SAL for the direct+alias subset (see victoria_geography_mapping_report for the equivalent VPSR sales finding; rent-specific counts are in this report's by_grain_and_confidence breakdown).
- LGA-grain rows come from Homes Victoria's 'Quarterly median rents by LGA' and provide full-state fallback coverage where suburb grain could not be established — matches this sprint's documented Phase 6 fallback rule.
- Suppressed source cells (the literal '-' convention, confirmed live in Sprint 10 Phase 3 discovery) are mapped to NULL and never written as a row with a fabricated value — rows with both count and rent null are dropped entirely rather than stored as an empty observation.
- confidence_label is derived from the published rental_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5) wherever a count is published, which is true for every retained row in this source (unlike VPSR sales, which only publishes a count for the latest quarter).
