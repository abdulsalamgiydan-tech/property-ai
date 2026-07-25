/**
 * Sprint 12, Workstream 9 — the registered rule catalogue.
 *
 * Each entry becomes one row in meta.data_quality_rule (idempotent upsert
 * via build_rule_catalogue.mjs). Adding coverage for a new dataset/mart
 * means adding a row here, NOT writing a new script — the rule_family
 * field selects which generic executor in rule_engine.mjs runs it.
 */
export const RULE_CATALOGUE = [
  // ── Duplicate natural keys ──────────────────────────────────────────
  { ruleId: "dup_key_suburb_snapshot", ruleFamily: "duplicate_natural_key", domain: "market", targetSchema: "mart", targetTable: "suburb_market_snapshot", geographyGrain: "SAL", severity: "blocker", expectedThreshold: { key_columns: ["geography_id", "coalesce(dwelling_type,'')"] }, description: "No two rows may share the same (geography_id, dwelling_type) grain." },
  { ruleId: "dup_key_postcode_snapshot", ruleFamily: "duplicate_natural_key", domain: "market", targetSchema: "mart", targetTable: "postcode_market_snapshot", geographyGrain: "POA", severity: "blocker", expectedThreshold: { key_columns: ["geography_id", "coalesce(dwelling_type,'')"] }, description: "No two rows may share the same (geography_id, dwelling_type) grain." },
  { ruleId: "dup_key_suburb_timeseries", ruleFamily: "duplicate_natural_key", domain: "market", targetSchema: "mart", targetTable: "suburb_market_timeseries", geographyGrain: "SAL", severity: "blocker", expectedThreshold: { key_columns: ["geography_id", "reference_period", "period_type", "coalesce(dwelling_type,'')", "metric_family"] }, description: "One row per (geography, period, dwelling_type, metric_family)." },
  { ruleId: "dup_key_construction_activity", ruleFamily: "duplicate_natural_key", domain: "supply", targetSchema: "core", targetTable: "fact_dwelling_construction_activity", geographyGrain: "STATE", severity: "blocker", expectedThreshold: { key_columns: ["geography_id", "reference_period", "period_type", "dwelling_type", "stage", "sector"] }, description: "One row per (geography, period, dwelling_type, stage, sector)." },

  // ── Null required fields ────────────────────────────────────────────
  { ruleId: "null_snapshot_geography_id", ruleFamily: "null_required_field", domain: "market", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "geography_id" }, description: "Every snapshot row must reference a geography." },
  { ruleId: "null_construction_activity_unit_count", ruleFamily: "null_required_field", domain: "supply", targetSchema: "core", targetTable: "fact_dwelling_construction_activity", severity: "blocker", expectedThreshold: { column: "unit_count" }, description: "A commencement/completion row without a count is meaningless." },

  // ── Orphan geography codes ──────────────────────────────────────────
  { ruleId: "orphan_geo_suburb_snapshot", ruleFamily: "orphan_geography", domain: "geography", targetSchema: "mart", targetTable: "suburb_market_snapshot", geographyGrain: "SAL", severity: "blocker", description: "Every snapshot geography_id must exist in core.dim_geography." },
  { ruleId: "orphan_geo_postcode_snapshot", ruleFamily: "orphan_geography", domain: "geography", targetSchema: "mart", targetTable: "postcode_market_snapshot", geographyGrain: "POA", severity: "blocker", description: "Every snapshot geography_id must exist in core.dim_geography." },
  { ruleId: "orphan_geo_rent_fact", ruleFamily: "orphan_geography", domain: "rent", targetSchema: "core", targetTable: "fact_rental_market_summary", severity: "blocker", description: "Every rent fact row's geography_id must exist in core.dim_geography." },

  // ── Negative values ──────────────────────────────────────────────────
  { ruleId: "negative_sale_price", ruleFamily: "negative_value", domain: "sales", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "median_sale_price_12m" }, description: "A sale price cannot be negative." },
  { ruleId: "negative_rent", ruleFamily: "negative_value", domain: "rent", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "median_weekly_rent_latest" }, description: "A weekly rent cannot be negative." },
  { ruleId: "negative_construction_units", ruleFamily: "negative_value", domain: "supply", targetSchema: "core", targetTable: "fact_dwelling_construction_activity", severity: "blocker", expectedThreshold: { column: "unit_count" }, description: "A dwelling commencement/completion count cannot be negative." },
  { ruleId: "negative_population", ruleFamily: "negative_value", domain: "demographics", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "total_population" }, description: "A population figure cannot be negative." },

  // ── Impossible percentages / invalid ranges ─────────────────────────
  { ruleId: "range_renter_household_pct", ruleFamily: "range_check", domain: "demographics", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "renter_household_pct", min: 0, max: 100 }, description: "A household-share percentage must fall within [0,100]." },
  { ruleId: "range_owner_occupier_pct", ruleFamily: "range_check", domain: "demographics", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "owner_occupier_pct", min: 0, max: 100 }, description: "A household-share percentage must fall within [0,100]." },
  { ruleId: "range_gross_yield_pct", ruleFamily: "range_check", domain: "yield", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "gross_yield_pct", min: 0, max: 30 }, description: "A gross rental yield above 30% or below 0% indicates a computation defect, not a real market outcome." },
  // Threshold verified against live data, not guessed: initial max=500%
  // flagged 22 suburbs, every one a genuine outer-metro growth-corridor SAL
  // (2016 population near-zero on then-undeveloped land, 2021 population in
  // the thousands after a new housing estate was built -- e.g. 7,982 people
  // at 9,319.52% growth implies a 2016 base of ~85, entirely consistent
  // with Australia's real 2016-2021 growth-corridor pattern in outer
  // Melbourne/Sydney/SEQ). Raised to 20000% -- still catches genuine
  // data-entry defects, verified live that current max is 9319.52% and
  // min is exactly -100.00% (a locality reaching zero population, also a
  // real possible outcome, e.g. an industrial rezone) with nothing beyond
  // either bound.
  { ruleId: "range_population_growth_pct", ruleFamily: "range_check", domain: "demographics", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { column: "population_growth_2016_2021_pct", min: -100, max: 20000 }, description: "A 5-year population change below -100% is impossible (population cannot go negative). Above 20000% almost certainly indicates a boundary-mismatch defect -- verified against real known Australian growth-corridor SALs, the most extreme genuine cases (new outer-metro housing estates on 2016-vacant land) top out under this." },
  { ruleId: "range_boundary_reconciliation_residual", ruleFamily: "range_check", domain: "geography", targetSchema: "core", targetTable: "bridge_geography_correspondence", severity: "advisory", expectedThreshold: { column: "reconciliation_residual_pct", min: -1, max: 1 }, description: "Sprint 12 WS4's national reconciliation residual should stay within +/-1% (documented tolerance is +/-0.5%; this rule uses a slightly wider advisory band before it becomes a hard failure)." },

  // ── Missing confidence labels ────────────────────────────────────────
  { ruleId: "confidence_sales_snapshot", ruleFamily: "missing_confidence_label", domain: "sales", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { value_column: "median_sale_price_12m", confidence_column: "sales_sample_confidence" }, description: "A published sale price must carry a sample-size confidence label." },
  { ruleId: "confidence_rent_snapshot", ruleFamily: "missing_confidence_label", domain: "rent", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { value_column: "median_weekly_rent_latest", confidence_column: "rent_confidence" }, description: "A published rent figure must carry a confidence label." },
  { ruleId: "confidence_yield_snapshot", ruleFamily: "missing_confidence_label", domain: "yield", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { value_column: "gross_yield_pct", confidence_column: "yield_confidence" }, description: "A published yield must carry a confidence label." },

  // ── Future-dated observations ────────────────────────────────────────
  // This is exactly the bug Sprint 12 WS1 found and deferred to WS9:
  // 2 rows in core.fact_residential_sales_summary with
  // reference_period=2032-01-01 (impossible future date).
  { ruleId: "future_dated_sales", ruleFamily: "future_dated_observation", domain: "sales", targetSchema: "core", targetTable: "fact_residential_sales_summary", severity: "blocker", expectedThreshold: { period_column: "reference_period", exclude_quarantined_column: "data_quality_status" }, description: "An observation cannot be dated in the future -- this warehouse publishes real historical/current data only, never forecasts (WS1 found 2 such rows, dataset nsw_psi_2001_current_full_state, Lindfield NSW; quarantined and the corrupted wide-snapshot rows recomputed by quarantine_future_dated_sales.mjs)." },
  { ruleId: "future_dated_rent", ruleFamily: "future_dated_observation", domain: "rent", targetSchema: "core", targetTable: "fact_rental_market_summary", severity: "blocker", expectedThreshold: { period_column: "reference_period" }, description: "An observation cannot be dated in the future." },
  { ruleId: "future_dated_construction_activity", ruleFamily: "future_dated_observation", domain: "supply", targetSchema: "core", targetTable: "fact_dwelling_construction_activity", severity: "blocker", expectedThreshold: { period_column: "reference_period" }, description: "An observation cannot be dated in the future." },

  // ── Invalid geometries ───────────────────────────────────────────────
  { ruleId: "invalid_geometry_dim_geography", ruleFamily: "invalid_geometry", domain: "geography", targetSchema: "core", targetTable: "dim_geography", geographyGrain: null, severity: "blocker", expectedThreshold: { geom_column: "geom" }, description: "Every stored boundary geometry must be topologically valid (ST_IsValid)." },

  // ── Weight reconciliation ───────────────────────────────────────────
  { ruleId: "weight_reconciliation_bridge", ruleFamily: "weight_reconciliation", domain: "geography", targetSchema: "core", targetTable: "bridge_geography_correspondence", severity: "advisory", expectedThreshold: { tolerance_pct: 1.0 }, description: "Each source geography's correspondence weights should sum to ~1.0 (documented ABS special-code exclusions mean this is advisory, not a hard blocker -- see WS4's methodology doc)." },

  // ── Row count anomalies (collapse / explosion / empty replacement) ──
  { ruleId: "rowcount_suburb_snapshot", ruleFamily: "row_count_anomaly", domain: "market", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { filter_sql: "dwelling_type is null", max_pct_change: 20 }, description: "A >20% swing in total suburb-snapshot row count between quality runs indicates a partial or runaway load, not real data growth." },
  { ruleId: "rowcount_postcode_snapshot", ruleFamily: "row_count_anomaly", domain: "market", targetSchema: "mart", targetTable: "postcode_market_snapshot", severity: "blocker", expectedThreshold: { filter_sql: "dwelling_type is null", max_pct_change: 20 }, description: "A >20% swing in total postcode-snapshot row count indicates a partial or runaway load." },
  { ruleId: "rowcount_construction_activity", ruleFamily: "row_count_anomaly", domain: "supply", targetSchema: "core", targetTable: "fact_dwelling_construction_activity", severity: "advisory", expectedThreshold: { filter_sql: "true", max_pct_change: 10 }, description: "Dwelling construction activity is a slow-changing quarterly series -- a >10% swing warrants investigation before the next scheduled refresh." },

  // ── Stale sources ─────────────────────────────────────────────────────
  { ruleId: "stale_source_check", ruleFamily: "stale_source", domain: "freshness", severity: "advisory", description: "No registered dataset should be in 'stale' or 'critical' freshness status without an open incident tracking it." },

  // ── Broken source URLs / HTML masquerading as data ──────────────────
  // Advisory, not blocking: this project's Node environment has a known,
  // previously-documented issue (Sprint 12 CI/download investigation)
  // where Node's built-in fetch() intermittently fails (ECONNRESET/SSL)
  // against several Australian government hosts (abs.gov.au in
  // particular) even though the same URL succeeds reliably via curl.
  // "fetch failed" from this rule is therefore not conclusive evidence of
  // a genuinely broken source -- verified live during WS9: abs_asgs,
  // abs_building_activity, abs_building_approvals, wa_rent flagged this
  // way, all previously confirmed reachable via curl earlier this sprint.
  { ruleId: "source_url_health", ruleFamily: "broken_source_url", domain: "freshness", severity: "advisory", expectedThreshold: { reject_html_for: [] }, description: "Every registered source URL should still resolve (2xx) and, for sources known to serve a direct data file, not silently redirect to an HTML page. Known false-positive source: Node's fetch() is unreliable against some ABS/gov hosts in this environment (curl succeeds where fetch reports 'fetch failed') -- a failure here should be re-verified with curl before treating it as a real outage." },

  // ── Missing field-level lineage (WS8) ────────────────────────────────
  { ruleId: "lineage_completeness_check", ruleFamily: "missing_lineage", domain: "lineage", severity: "blocker", description: "Every populated (mart, metric, jurisdiction) combination must have a matching meta.metric_lineage_registry entry -- 'no mart metric may be considered publishable if mandatory lineage is absent'." },

  // ── The WS8 cross-border postcode anomaly ────────────────────────────
  { ruleId: "cross_border_postcode_sales", ruleFamily: "cross_border_geography_join", domain: "sales", targetSchema: "mart", targetTable: "postcode_market_snapshot", severity: "advisory", description: "Flags postcodes whose Australia-Post-range-heuristic jurisdiction doesn't match their sales_source's expected jurisdiction (e.g. nsw_vg_sales data under a QLD/ACT-range postcode). Advisory, not blocking -- WS8 already investigated and documented this as a real, small-volume, unresolved case; this rule keeps it visible on every run rather than a one-time finding that gets forgotten." },

  // ── Schema drift ──────────────────────────────────────────────────────
  { ruleId: "schema_drift_suburb_snapshot", ruleFamily: "schema_drift", domain: "market", targetSchema: "mart", targetTable: "suburb_market_snapshot", severity: "blocker", expectedThreshold: { expected_columns: ["geography_id", "geography_code", "geography_name", "state_code", "jurisdiction", "dwelling_type", "median_sale_price_12m", "median_weekly_rent_latest", "gross_yield_pct", "population_growth_2016_2021_pct", "confidence_label", "metric_provenance"] }, description: "The columns this project's application code and lineage registry depend on must not silently disappear." },

  // ── Checksum changes (informational) ─────────────────────────────────
  { ruleId: "checksum_change_tracking", ruleFamily: "checksum_change", domain: "freshness", severity: "advisory", description: "Tracks when a source file's checksum changes between downloads -- informational signal for the refresh engine (WS10), not a failure." },
];
