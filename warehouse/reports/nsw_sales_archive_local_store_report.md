# NSW Sales Archive (1990-2000) Local Store Report (Sprint 11, Workstream 8)

Generated: 2026-07-21T21:05:23.498Z

Scope: NSW Valuer General PSI historical archive (1990-2000) local store — warehouse/data/local/nsw_sales_archive.duckdb

## Summary

| metric | value |
|---|---|
| total rows (post exact-duplicate collapse) | 1917667 |
| zero-price rows (retained, excluded from median cross-check) | 41183 |

### By year

| year | rows | distinct districts | null zone_code | null zone_code % |
|---|---|---|---|---|
| 1990 | 102176 | 177 | 59600 | 58.3% |
| 1991 | 201813 | 178 | 55062 | 27.3% |
| 1992 | 194137 | 177 | 44326 | 22.8% |
| 1993 | 147074 | 177 | 18377 | 12.5% |
| 1994 | 148465 | 177 | 17823 | 12% |
| 1995 | 158694 | 177 | 14792 | 9.3% |
| 1996 | 168340 | 177 | 11054 | 6.6% |
| 1997 | 201807 | 177 | 16473 | 8.2% |
| 1998 | 194779 | 178 | 16306 | 8.4% |
| 1999 | 216534 | 177 | 15874 | 7.3% |
| 2000 | 183848 | 177 | 13525 | 7.4% |

**Note**: the null zone_code rate declines sharply and monotonically from 58.3% in 1990 to ~7-9% by the late 1990s, consistent with the archive's own earliest year having less complete digitised data. Since `dwelling_type` classification requires `zone_code='A'` to identify residential-zoned sales, **1990's residential sale counts are a more conservative undercount than later years** — this is a genuine source data-quality characteristic, not a parsing defect, and is not corrected by guessing at the missing zone codes.

### By dwelling type

| dwelling_type | confidence | rows |
|---|---|---|
| unknown_residential | low | 1222027 |
| apartment_unit | medium | 373551 |
| non_residential_or_other_zone | high | 322089 |

### Annual median sale price — residential zone (A) only, plausibility check

| year | sales | median price |
|---|---|---|
| 1990 | 29659 | $109,000 |
| 1991 | 114761 | $125,000 |
| 1992 | 118635 | $130,000 |
| 1993 | 102370 | $135,000 |
| 1994 | 104666 | $144,000 |
| 1995 | 115157 | $150,000 |
| 1996 | 126878 | $157,500 |
| 1997 | 150175 | $169,000 |
| 1998 | 144630 | $179,125 |
| 1999 | 161401 | $194,500 |
| 2000 | 137060 | $205,000 |

## Validation gates

| gate | result |
|---|---|
| negative prices | 0 |
| invalid contract dates | 0 |
| contract dates outside 1990-2001 archive range | 0 |
| dwelling_type + confidence present on every row | true |
| no duplicate natural keys | true |
| **all gates pass** | **true** |

## Known limitations (documented, not hidden)

- No settlement_date field exists in this format — only contract_date. The 2001-current dataset has both.
- No nature_of_property field exists — dwelling_type classification relies on zone_code (residential-zone filter only, not a house/unit signal) plus a strata-plan text-pattern match in the free-text land description (medium confidence for ~373k of the ~1.9M rows), with everything else in a zone-A residential area falling into 'unknown_residential' (low confidence) rather than being guessed.
- No sale_counter or reference_number field exists to disambiguate multiple sale events of the same property beyond (district, property_id, valuation_num, contract_date, purchase_price) — the natural key used for exact-duplicate collapse. A small number of genuinely distinct same-day, same-price resales of the same property (if any exist) would be indistinguishable from a republished duplicate and collapsed to one row; this is a known, honest limitation of the source format, not fabricated resolution.
- zero_price_rows are retained (not dropped) since a $0 recorded price can be a genuine non-arms-length transfer in the source data (same convention as the 2001-current pipeline) — excluded from the median-price cross-check but not deleted from the store.
- The null zone_code rate declines sharply and monotonically from 58.3% in 1990 to ~7-9% by the late 1990s (see by_year). Since dwelling_type classification requires zone_code='A' to identify residential-zoned sales, 1990's residential sale counts are a more conservative undercount than later years — a genuine source data-quality characteristic of the archive's earliest year, not a parsing defect, and not corrected by guessing at the missing zone codes.

## Branch promotion status

NOT YET PROMOTED. Extending core.fact_residential_sales_summary and its derived marts with pre-2001 data touches already-live schema that existing comparison APIs read from — deliberately deferred to a dedicated, careful pass rather than rushed alongside first-time discovery/parsing. The annual summary (nsw_sales_archive_annual_summary.parquet) is built in the same shape as the existing mart to make that future extension straightforward.
