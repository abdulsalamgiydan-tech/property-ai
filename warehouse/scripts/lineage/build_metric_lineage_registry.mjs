#!/usr/bin/env node
/**
 * Sprint 12, Workstream 8 — populate meta.metric_lineage_registry.
 *
 * This is hand-curated methodology metadata (which dataset/transformation
 * produced which metric, for which jurisdiction) — not something derivable
 * automatically from the data itself, the same way meta.source/meta.dataset
 * are hand-curated. The mapping below reflects what this project has
 * actually verified live across Sprints 9-12: which pipeline populates each
 * metric family on mart.suburb_market_snapshot / postcode_market_snapshot,
 * per jurisdiction, including which are direct loads vs. derived
 * calculations (yield, affordability, population_growth_2016_2021_pct).
 *
 * Idempotent: upserts on the (mart_table, metric_name, jurisdiction_code)
 * unique key, so re-running after a new jurisdiction's data lands (e.g. a
 * future TAS rent source) only needs a new row added below, not a rewrite.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default.
 *
 * Usage:
 *   node build_metric_lineage_registry.mjs             # dry run
 *   node build_metric_lineage_registry.mjs --execute
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// ── The registry itself ────────────────────────────────────────────────
// mart_table applies to BOTH suburb_market_snapshot and postcode_market_snapshot
// (identical sourcing logic at both grains — the underlying datasets carry
// SAL and POA rows from the same source file) unless a row explicitly says
// otherwise via the `martTables` override.
const SNAPSHOT_MARTS = ["suburb_market_snapshot", "postcode_market_snapshot"];

export const REGISTRY_ROWS = [
  // ── Sales ────────────────────────────────────────────────────────────
  {
    metricName: "sales", jurisdictionCode: "NSW", sourceId: "nsw_vg_sales",
    datasetId: "nsw_psi_2001_current_full_state", isDerived: false,
    transformationMethod: "direct_load",
    notes: "Covers sales_volume_12m, median_sale_price_12m, median_sale_price_detached/apartment/townhouse, annual_price_change_pct, sales_sample_confidence, sales_turnover_pct.",
  },
  {
    metricName: "sales", jurisdictionCode: "VIC", sourceId: "vic_vg_sales",
    datasetId: "vic_vpsr_median_house",
    contributingDatasetIds: ["vic_vpsr_median_unit", "vic_vpsr_median_land"],
    isDerived: false, transformationMethod: "direct_load_blended_dwelling_types",
    notes: "Blends 3 VPSR per-dwelling-type dataset files (house/unit/land) into the same metric family.",
  },
  // TAS/NT deliberately have NO sales row here -- their only sales data
  // (abs_tvd_tas_act_nt_gccsa) is GCCSA-grain, a coarser geography_type
  // than these SAL/POA marts (Sprint 12 WS6 finding). Absence here is
  // correct, not a gap.
  //
  // QLD/ACT DO have a small number of postcode-grain sales rows in
  // mart.postcode_market_snapshot, discovered by this workstream's own
  // completeness validator (not previously known) -- e.g. postcodes 4380,
  // 2611. Every one of these rows' own metric_provenance.sales_source is
  // 'nsw_vg_sales', and the volumes are tiny (1-5 transactions). Two
  // plausible explanations, NOT distinguished here: (a) a genuine
  // border-straddling postal catchment (e.g. Goondiwindi, 4380, sits on
  // the NSW/QLD border and NSW rural properties can use a QLD-numbered
  // postcode for delivery purposes), or (b) a small number of mis-matched
  // postcodes in the underlying NSW VG sales geography join. Registered
  // here as exactly what is verifiably true (source = nsw_vg_sales) rather
  // than guessing which explanation applies -- flagged for a future WS9
  // data-quality rule to investigate the join, not silently resolved here.
  {
    martTables: ["postcode_market_snapshot"],
    metricName: "sales", jurisdictionCode: "QLD", sourceId: "nsw_vg_sales",
    datasetId: "nsw_psi_2001_current_full_state", isDerived: false,
    transformationMethod: "cross_border_postcode_attribution_unresolved",
    notes: "Small number of postcode-grain rows (e.g. 4380 Goondiwindi) where NSW VG sales data appears under a QLD-range postcode heuristic bucket. Volumes are tiny (1-5 transactions per postcode). Root cause not yet determined (genuine cross-border postal catchment vs. a geography-join data-quality issue) -- flagged for WS9.",
  },
  {
    martTables: ["postcode_market_snapshot"],
    metricName: "sales", jurisdictionCode: "ACT", sourceId: "nsw_vg_sales",
    datasetId: "nsw_psi_2001_current_full_state", isDerived: false,
    transformationMethod: "cross_border_postcode_attribution_unresolved",
    notes: "Small number of postcode-grain rows (e.g. 2611, 2612, 2618 -- central Canberra postcodes) where NSW VG sales data appears under an ACT-range postcode heuristic bucket. Volumes are tiny (1-4 transactions per postcode). Unlike the QLD case, these postcodes are firmly inside Canberra, not a plausible border catchment -- more likely a small number of mis-matched records in the underlying NSW sales geography join. Flagged for WS9 investigation, not resolved here.",
  },

  // ── Rent ─────────────────────────────────────────────────────────────
  {
    metricName: "rent", jurisdictionCode: "NSW", sourceId: "nsw_rent_and_sales_report",
    datasetId: "nsw_rent_tables_full_state", isDerived: false,
    transformationMethod: "quarterly_mart_latest_value",
    notes: "Latest value taken from mart.suburb_rent_quarterly / postcode_rent_quarterly (dwelling_type='all').",
  },
  {
    metricName: "rent", jurisdictionCode: "VIC", sourceId: "vic_rent",
    datasetId: "vic_moving_annual_rent_by_suburb", isDerived: false,
    transformationMethod: "direct_load_snapshot_only",
    notes: "Sprint 10 pipeline loads directly into the snapshot's rent columns -- unlike NSW/QLD/SA/WA, VIC has zero rows in core.fact_rental_market_summary / mart.suburb_rent_quarterly (confirmed live, Sprint 12 WS1). A real, documented architecture gap: VIC rent has no queryable quarterly history mart.",
  },
  {
    metricName: "rent", jurisdictionCode: "QLD", sourceId: "qld_rent",
    datasetId: "qld_rta_bond_statistics", isDerived: false,
    transformationMethod: "quarterly_mart_latest_value_multi_state_rollup",
    notes: "Loaded into core.fact_rental_market_summary + mart.suburb_rent_quarterly Sprint 11 WS9; rolled up into the wide snapshot Sprint 12 WS6 (previously landed in the quarterly mart but never reached the snapshot).",
  },
  {
    metricName: "rent", jurisdictionCode: "SA", sourceId: "sa_rent",
    datasetId: "sa_private_rent_report", isDerived: false,
    transformationMethod: "quarterly_mart_latest_value_multi_state_rollup",
    notes: "Same rollup history as QLD -- see above.",
  },
  {
    metricName: "rent", jurisdictionCode: "WA", sourceId: "wa_rent",
    datasetId: "wa_dmirs_bond_lodgements", isDerived: false,
    transformationMethod: "quarterly_mart_latest_value_multi_state_rollup",
    notes: "Same rollup history as QLD -- see above.",
  },
  // TAS/ACT/NT have no rent row: TAS is Cloudflare-blocked (live-reconfirmed
  // Sprint 12 WS2); ACT/NT have no known free rent source found. mandatory=false.
  { metricName: "rent", jurisdictionCode: "TAS", mandatory: false, isDerived: false, transformationMethod: "no_source_available", notes: "CBOS Tasmania blocked by Cloudflare bot-protection, live-reconfirmed Sprint 12 WS2 -- not bypassed per this project's hard rule against CAPTCHA/WAF evasion." },
  { metricName: "rent", jurisdictionCode: "ACT", mandatory: false, isDerived: false, transformationMethod: "no_source_available", notes: "No free ACT rent source identified as of Sprint 12." },
  { metricName: "rent", jurisdictionCode: "NT", mandatory: false, isDerived: false, transformationMethod: "no_source_available", notes: "No free NT rent source identified as of Sprint 12." },

  // ── Yield (derived) ──────────────────────────────────────────────────
  {
    metricName: "yield", jurisdictionCode: null, sourceId: null, datasetId: null,
    isDerived: true, transformationMethod: "gross_yield_ratio",
    notes: "gross_yield_pct = (median_weekly_rent * 52) / median_sale_price * 100, only computed when both sales and rent sample_size_confidence are high/medium (see load_market_intelligence_to_branch.mjs buildYieldMart). Requires both a sales and a rent row to exist for the same geography -- QLD/SA/WA have zero sales at any grain, so no yield is computed for them (correctly matches their meta.jurisdiction 'rent_only' status).",
  },

  // ── Approvals (national) ────────────────────────────────────────────
  {
    metricName: "approvals", jurisdictionCode: null, sourceId: "abs_building_approvals",
    datasetId: "building_approvals_sa2_2021", isDerived: false,
    transformationMethod: "direct_load", notes: "Covers approvals_12m, approvals_per_1000_dwellings, approvals_detached_12m, approvals_other_residential_12m, supply_confidence. National ABS source, one methodology for every jurisdiction present.",
  },

  // ── Supply (dwelling commencements/completions, national, STATE grain only) ─
  {
    metricName: "dwelling_construction_activity", jurisdictionCode: null,
    sourceId: "abs_building_activity", datasetId: "abs_dwelling_construction_activity_state",
    isDerived: false, transformationMethod: "direct_load", mandatory: false,
    notes: "STATE grain only (core.fact_dwelling_construction_activity) -- does not appear on suburb/postcode_market_snapshot at all, a coarser-grain source than these marts. Registered here as a national fact, not tied to the snapshot marts, for lineage completeness of the fact table itself.",
    martTables: ["fact_dwelling_construction_activity"], martSchema: "core",
  },

  // ── Dwelling stock (Census, national methodology) ───────────────────
  {
    metricName: "dwelling_stock", jurisdictionCode: null, sourceId: "abs_census",
    datasetId: "census_mb_counts_2021", isDerived: false,
    transformationMethod: "direct_load", notes: "dwelling_stock_total. Mesh Block counts aggregated to SAL/POA via the ASGS correspondence.",
  },

  // ── Demographics (Census, national methodology) ─────────────────────
  {
    metricName: "demographics", jurisdictionCode: null, sourceId: "abs_census",
    datasetId: "census_gcp_sal_2021", contributingDatasetIds: ["census_gcp_poa_2021"],
    isDerived: false, transformationMethod: "direct_load",
    notes: "Covers total_population, total_households, median_weekly_household_income, renter_household_pct, owner_occupier_pct, renter_share, owner_with_mortgage_share.",
  },

  // ── Population growth (derived, cross-census boundary reconciliation) ─
  {
    metricName: "population_growth", jurisdictionCode: null, sourceId: "abs_census",
    datasetId: "abs_correspondence_2016_2021", isDerived: true,
    transformationMethod: "cross_census_boundary_reconciliation",
    correspondenceVersion: "ABS_2016_to_ASGS3_2021",
    notes: "population_growth_2016_2021_pct. Built Sprint 12 WS4: 2016 SSC/POA population reconciled onto 2021 SAL/POA boundaries via population-weighted ABS correspondence (national reconciliation accuracy 99.80%, within the documented +/-0.5% tolerance). Rolled up from mart.suburb_demographic_profile_2021 into the wide snapshot Sprint 12 WS6.",
  },

  // ── Affordability (derived, national formula + RBA rate) ────────────
  {
    metricName: "affordability", jurisdictionCode: null, sourceId: "rba_interest_rates",
    datasetId: "rba_housing_lending_rates", isDerived: true,
    transformationMethod: "affordability_repayment_formula",
    notes: "Covers price_to_income_ratio, rent_to_income_ratio, est_monthly_repayment_owner_occupier/investor, repayment_to_income_pct, rba_rate_used. Standard principal-and-interest repayment formula against meta.metric_assumption scenario 'standard_20pct_deposit_30yr_pi' -- a documented baseline for research context, not a recommendation.",
  },
];

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`build_metric_lineage_registry — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const [chk] = await q("select to_regclass('meta.metric_lineage_registry') r");
if (!chk.r) fail("meta.metric_lineage_registry missing — apply migration 030 first (hard stop)");

// Validate every referenced dataset_id/source_id/jurisdiction_code actually
// exists before writing anything (fail fast on a typo rather than a
// half-written registry).
const knownDatasets = new Set((await q("select dataset_id from meta.dataset")).map((r) => r.dataset_id));
const knownSources = new Set((await q("select source_id from meta.source")).map((r) => r.source_id));
const knownJurisdictions = new Set((await q("select jurisdiction_code from meta.jurisdiction")).map((r) => r.jurisdiction_code));

let rowsToInsert = 0;
for (const row of REGISTRY_ROWS) {
  const marts = row.martTables ?? SNAPSHOT_MARTS;
  rowsToInsert += marts.length;
  if (row.datasetId && !knownDatasets.has(row.datasetId)) fail(`unknown dataset_id '${row.datasetId}' referenced for metric '${row.metricName}'`);
  for (const d of row.contributingDatasetIds ?? []) {
    if (!knownDatasets.has(d)) fail(`unknown contributing dataset_id '${d}' referenced for metric '${row.metricName}'`);
  }
  if (row.sourceId && !knownSources.has(row.sourceId)) fail(`unknown source_id '${row.sourceId}' referenced for metric '${row.metricName}'`);
  if (row.jurisdictionCode && !knownJurisdictions.has(row.jurisdictionCode)) fail(`unknown jurisdiction_code '${row.jurisdictionCode}' referenced for metric '${row.metricName}'`);
}
console.log(`  ${REGISTRY_ROWS.length} logical metric-lineage rules pre-validated against meta.dataset/source/jurisdiction (${rowsToInsert} physical rows across mart tables)`);

if (!EXECUTE) {
  console.log(`\nDry run: would upsert ${rowsToInsert} rows into meta.metric_lineage_registry.`);
  await client.end();
  process.exit(0);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  rows_upserted: 0,
};

try {
  await client.query("begin");
  let upserted = 0;
  for (const row of REGISTRY_ROWS) {
    const marts = row.martTables ?? SNAPSHOT_MARTS;
    const martSchema = row.martSchema ?? "mart";
    for (const mart of marts) {
      const res = await client.query(
        `insert into meta.metric_lineage_registry
           (mart_schema, mart_table, metric_name, jurisdiction_code, source_id, dataset_id, contributing_dataset_ids, is_derived, transformation_method, correspondence_version, mandatory, notes)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict (mart_table, metric_name, jurisdiction_code) do update set
           source_id = excluded.source_id, dataset_id = excluded.dataset_id,
           contributing_dataset_ids = excluded.contributing_dataset_ids,
           is_derived = excluded.is_derived, transformation_method = excluded.transformation_method,
           correspondence_version = excluded.correspondence_version, mandatory = excluded.mandatory,
           notes = excluded.notes, updated_at = now()`,
        [
          martSchema, mart, row.metricName, row.jurisdictionCode ?? null, row.sourceId ?? null, row.datasetId ?? null,
          row.contributingDatasetIds ?? [], row.isDerived ?? false, row.transformationMethod,
          row.correspondenceVersion ?? null, row.mandatory ?? true, row.notes ?? null,
        ]
      );
      upserted += res.rowCount;
    }
  }
  report.rows_upserted = upserted;
  await client.query("commit");
  console.log(`\n  meta.metric_lineage_registry: ${upserted} rows upserted`);
  console.log("Branch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 500)}`);
}

const [summary] = await q("select count(*)::int as total from meta.metric_lineage_registry");
report.core_state = summary;
await client.end();

const fs = await import("node:fs");
fs.writeFileSync(rel("warehouse", "reports", "metric_lineage_registry_build_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/metric_lineage_registry_build_report.json");
console.log(`total registry rows: ${summary.total}`);
