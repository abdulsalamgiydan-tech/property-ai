# National Metric Definitions (Sprint 10, Phase 10)

Full machine-readable detail: `warehouse/config/market_metrics.yml`. This
document is the human-readable summary and the policy statement that
governs it.

## Policy

State adapters (NSW, VIC, and any future state) may **never** silently
redefine what a metric means. A state may:

- Supply a value for a metric where its official source supports it.
- Withhold a metric (leave it NULL) where its official source does not
  support it, with the reason recorded in `missing_metric_reasons`.
- Document a narrower geography or dwelling-type compatibility than
  another state (e.g. VIC has no postcode-grain sales, no
  townhouse/villa-specific classification).

A state may **not**: change a metric's formula, unit, period convention,
or confidence rule. All such changes go through
`warehouse/config/market_metrics.yml` and apply to every jurisdiction.

## Metric summary

| metric_code | display name | unit | geography | known cross-state limitation |
|---|---|---|---|---|
| median_sale_price | Median sale price | AUD | SAL, POA (NSW only) | VIC has no townhouse/villa split, no postcode grain |
| annual_price_change_pct | Annual price change | % | SAL, POA (NSW only) | VIC figure is source-published, not independently derived |
| sales_volume | Sales volume | count | SAL, POA (NSW only) | VIC volume is a single official count, not independently verifiable |
| sales_turnover_pct | Sales turnover | % | SAL | none (shared Census stock denominator) |
| median_rent | Median weekly rent | AUD/week | SAL, POA (NSW only), LGA (VIC fallback) | VIC suburb figure is a moving-annual median, not point-in-time |
| annual_rent_change_pct | Annual rent change | % | SAL, POA (NSW only), LGA (VIC fallback) | same moving-annual caveat |
| gross_yield | Gross rental yield | % | SAL | never same-instant; periods used are always recorded |
| dwelling_stock | Total private dwellings | count | SAL, POA | none (identical national Census source) |
| approvals | Building approvals (12m) | count | SAL, POA | none (identical national ABS source) |
| approvals_per_1000_dwellings | Approvals per 1,000 dwellings | rate | SAL, POA | none |
| population | Total population | count | SAL, POA | direct 2021 Census figure |
| population_growth_2016_2021_pct | Population growth, 2016-2021 | % | SAL, POA | **Corrected 2026-07-22 (Sprint 12 WS4)**: this row previously said "NULL nationally (ASGS boundary versioning)" — that was accurate before Sprint 11 WS4 built the cross-Census correspondence; now genuinely populated (derived, not direct — see `population_growth_method`/`population_growth_confidence`/`population_growth_correspondence_version` columns, which carry lineage independently of the row's general `geography_method`/`confidence_label`). Suppressed (NULL) below a 50-person 2016 population base. See `CROSS_CENSUS_HARMONISATION_METHOD.md`. |
| household_income | Median weekly household income | AUD/week | SAL, POA | none |
| renter_share | Renter household share | % | SAL, POA | none |
| owner_with_mortgage_share | Owner (with mortgage) share | % | SAL, POA | none |
| price_to_income_ratio | Price-to-income ratio | x income | SAL | none (both states equally Census-2021-fixed) |
| repayment_estimate | Estimated monthly repayment | AUD/month | SAL | none — identical scenario, formula, rate source both states |
| repayment_to_income_ratio | Repayment-to-income ratio | % | SAL | none |

## Affordability disclaimer (applies to every affordability-family metric)

`repayment_estimate` and `repayment_to_income_ratio` are **descriptive
research context only** — not a loan offer, pre-approval, investment
recommendation, or financial advice. They use a single, transparent,
queryable baseline scenario (`meta.metric_assumption`,
`standard_20pct_deposit_30yr_pi`: 20% deposit, 30-year principal & interest
loan, current RBA variable housing lending rate, no LMI/stamp duty/fees
included). This scenario has no jurisdiction column, so it is
**structurally identical** across NSW and VIC — not re-implemented per
state.

## Where formulas live

- Snapshot computation (current values): `mart.suburb_market_snapshot`,
  `mart.postcode_market_snapshot`, built by
  `warehouse/scripts/sales/rebuild_nsw_snapshots_after_reconciliation.mjs`
  (NSW) and
  `warehouse/scripts/market_intelligence/load_vic_market_intelligence_to_branch.mjs`
  (VIC) — both implement the exact formulas in
  `warehouse/config/market_metrics.yml`.
- Trend computation (historical values): `mart.suburb_market_timeseries`,
  `mart.postcode_market_timeseries`, same two scripts.
