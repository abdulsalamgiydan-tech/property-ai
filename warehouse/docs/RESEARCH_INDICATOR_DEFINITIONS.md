# Research Indicator Definitions (Sprint 11, Workstream 10)

This document is the human-readable companion to
`warehouse/config/research_indicators.yml`, the canonical machine-readable
registry. Every indicator described here is **already computed** in the
warehouse (mostly in `mart.suburb_market_snapshot` /
`mart.postcode_market_snapshot`, built in Sprints 5-10) — this workstream's
job was to give each one a single, transparent, checkable definition, not
to invent new computation.

## What every indicator is, and is not

Every indicator in the registry is a **descriptive statistic**: something
measured directly from official data, or a simple, named, documented
calculation from two or more measured values (e.g. gross yield from an
independently-sourced rent median and sale-price median).

**None of them is:**
- A recommendation to buy, sell, or hold.
- A composite score or ranking. No indicator is ever combined with another
  into a single number that implies "this suburb is better than that one."
- An automated valuation for an individual property.
- A price forecast. Every indicator describes the past or the present —
  never a projection of the future.
- A causal claim. A correlation observed in the data (e.g. higher
  population growth alongside higher approvals) is never presented as one
  thing causing another.

## Confidence, always alongside the value

Every indicator that depends on a sample size (sales counts, rental bond
counts) publishes a companion confidence field
(`sales_sample_confidence`, `rent_confidence`, `yield_confidence`,
`supply_confidence`, `affordability_confidence`). The product must always
show this next to the value, and the value itself is set to `NULL` —
never a fabricated placeholder — whenever the underlying sample is too
small to be meaningful. The exact thresholds (high ≥30, medium ≥10, low
≥5, insufficient <5) are the same across every jurisdiction and metric
family in this project — see the per-jurisdiction `_DATA_METHOD.md` docs
for the one or two places (SA's ambiguous postcodes, WA's derived median)
where this needed extra care.

## Categories

| category | indicators | what it answers |
|---|---|---|
| sales | median price, price change, turnover rate | What are properties selling for, and how actively? |
| rent | median rent, rent change | What are properties renting for, and how has that moved? |
| yield | gross rental yield | How does rent compare to sale price? |
| supply | approvals per 1,000 dwellings, dwelling stock | How much new supply is being built relative to what exists? |
| demographics | population growth | How is the resident population changing? |
| affordability | price-to-income, rent-to-income, repayment-to-income | How does the local market compare to local incomes? |
| tenure | renter share | What share of households rent vs. own? |
| dwelling_composition | detached/apartment share | What kind of housing exists in this area? |

## Geography coverage varies honestly by indicator

Not every indicator is available at every geography level or for every
jurisdiction — this is documented per-indicator in the registry
(`geography_levels`, `jurisdictions_available`) rather than implied to be
uniform. For example:

- **Supply** (approvals, dwelling stock) is genuinely national — ABS
  Building Approvals and the Census are loaded nationally.
- **Sales/rent/yield/affordability** are currently NSW+VIC only for the
  full wide-snapshot presentation, though QLD/SA/WA rent is now loaded
  into the underlying fact tables (Sprint 11 Workstream 9) and available
  via `mart.suburb_rent_quarterly` / `mart.postcode_rent_quarterly` /
  `mart.lga_rent_quarterly` directly, even though it hasn't yet been
  folded into the wide snapshot tables.
- **Population growth (2016→2021)** is the one indicator that involves a
  genuine boundary-conversion approximation rather than a directly
  published Census cell — see `CROSS_CENSUS_HARMONISATION_METHOD.md` for
  the full method, its 100.00% national reconciliation check, and its
  50-person minimum-base suppression rule.

## One-line summary per indicator

See `research_indicators.yml` for the full machine-readable version
(formula, source table, confidence field, reference implementation where
one exists). In brief:

- **median_sale_price_12m** — trailing-12-month median settled sale price.
- **annual_price_change_pct** — this period's median vs. the prior 12 months'.
- **sales_turnover_pct** — trailing-12m sales volume as a % of dwelling stock (liquidity).
- **median_weekly_rent_latest** — latest quarter's median new-bond rent.
- **annual_rent_change_pct** — this quarter's median vs. a year ago.
- **gross_yield_pct** — annualised rent ÷ sale price.
- **approvals_per_1000_dwellings** — new approvals normalised by existing stock (supply pressure).
- **dwelling_stock_total** — total private dwellings (direct Census cell).
- **population_growth_2016_2021_pct** — Census-to-Census population change, boundary-harmonised.
- **price_to_income_ratio** — median price ÷ annual household income (years of income).
- **rent_to_income_ratio** — weekly rent ÷ weekly household income.
- **repayment_to_income_pct** — modelled mortgage repayment ÷ income, one shared national assumption scenario.
- **renter_share** — renter households ÷ total households.
- **detached_house_pct / apartment_unit_pct** — dwelling-type composition.
