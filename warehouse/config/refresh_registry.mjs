/**
 * National refresh registry (Sprint 11, Workstream 14).
 *
 * Single source of truth for warehouse/scripts/orchestration/refresh_engine_v2.mjs.
 * A plain JS module (not YAML) — this codebase has no established
 * runtime YAML-parsing pattern (the existing .yml config files, e.g.
 * jurisdiction_coverage.yml, are documentation-only, never require()'d),
 * and js-yaml is only present as an undeclared transitive dependency of
 * eslint, too fragile to rely on for something this orchestrator needs at
 * runtime. Every field is still hand-editable and reviewable like YAML.
 *
 * Each dataset entry maps to its existing build/validate/branch-load
 * scripts — this registry does not reimplement any fetch/parse/load
 * logic, it orchestrates ~25 already-existing, individually-validated
 * scripts written across Sprints 2-11. `tier` defines dependency order
 * (lower tiers run first); `depends_on` is informational
 * cross-referencing for the same purpose.
 */

export const DATASETS = [
  // ── Tier 0: geography backbone ────────────────────────────────────────
  {
    dataset_id: "asgs_geography_backbone",
    jurisdiction: "ALL",
    category: "geography",
    tier: 0,
    depends_on: [],
    build_script: "warehouse/scripts/geography/build_asgs_local_store.mjs",
    validate_script: "warehouse/scripts/geography/validate_asgs_local_store.mjs",
    branch_load_script: "warehouse/scripts/geography/load_asgs_backbone.mjs",
    local_report: "warehouse/reports/asgs_local_file_inspection.json",
  },

  // ── Tier 1: cross-Census geography correspondence ───────────────────────
  {
    dataset_id: "cross_census_harmonisation",
    jurisdiction: "ALL",
    category: "correspondence",
    tier: 1,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/geography/build_cross_census_harmonisation.mjs",
    validate_script: "warehouse/scripts/geography/validate_cross_census_harmonisation.mjs",
    branch_load_script: "warehouse/scripts/geography/load_cross_census_harmonisation_to_branch.mjs",
    local_report: "warehouse/reports/cross_census_harmonisation_report.json",
  },

  // ── Tier 2: Census dwelling stock + demographics + population ───────────
  {
    dataset_id: "census_dwelling_stock",
    jurisdiction: "ALL",
    category: "census",
    tier: 2,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/census/build_census_dwelling_local_store.mjs",
    validate_script: "warehouse/scripts/census/validate_census_dwelling_local_store.mjs",
    branch_load_script: "warehouse/scripts/census/load_census_dwelling_to_branch.mjs",
    local_report: "warehouse/reports/census_dwelling_local_store_report.json",
  },
  {
    dataset_id: "census_demographics",
    jurisdiction: "ALL",
    category: "census",
    tier: 2,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/census/build_census_demographics_local_store.mjs",
    validate_script: "warehouse/scripts/census/validate_census_demographics_local_store.mjs",
    branch_load_script: null, // promoted via load_market_intelligence_to_branch.mjs (tier 5), not a standalone loader
    local_report: "warehouse/reports/census_demographics_local_store_report.json",
  },
  {
    dataset_id: "national_population_layer",
    jurisdiction: "ALL",
    category: "population",
    tier: 2,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/demographics/build_national_population_layer.mjs",
    validate_script: null, // build script includes inline validation, no separate validator
    branch_load_script: null, // deliberately NOT YET PROMOTED — deferred to WS9's SA2 mart schema
    local_report: "warehouse/reports/national_population_layer_report.json",
  },

  // ── Tier 3: SA2/LGA dwelling stock marts (depends on census_dwelling_stock) ─
  {
    dataset_id: "sa2_lga_dwelling_stock_marts",
    jurisdiction: "ALL",
    category: "census",
    tier: 3,
    depends_on: ["census_dwelling_stock"],
    build_script: null, // pure in-database SQL transformation, no local build step
    validate_script: null,
    branch_load_script: "warehouse/scripts/census/load_sa2_lga_dwelling_stock_to_branch.mjs",
    local_report: "warehouse/reports/sa2_lga_dwelling_stock_branch_load_report.json",
  },

  // ── Tier 4: sales (per jurisdiction) ─────────────────────────────────────
  {
    dataset_id: "nsw_sales_pilot",
    jurisdiction: "NSW",
    category: "sales",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/sales/build_nsw_sales_local_store.mjs",
    validate_script: "warehouse/scripts/sales/validate_nsw_sales_local_store.mjs",
    branch_load_script: "warehouse/scripts/sales/load_nsw_sales_marts_to_branch.mjs",
    local_report: "warehouse/reports/nsw_sales_local_store_report.json",
  },
  {
    dataset_id: "nsw_sales_full_state",
    jurisdiction: "NSW",
    category: "sales",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/sales/build_nsw_sales_full_state_local_store.mjs",
    validate_script: "warehouse/scripts/sales/validate_nsw_sales_full_state_local_store.mjs",
    branch_load_script: "warehouse/scripts/sales/load_nsw_full_state_to_branch.mjs",
    local_report: "warehouse/reports/nsw_sales_full_state_local_store_report.json",
  },
  {
    dataset_id: "nsw_sales_archive_1990_2000",
    jurisdiction: "NSW",
    category: "sales",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/sales/build_nsw_sales_archive_local_store.mjs",
    validate_script: "warehouse/scripts/sales/validate_nsw_sales_archive_local_store.mjs",
    branch_load_script: null, // deliberately NOT YET PROMOTED — would touch already-live core.fact_residential_sales_summary
    local_report: "warehouse/reports/nsw_sales_archive_local_store_report.json",
  },
  {
    dataset_id: "vic_sales",
    jurisdiction: "VIC",
    category: "sales",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/sales/build_vic_sales_local_store.mjs",
    validate_script: "warehouse/scripts/sales/validate_vic_sales_local_store.mjs",
    branch_load_script: "warehouse/scripts/market_intelligence/load_vic_market_intelligence_to_branch.mjs",
    local_report: "warehouse/reports/vic_sales_local_store_report.json",
  },

  // ── Tier 4: rents (per jurisdiction) ─────────────────────────────────────
  {
    dataset_id: "nsw_rents_pilot",
    jurisdiction: "NSW",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_nsw_rents_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_nsw_rents_local_store.mjs",
    branch_load_script: "warehouse/scripts/rents/load_nsw_rents_to_branch.mjs",
    local_report: "warehouse/reports/nsw_rental_bonds_local_store_report.json",
  },
  {
    dataset_id: "nsw_rents_full_state",
    jurisdiction: "NSW",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_nsw_rents_full_state_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_nsw_rents_full_state_local_store.mjs",
    branch_load_script: "warehouse/scripts/sales/load_nsw_full_state_to_branch.mjs", // combined sales+rent loader
    local_report: "warehouse/reports/nsw_sales_full_state_local_store_report.json",
  },
  {
    dataset_id: "vic_rents",
    jurisdiction: "VIC",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_vic_rents_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_vic_rents_local_store.mjs",
    branch_load_script: "warehouse/scripts/market_intelligence/load_vic_market_intelligence_to_branch.mjs",
    local_report: "warehouse/reports/vic_rents_local_store_report.json",
  },
  {
    dataset_id: "qld_rents",
    jurisdiction: "QLD",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_qld_rents_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_qld_rents_local_store.mjs",
    branch_load_script: "warehouse/scripts/rents/load_qld_sa_wa_rents_to_branch.mjs", // combined QLD+SA+WA loader
    local_report: "warehouse/reports/qld_rents_local_store_report.json",
  },
  {
    dataset_id: "sa_rents",
    jurisdiction: "SA",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_sa_rents_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_sa_rents_local_store.mjs",
    branch_load_script: "warehouse/scripts/rents/load_qld_sa_wa_rents_to_branch.mjs",
    local_report: "warehouse/reports/sa_rents_local_store_report.json",
  },
  {
    dataset_id: "wa_rents",
    jurisdiction: "WA",
    category: "rent",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/rents/build_wa_rents_local_store.mjs",
    validate_script: "warehouse/scripts/rents/validate_wa_rents_local_store.mjs",
    branch_load_script: "warehouse/scripts/rents/load_qld_sa_wa_rents_to_branch.mjs",
    local_report: "warehouse/reports/wa_rents_local_store_report.json",
  },

  // ── Tier 4: national context (independent of state sales/rent) ──────────
  {
    dataset_id: "building_approvals",
    jurisdiction: "ALL",
    category: "supply",
    tier: 4,
    depends_on: ["asgs_geography_backbone"],
    build_script: "warehouse/scripts/supply/build_building_approvals_local_store.mjs",
    validate_script: "warehouse/scripts/supply/validate_building_approvals_local_store.mjs",
    branch_load_script: "warehouse/scripts/supply/load_building_approvals_to_branch.mjs",
    local_report: "warehouse/reports/building_approvals_local_store_report.json",
  },
  {
    dataset_id: "rba_interest_rates",
    jurisdiction: "ALL",
    category: "macro",
    tier: 4,
    depends_on: [],
    build_script: "warehouse/scripts/macro/build_rba_rates_local_store.mjs",
    validate_script: "warehouse/scripts/macro/validate_rba_rates_local_store.mjs",
    branch_load_script: "warehouse/scripts/macro/load_rba_rates_to_branch.mjs",
    local_report: "warehouse/reports/rba_rates_local_store_report.json",
  },

  // ── Tier 5: derived snapshots (depend on sales+rent+census+approvals) ───
  {
    dataset_id: "nsw_market_intelligence_snapshot",
    jurisdiction: "NSW",
    category: "snapshot",
    tier: 5,
    depends_on: ["nsw_sales_pilot", "nsw_rents_pilot", "census_demographics", "building_approvals", "rba_interest_rates"],
    build_script: null, // pure in-database SQL combining already-loaded facts
    validate_script: "warehouse/scripts/market_intelligence/validate_market_intelligence.mjs",
    branch_load_script: "warehouse/scripts/market_intelligence/load_market_intelligence_to_branch.mjs",
    local_report: "warehouse/reports/market_intelligence_branch_load_report.json",
  },
  {
    dataset_id: "vic_market_intelligence_snapshot",
    jurisdiction: "VIC",
    category: "snapshot",
    tier: 5,
    depends_on: ["vic_sales", "vic_rents", "census_demographics", "building_approvals", "rba_interest_rates"],
    build_script: null,
    validate_script: null,
    branch_load_script: "warehouse/scripts/market_intelligence/load_vic_market_intelligence_to_branch.mjs",
    local_report: "warehouse/reports/victoria_branch_load_report.json",
  },
];

// notes (kept as a plain export rather than YAML comments, for the same
// reason this whole file isn't YAML — still readable by a human or a
// future doc-generation script):
export const REGISTRY_NOTES = [
  "Datasets with branch_load_script: null are intentionally not yet promoted — either deferred to a specific future workstream (documented per-entry) or the fact/mart tables are populated by a different dataset's combined loader (e.g. NSW/VIC rent facts load together with sales in the same market-intelligence transaction).",
  "This registry does not reimplement any fetch/parse/load logic — every script listed already exists, was individually built and validated in its own workstream, and remains independently runnable. The registry's job is ordering, filtering, and safety gating, not duplicating logic.",
  "geography-level filtering (SAL vs POA vs SA2 vs LGA) is not yet differentiated per dataset — most existing scripts build all applicable grains in one pass. Accepted as a CLI flag (--geography=) but currently informational only, same convention as v1's --since flag.",
];
