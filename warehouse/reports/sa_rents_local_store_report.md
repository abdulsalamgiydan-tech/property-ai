# SA Rents Local Store Report (Sprint 11, Workstream 6)

Generated: 2026-07-21T20:06:41.343Z

Scope: South Australia rental local store (warehouse/data/local/sa_rents.duckdb) — suburb (SAL) + postcode (POA), current era only (2024-09..2026-03, 7 quarters)

## Summary

| metric | value |
|---|---|
| total summary rows | 41007 |
| quarters loaded | 7 (2024-07-01, 2024-10-01, 2025-01-01, 2025-04-01, 2025-07-01, 2025-10-01, 2026-01-01) |
| unresolved suburb (SAL) localities | 11 |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
| POA | direct | 12755 | 302 |
| POA | unresolved | 268 | 0 |
| SAL | alias | 5418 | 154 |
| SAL | direct | 22380 | 796 |
| SAL | unresolved | 186 | 0 |

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

## Deferred scope (documented, not fabricated)

- **legacy_xls_2008_06_to_2012_06**: 17 files downloaded, not parsed — pre-2012 OLE2 binary .xls format, not readable by exceljs, would need a separate legacy-format library
- **modern_xlsx_2012_09_to_2020_06**: 32 files downloaded, not parsed — 30-column pivot layout with 'Final Suburbs/Final PC/Final Region/Final SLA' sheet names, structurally different from the current era
- **modern_xlsx_2020_12_to_2024_06**: 15 files downloaded, not parsed — 31-column pivot layout, one column different from the current 27-column era
- **region_and_sla_sheets**: present in every downloaded file but out of scope this pass — Region is SA Government's own non-ASGS regional boundaries; SLA is a pre-2011 ASGS geography needing its own correspondence (same category of work reserved for Workstream 9)
- **reason**: rather than fabricate a single parser across three incompatible pivot layouts observed live in the downloaded files, this pass covers only the verified-stable current era; all files remain on disk (gitignored) for a future extension

## Notes

- All 71 available CKAN quarterly resources (2008-06..2026-03) were downloaded in full via download_sa_rents.mjs — cheap at ~200-650KB each — but only the 7 most recent (current-format) quarters are parsed into this local store.
- Suppressed source cells (the literal '*' convention for 1-5 dwellings, and blank cells) are mapped to NULL and never written as a row with a fabricated value; rows with both count and rent null are dropped entirely.
- Postcode labels in the source are numeric spreadsheet cells (not text) — the extractor originally only accepted string labels and silently produced zero postcode-grain rows for every quarter until this was found and fixed (converts any non-null cell value to a string label).
- The 'Row Labels' header cell is blank in at least one source file (2025-06 PC sheet) despite being present in others — the extractor anchors on the 'Metro' section-header row instead, which was verified present at an identical row position (16) in the Suburb and PC sheets of all 7 current-era quarters.
- 3 of 258 postcodes (5118, 5153, 5172) appear twice per quarter in the PC sheet with genuinely different values each time (confirmed by direct inspection, not a parsing artifact) — almost certainly a Metro/Country boundary split with no distinguishing label in this pivot layout. Every row for a duplicated raw label is quarantined to geography_confidence='unresolved' rather than silently picking one occurrence or summing them into a fabricated combined figure.
- confidence_label is derived from the published new_bond_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5).
