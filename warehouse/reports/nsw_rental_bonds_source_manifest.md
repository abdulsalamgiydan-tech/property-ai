# NSW Rental Bonds Source Manifest (Sprint 6)

Generated: 2026-07-20T10:12:11.906Z
Statuses: 15 discovered.

## Primary source

**NSW DCJ Rent and Sales Report — quarterly rent tables** (chosen over NSW Fair
Trading's raw Rental Bond Data, which has lodgement/refund/holding counts but no
median rent figures):
https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html

- Format: xlsx, two sheets per quarter (`LGA`, `Postcode`)
- Measures: 1st quartile / median / 3rd quartile weekly rent, new bonds lodged
  (sample size), total bonds held, quarterly/annual change
- Breakdowns: dwelling type (Total/House/Flat-Unit/Townhouse/Other) x bedroom
  count (Total/Bedsitter/1-4+ Bedrooms/Not Specified)
- Publisher: NSW DCJ. Licence: NSW Government open statistical report, no paywall.
- History available: at least back to 2017 (Issue 120); this manifest covers
  2021-Q1 to 2026-Q1 to match the Sprint 5 sales pilot window.
- Refresh frequency: quarterly.

## Quarters (17 total, 15 verified live)

- 2021-03 ✅
- 2021-06 ✅
- 2021-09 ✅
- 2021-12 ✅
- 2022-03 ✅
- 2022-06 ✅
- 2022-09 ✅
- 2022-12 ✅
- 2023-03 ✅
- 2023-06 ✅
- 2023-09 ✅
- 2023-12 ✅
- 2024-03 ✅
- 2024-06 ✅
- 2026-03 ✅

## Known gaps (not fabricated)

- 2024-09
- 2024-12
- 2025-03
- 2025-06
- 2025-09
- 2025-12

## Known limitations

- Sourced from new bond lodgements only — reflects rents on newly tenanted properties, not the full standing rental stock; a lagging/leading indicator relative to average rents across all tenancies
- Suppression: cells with <=30 bonds lodged are flagged 's' (used with caution), cells with <=10 are suppressed entirely ('-') — both are treated as NULL with a suppression reason, never as zero or estimated
- LGA-level only for geography (not suburb/SAL) — postcode (POA) sheet is used for the finer join to core.dim_geography; LGA sheet is used for pilot-area confirmation and cross-checks
- No lat/lon or ASGS code on the record — postcode is an exact numeric match to core.dim_geography POA codes (same reliable join method as Sprint 5's postcode-only matches); LGA name is an exact text match to the 6 pilot LGA names
- Some quarters (Dec 2024, Jun/Sep/Dec 2025) were not discoverable via static page scan of the DCJ site and are recorded as known gaps — not fabricated

## Next actions

Run `build_nsw_rents_local_store.mjs` to download the verified quarterly files
into gitignored local storage and build the local DuckDB store, filtered to the
pilot LGAs/postcodes (reusing the Sprint 5 allow-lists).
