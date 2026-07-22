# Sprint 12 — Data Quality Summary

Generated from the live branch. Machine-readable equivalents:
`warehouse/reports/quality_summary_report.json` (running totals, refreshed
by `npm run warehouse:quality:report`) and `quality_check_report.json`
(most recent full rule-by-rule run).

## Quality rules

- **35 active rules** registered across 16 generic rule families
  (duplicate keys, null required fields, orphan geographies, negative
  values, range checks, missing confidence labels, future-dated
  observations, invalid geometry, weight reconciliation, row-count
  anomalies, stale sources, broken source URLs, missing lineage,
  cross-border geography joins, schema drift, checksum changes).
- **28 blocking, 7 advisory.**
- **9 legacy rule_ids** preserved (not executable) purely so historical
  `meta.data_quality_result` rows from Sprints 9-12's one-off loader gates
  keep a valid foreign key.
- Latest run: **32/35 passed, 0 blocking failures, 3 advisory failures**
  (cross-border postcode anomaly, geography weight reconciliation, source
  URL health — all documented, none newly discovered as of this report).

## Incidents and quarantine

- **3 open incidents**, all advisory severity, all previously investigated
  and documented (not new/unexplained).
- **0 open incidents at blocker severity.**
- **2 quarantined rows** (`core.fact_residential_sales_summary`, the
  future-dated Lindfield sales records) — preserved, never deleted; the 2
  downstream wide-snapshot rows they had corrupted were recomputed from
  real data.

## Lineage completeness (WS8)

**100% (88/88)** populated (mart, metric, jurisdiction) combinations have
a registered lineage entry. 35 rows in `meta.metric_lineage_registry`.

## Confidence completeness

**100%** of populated `median_sale_price_12m` values carry a
`sales_sample_confidence` label; **100%** of populated
`median_weekly_rent_latest` values carry a `rent_confidence` label —
across `mart.suburb_market_snapshot`.

## Freshness

All 7 datasets `meta.dataset_freshness_status` currently tracks show
`manual_review` — accurately reflecting that none have yet completed a
tracked orchestrator execution (every Sprint 9-12 load ran as a bespoke
one-off script), not that they are unhealthy. See
`sprint12_ws10_refresh_engine_report.md` for the orchestrator that closes
this gap once run for real.

## Real defects found and fixed while building this system (not just detected)

1. `future_dated_sales` — 2 rows with an impossible 2032 reference period
   were actively corrupting 2 published wide-snapshot rows (Lindfield
   NSW). Quarantined; snapshot recomputed from real 2026 data.
2. `range_population_growth_pct`'s own threshold was miscalibrated (too
   tight for genuine Australian growth-corridor Census data) — corrected
   after verifying the 22 initially-flagged suburbs were all real.
3. A Postgres `NULL <> NULL` uniqueness gap in
   `meta.metric_lineage_registry`'s original constraint, found by running
   the population script twice and watching the row count grow instead of
   staying stable — fixed with `unique nulls not distinct`.
