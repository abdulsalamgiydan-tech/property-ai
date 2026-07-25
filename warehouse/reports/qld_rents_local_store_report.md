# QLD Rents Local Store Report (Sprint 11, Workstream 6)

Generated: 2026-07-21T19:57:21.621Z

Scope: Queensland rental local store (warehouse/data/local/qld_rents.duckdb) — triple grain: suburb (SAL), LGA, postcode (POA)

## Summary

| metric | value |
|---|---|
| total summary rows | 341712 |
| unresolved suburb (SAL) localities | 25 |
| unresolved LGA localities | 0 |
| LGA coverage | 43 of QLD's 78 ASGS LGAs reported by RTA (source coverage gap, not an adapter defect — RTA does not publish figures for LGAs below its own reporting threshold) |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
| LGA | alias | 23345 | 43 |
| POA | direct | 123265 | 318 |
| SAL | alias | 31494 | 113 |
| SAL | direct | 156458 | 555 |
| SAL | unresolved | 7150 | 0 |

### Spot check — postcode 4000 (Brisbane CBD), all dwellings, latest quarter

```json
{
  "geography_code": "4000",
  "reference_period": {
    "days": 20544
  },
  "median_weekly_rent": null,
  "new_bond_count": 1112
}
```

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

- Suburb-, LGA-, and postcode-grain rows all come from the single RTA 'Bond statistics data' workbook (one stable URL, quarterly-updated, no bot protection).
- Median rent (sheets 4/7/1) and new-bond count (sheets 5/8/2) are separate sheets sharing identical quarter columns; joined by (locality, dwelling type, quarter) position, not by a published pairing — verified the header row (Sep2017..Jun2026) is identical across every sheet pair before joining.
- 3 suburb names (Newtown, The Gap, West End) each denote two distinct real ASGS suburbs disambiguated in the source by a postcode suffix, e.g. 'Newtown (4305)' vs 'Newtown (4350)'. Both variants strip to the same normalised name and the ASGS lookup's multi-candidate rule correctly marks both as unresolved rather than fabricating which postcode maps to which SAL.
- QLD LGA names carry a classification suffix, sometimes doubled (e.g. 'Central Highlands (R) (Qld)') — stripped via a looped trailing-paren removal, unlike VIC's single-pass version.
- Postcode-grain (POA) rows use the RTA postcode value directly as geography_code with geography_confidence='direct' — postcodes are an exact match to core.dim_geography POA codes, no name resolution needed.
- Suppressed source cells (blank string) are mapped to NULL and never written as a row with a fabricated value; rows with both count and rent null are dropped entirely.
- The bond-count sheets carry an extra 'Other' dwelling category and an 'All dwellings' aggregate that the rent sheets never publish a median for (rent sheets only break out Flat/House/Townhouse by bedroom count) — both map to an explicit dwelling_type rather than a fabricated or silently-dropped null; every row with dwelling_type='all' or 'other' will always have median_weekly_rent=NULL by construction, which is a genuine source characteristic, not a load defect.
- confidence_label is derived from the published new_bond_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5).
