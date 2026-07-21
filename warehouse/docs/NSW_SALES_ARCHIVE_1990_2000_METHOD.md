# NSW Sales Archive (1990-2000) Method (Sprint 11, Workstream 8)

## Source

NSW Valuer General Property Sales Information (PSI), archived annual files
(1990-2000), same bulk-download domain as the already-live 2001-current
dataset: `https://www.valuergeneral.nsw.gov.au/__psi/yearly/<YYYY>.zip`.
CC BY 4.0 (ND variant), Crown in right of NSW through the Valuer General.

## Access

The interactive "Property Sales Information" launch app
(`valuation.property.nsw.gov.au/launch/propertySalesInformation`) currently
returns "Sorry, the application you requested is currently unavailable" —
a live outage of the browsing UI, not a blocker, since the direct annual
zip URL pattern works regardless and is the same one already used for
2001-current. Plain `curl`/`fetch` still return 403 (Cloudflare managed JS
challenge, unchanged since Sprint 5) — files were retrieved via the
`gstack /browse` skill in **headed** mode (headless mode got stuck on the
challenge; headed mode passed it), per this repo's CLAUDE.md requirement
to use `/browse` for all web browsing. This is the official CC-licensed
NSW Government distribution, not a commercial/protected portal.

The format documentation PDFs (`valuergeneral.nsw.gov.au/__data/assets/...`)
have moved — the old URLs from the Sprint 5 manifest now 404 after their
Cloudflare redirect. The current, working location was found live via the
`nsw.gov.au` resource-library page
(`www.nsw.gov.au/housing-and-construction/land-values-nsw/resource-library/property-sales-data-guide`)
and downloads via plain `curl` with no bot protection (a different,
consolidated NSW Government domain from the legacy `valuergeneral.nsw.gov.au`
one that still hosts the actual data files).

## Record format (verified against the official fact sheet)

Downloaded and read `Archived_Property_Sales_Data_File_Format_1990_to_2001_V2.pdf`
directly — every field position below was cross-checked character-by-character
against real sample rows before writing the parser, not assumed from the PDF
alone:

```
B ; district_code ; source ; valuation_num ; property_id ; unit_num ;
house_num ; street_name ; suburb_name ; postcode ; contract_date ;
purchase_price ; land_description ; area ; area_type ; dimensions ;
comp_code ; zone_code ; vendor_name(removed) ; purchaser_name(removed)
```

This is **not** the same field layout as the 2001-current dataset. Two
material gaps:

1. **No settlement_date** — only `contract_date` exists (format `DD/MM/YYYY`
   in the actual files, despite the fact sheet documenting `CCYYMMDD`; the
   real data was trusted over the stated format after direct verification).
2. **No `nature_of_property` field** — the current pipeline's dwelling-type
   classification (matching text like RESIDENCE/UNIT/VACANT LAND) cannot be
   reused.

## Dwelling type classification (necessarily coarser than 2001-current)

`zone_code` is **not** a dwelling-type signal — it's a broad NSW planning
zone letter, confirmed against the official "Zone Codes and Descriptions"
fact sheet (also downloaded and read): `A` = Residential zoning, covering
everything from a house to a block of units to vacant land within a
residential area, alongside `B` = Business, `I` = Industrial, `R` =
Non-Urban, etc.

Classification logic:
- `zone_code != 'A'` → `non_residential_or_other_zone` (excluded from
  residential summaries, high confidence — this is a real zoning fact).
- `zone_code == 'A'` and the free-text `land_description` matches a strata
  plan pattern (`STRATA PLAN` or `SP <digits>`) → `apartment_unit` (medium
  confidence — verified this pattern actually appears in ~373,551 of the
  ~1.6M zone-A rows, about 23%).
- `zone_code == 'A'` otherwise → `unknown_residential` (low confidence) —
  reuses the exact fallback bucket the 2001-current pipeline already uses
  for its own unclassifiable rows, rather than inventing a new category.

## A genuine data-quality finding, documented not hidden

The `zone_code` field's NULL rate declines sharply and monotonically from
**58.3% in 1990** to ~7-9% by the late 1990s. Since residential
classification depends on `zone_code='A'`, **1990's residential sale count
is a more conservative undercount than later years** — a real
characteristic of the archive's earliest, least-digitised year, not a
parsing defect, and not corrected by guessing at the missing codes. Full
year-by-year breakdown in `nsw_sales_archive_local_store_report.md`.

## Build and validation

- `warehouse/scripts/sales/build_nsw_sales_archive_local_store.mjs` →
  `warehouse/data/local/nsw_sales_archive.duckdb` /
  `nsw_sales_archive_transactions.parquet` (gitignored). 1,967,374 raw B
  records read across 11 years, 1,917,667 after exact-duplicate collapse.
- `warehouse/scripts/sales/validate_nsw_sales_archive_local_store.mjs` →
  `warehouse/reports/nsw_sales_archive_local_store_report.{json,md}`. All
  gates pass. Cross-check: annual median residential (zone-A) sale price
  rises smoothly from $109,000 (1990) to $205,000 (2000) — consistent with
  known NSW property market history across that decade, a genuine
  plausibility signal rather than a fabricated-looking flat line.

## Branch promotion status

**Not yet performed.** Extending `core.fact_residential_sales_summary` and
its derived marts (`mart.suburb_sales_annual` etc.) with pre-2001 data
means writing into already-live schema that existing comparison APIs read
from — deliberately deferred to its own careful, dedicated pass rather
than rushed alongside first-time discovery and parsing. The annual summary
output (`nsw_sales_archive_annual_summary.parquet`) is built in the same
shape as the existing mart specifically to make that future extension
straightforward.

## VIC (and other jurisdictions) backfill evaluation

Per this workstream's scope to also "evaluate VIC/other backfill":

- **VIC**: live-verified (not assumed) that the Valuer-General Victoria
  publishes a **"Victorian Property Sales Report — Time Series"** dataset
  on `discover.data.vic.gov.au`, described as covering "the annual property
  sale price for the last 20 years by property type" with a direct download
  (`land.vic.gov.au/__data/assets/excel_doc/.../year-summary-2024.xlsx`).
  This is a **genuine, real backfill opportunity** — VIC's currently-loaded
  sales data (Sprint 10) only goes back to 2023-Q4. Not built this pass
  (an "evaluate", not "build", per this workstream's scope) — flagged as a
  concrete candidate for a future workstream, with the exact dataset name
  and URL recorded here so it doesn't need re-discovering.
- **QLD/SA/WA/TAS/ACT/NT**: no backfill candidate exists, because none of
  these jurisdictions has ANY free bulk sales source loaded in the first
  place (Workstream 2's finding) — there is nothing to backfill from until
  a current-era sales source is found or purchased, which none has been.
