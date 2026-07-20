# RBA Interest Rate Sources — Manifest (Sprint 8, Part A)

Generated: 2026-07-20T18:44:12.493Z (full detail: `rba_rates_source_manifest.json`)
Statuses: 3 discovered, 1 out_of_scope.

## Verification

`rba.gov.au` has no bot/challenge protection on statistics pages or data
endpoints (unlike the NSW VG PSI portal used in Sprint 5) — every URL below was
verified live by this script with a direct HTTPS GET.

## Sources loaded

| dataset | table | measure | history | rows targeted |
|---|---|---|---|---|
| A2 | Changes in Monetary Policy and Administered Rates | Cash Rate Target | 1990-01-23 to 2026-05-06 (98 change-events) | 98 events |
| F6 | Housing Lending Rates | Owner-occupier/investor x variable/fixed, outstanding, all institutions | 31/07/2019 to 31/05/2026 (83 months) | 8 series x 83 months |
| F5 | Indicator Lending Rates (housing subset) | Standard variable + 3yr fixed, owner-occupier/investor | varies by series | 4 series |

## Licence

Most RBA website material is **CC BY 4.0** with attribution to the RBA
(confirmed live: true). The Cash Rate Target carries additional
conditions under Section 4 of the RBA Copyright and Disclaimer Notice
(`rba.gov.au/copyright/`) as a financial benchmark — used for internal
research/statistical context only, never redistributed as a benchmark rate.

## Explicitly excluded

**RBA Table J1 (Market Economists' Cash Rate Forecasts)** — misleadingly
linked as "J1 – Cash Rate" on the tables index, but the table itself
(title: "J1 MARKET ECONOMISTS' FORECASTS") is a survey-based forecast product.
Excluded per this sprint's hard rule against loading forecasts.

**The full "every meeting including holds" cash-rate decision table** on
`rba.gov.au/statistics/cash-rate/` (400 HTML rows) has no dedicated
CSV/XLSX download — A2 (98 rows, only actual rate-change events) is
the official machine-readable source used instead.

## Known data-quality note carried into Part C/D

3 of the A2 rows record the cash rate target as a
**range** (pre-August-1990 RBA practice). Loaded with `rate_percent = NULL`
and `data_quality_status = 'range_not_numeric'` — no value invented.

## Scope decision: F5 vs F6 not spliced

F5 and F6 use different collection methodologies and mostly non-overlapping
date ranges. Stored as **separate** `rate_type` values
(`indicator_lending_rate` vs `housing_lending_rate`), never joined into
one continuous series.
