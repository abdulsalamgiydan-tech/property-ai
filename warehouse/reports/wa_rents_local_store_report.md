# WA Rents Local Store Report (Sprint 11, Workstream 6)

Generated: 2026-07-21T20:12:34.343Z

Scope: Western Australia rental local store (warehouse/data/local/wa_rents.duckdb) — suburb (SAL) + postcode (POA), medians computed in-house from raw bond lodgements

## Summary

| metric | value |
|---|---|
| total summary rows | 31335 |
| period range | {"min_p":"2023-03-01","max_p":"2026-05-01","month_count":39} |
| unresolved suburb (SAL) localities | 211 |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
| POA | direct | 8260 | 342 |
| SAL | alias | 4733 | 182 |
| SAL | direct | 18031 | 772 |
| SAL | unresolved | 311 | 0 |

### Spot check — postcode 6000 (Perth CBD), January 2024

```json
{
  "geography_code": "6000",
  "reference_period": "2024-01-01",
  "median_weekly_rent": 490,
  "new_bond_count": 315
}
```

## Validation gates

| gate | result |
|---|---|
| duplicate rental grain | 0 |
| negative rents | 0 |
| negative bond counts | 0 |
| invalid period values | 0 |
| geography mapping confidence present on every row | true |
| derived median correctly labelled (never 'direct') | true |
| **all gates pass** | **true** |

## Notes

- Unlike QLD/SA/VIC/NSW, WA's DMIRS source publishes only RAW individual bond-lodgement records (lodgement date, locality name, postcode, weekly rent) — no pre-computed median exists anywhere in the source. Every median_weekly_rent value in this store was computed in-house from the raw records and is explicitly labelled direct_or_derived='derived' (never 'direct'), unlike every other jurisdiction's adapter this sprint.
- No dwelling-type or bedroom-count breakdown exists anywhere in the raw source — every row is dwelling_type='all', bedroom_count=null. This is an honest source limitation (the raw lodgement record simply doesn't capture it), not a build shortcoming.
- new_bond_count here is a genuine transaction count (number of raw lodgement records aggregated into that median), giving the same confidence-threshold semantics as every other jurisdiction's adapter.
- Source hosted via the National Housing Data Exchange, a government open-data aggregator — the dataset page explicitly attributes the data to 'Government of Western Australia (Department of Mines, Industry Regulation and Safety)' under CC BY 4.0, verified live before download.
- 39 monthly files (Mar 2023 - May 2026) were all downloaded and aggregated (246,759 raw lodgement rows); 0 rows had an unparseable or missing rent value.
