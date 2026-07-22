# Data Reproducibility (Sprint 12 WS13)

## What "reproducible" means for this warehouse

Every published figure in this research platform should be independently
re-derivable by a reader with no special access — using only the same
public source this project used, the same documented methodology, and
(where applicable) the same official ABS correspondence files. This is a
direct extension of this project's standing rules: never fabricate, every
metric carries source/period/confidence/lineage, direct vs. derived is
always distinguished (`warehouse/docs/PUBLIC_API_V1_CONTRACT.md`,
`meta.metric_lineage_registry`, Sprint 12 WS8).

## The export bundle (`GET /api/v1/export/:geographyId`)

The reproducibility deliverable this workstream actually ships: a
self-contained export (JSON or CSV) that bundles, for one geography:

1. **The snapshot** — every published metric value.
2. **The timeseries** — the underlying period-by-period observations
   behind the snapshot's "latest" figures.
3. **Per-metric-family lineage** — for every populated metric family
   (sales, rent, yield, approvals, dwelling stock, demographics,
   population growth, affordability): source name, publisher, licence,
   source URL, dataset name, and whether the figure is a direct load or a
   named derivation (e.g. `cross_census_boundary_reconciliation`,
   `gross_yield_ratio`, `affordability_repayment_formula`).

A reader with the CSV export and nothing else can: identify exactly which
government publication a number came from, find the same publication via
the recorded `source_url`, and check the figure against the original —
without needing this application, a database connection, or any
credential.

## How to actually reproduce a specific published number

**Direct metrics** (sales, rent, approvals, dwelling stock, demographics):
download the same named source file from `source_url`, filter to the same
geography and reference period, and the number should match exactly
(subject to the source publisher's own revisions between when this
warehouse last refreshed and when a reader checks — `latest_retrieved_at`
in the freshness endpoint records exactly when this warehouse's own copy
was taken).

**Derived metrics** — each has a named, documented formula:
- `gross_yield_ratio`: `(median_weekly_rent × 52) / median_sale_price × 100`,
  only computed when both the sales and rent sample confidence are
  `high`/`medium` (see `load_market_intelligence_to_branch.mjs`'s
  `buildYieldMart`).
- `cross_census_boundary_reconciliation` (population growth 2016→2021):
  reproducible via the official ABS 2016-to-2021 geographic correspondence
  file (`abs_correspondence_2016_2021`, itself a named, versioned,
  publicly-downloadable ABS product) — see
  `warehouse/docs/CROSS_CENSUS_HARMONISATION_METHOD.md` for the exact
  population-weighted aggregation formula, and
  `warehouse/scripts/geography/validate_2016_2021_geography_bridge.mjs`
  for a worked, independently-checkable example (a real Snowy Mountains
  2016 locality that splits into 9 real 2021 suburbs, ratios verified to
  sum to 0.9999999).
- `affordability_repayment_formula`: the standard principal-and-interest
  amortisation formula against `meta.metric_assumption`'s published
  baseline scenario (`standard_20pct_deposit_30yr_pi` — 20% deposit,
  30-year term, RBA housing lending rate as at the recorded
  `rba_rate_period`) — a documented research baseline, explicitly not a
  recommendation.

## What is NOT reproducible, and why that's disclosed rather than hidden

- **`quarterly_mart_latest_value_multi_state_rollup`** (QLD/SA/WA rent, WS6):
  reproducible from the same RTA/SA Housing Trust/DMIRS source files, but
  requires knowing which specific quarter was "latest" at the time this
  warehouse's snapshot was generated (`latest_rent_period` in the export
  answers this exactly).
- **`cross_border_postcode_attribution_unresolved`** (WS8/WS9's
  cross-border anomaly): explicitly NOT fully reproducible yet — this
  project has NOT determined whether these ~16 rows reflect a genuine
  postal-catchment phenomenon or a source-join defect (see
  `sprint12_cross_border_anomaly_report.md`). The export bundle surfaces
  this honestly via `lineage_complete` and the registry's own `notes`
  field, rather than presenting an unverified number as settled fact.
- **Quarantined data** (e.g. the fixed Lindfield future-dated row, WS9):
  excluded from the published snapshot entirely — a reader reproducing
  the *raw* source file may see the anomalous record still present
  upstream (it's a real record in the source), but this warehouse's own
  published, reconciled figure will not include it, and the reason is
  recorded in `meta.data_quarantine_summary`.

## Versioning and change tracking

Every export includes `exported_at`. Combined with
`GET /api/v1/freshness` (`last_retrieved_at` per dataset) and the git
history of `supabase/migrations/*.sql` (every schema/methodology change
is a reviewable, timestamped commit), a reader can establish exactly
which version of this warehouse's methodology produced any given export,
even after the underlying methodology later changes.
