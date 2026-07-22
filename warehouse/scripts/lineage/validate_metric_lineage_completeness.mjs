#!/usr/bin/env node
/**
 * Sprint 12, Workstream 8 — lineage completeness validator.
 *
 * "No mart metric may be considered publishable if mandatory lineage is
 * absent" (Foundation Block mission requirement). This script is the
 * enforcement mechanism: for every (mart_table, metric_family, jurisdiction)
 * combination that actually has non-null data present in the branch, it
 * checks whether meta.metric_lineage_registry has a matching entry (either
 * jurisdiction-specific, or a national NULL-jurisdiction rule). Read-only —
 * makes no writes. Exits non-zero if any MANDATORY combination is missing
 * lineage (a real completeness failure, not just informational).
 *
 * Usage:
 *   node validate_metric_lineage_completeness.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { postcodeToState } from "../lib/postcode_to_state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// metric_family -> representative column used to test "does this
// jurisdiction actually have non-null data for this metric family".
const METRIC_FAMILY_COLUMNS = {
  sales: "sales_volume_12m",
  rent: "median_weekly_rent_latest",
  yield: "gross_yield_pct",
  approvals: "approvals_12m",
  dwelling_stock: "dwelling_stock_total",
  demographics: "total_population",
  population_growth: "population_growth_2016_2021_pct",
  affordability: "est_monthly_repayment_owner_occupier",
};

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log("validate_metric_lineage_completeness — read-only");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const registryRows = await q(
  "select mart_table, metric_name, jurisdiction_code, mandatory from meta.metric_lineage_registry"
);
// Index: mart_table -> metric_name -> Set(jurisdiction_code or null-for-national)
const registryIndex = new Map();
for (const r of registryRows) {
  const key = `${r.mart_table}|${r.metric_name}`;
  if (!registryIndex.has(key)) registryIndex.set(key, new Map());
  registryIndex.get(key).set(r.jurisdiction_code ?? "__NATIONAL__", r.mandatory);
}

const results = [];
for (const martTable of ["suburb_market_snapshot", "postcode_market_snapshot"]) {
  const geoType = martTable === "suburb_market_snapshot" ? "SAL" : "POA";
  for (const [metricName, col] of Object.entries(METRIC_FAMILY_COLUMNS)) {
    const rows = await q(
      `select d.state_code, d.geography_code, count(*)::int as n
       from mart.${martTable} m
       join core.dim_geography d on d.geography_id = m.geography_id
       where m.dwelling_type is null and m.${col} is not null
       group by 1, 2`
    );
    if (rows.length === 0) continue; // no data at all for this metric family on this mart — nothing to validate
    const jurisdictionsWithData = new Set();
    for (const r of rows) {
      const state = r.state_code ?? (geoType === "POA" ? postcodeToState(r.geography_code) : null);
      if (state) jurisdictionsWithData.add(state);
    }
    const stateToJurisdiction = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT" };
    const registryKey = `${martTable}|${metricName}`;
    const registryEntry = registryIndex.get(registryKey);
    for (const state of jurisdictionsWithData) {
      const jur = stateToJurisdiction[state];
      if (!jur) continue; // unregistered state (e.g. Other Territories) — not a lineage gap, a jurisdiction-registration gap (out of WS8 scope)
      const hasNational = registryEntry?.has("__NATIONAL__");
      const hasSpecific = registryEntry?.has(jur);
      const covered = hasNational || hasSpecific;
      const mandatory = hasSpecific ? registryEntry.get(jur) : hasNational ? registryEntry.get("__NATIONAL__") : true;
      results.push({ martTable, metricName, jurisdiction: jur, covered, mandatory });
    }
  }
}

const total = results.length;
const covered = results.filter((r) => r.covered).length;
const gaps = results.filter((r) => !r.covered);
const mandatoryGaps = gaps.filter((r) => r.mandatory);
const completenessPct = total > 0 ? Math.round((covered / total) * 1000) / 10 : 100;

console.log(`\nLineage completeness: ${covered}/${total} (${completenessPct}%) populated metric x jurisdiction combinations have a matching registry entry.`);
if (gaps.length > 0) {
  console.log(`\nGaps (${gaps.length}):`);
  for (const g of gaps) console.log(`  ${g.mandatory ? "MANDATORY" : "optional "} — ${g.martTable}.${g.metricName} (${g.jurisdiction})`);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  total_combinations_checked: total,
  covered,
  completeness_pct: completenessPct,
  gaps,
  mandatory_gap_count: mandatoryGaps.length,
  verdict: mandatoryGaps.length === 0 ? "PASSED" : "FAILED",
};
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "metric_lineage_completeness_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`\nRun report written: warehouse/reports/metric_lineage_completeness_report.json`);
console.log(`Verdict: ${report.verdict}${mandatoryGaps.length > 0 ? ` (${mandatoryGaps.length} mandatory gaps — these mart metrics are not publishable until lineage is registered)` : ""}`);

if (mandatoryGaps.length > 0) process.exit(1);
