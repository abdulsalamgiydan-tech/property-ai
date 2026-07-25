#!/usr/bin/env node
/**
 * Sprint 12, Workstream 8 — lineage completeness validator (CLI).
 *
 * "No mart metric may be considered publishable if mandatory lineage is
 * absent" (Foundation Block mission requirement). Read-only — makes no
 * writes. Exits non-zero if any MANDATORY combination is missing lineage.
 *
 * The actual check logic lives in validate_metric_lineage_completeness_lib.mjs
 * (Sprint 12 WS9 also calls it, via the missing_lineage rule in
 * warehouse/scripts/quality/rule_engine.mjs, so there is exactly one
 * implementation).
 *
 * Usage:
 *   node validate_metric_lineage_completeness.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { validateLineageCompleteness } from "./validate_metric_lineage_completeness_lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

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

const result = await validateLineageCompleteness(client);

console.log(`\nLineage completeness: ${result.covered}/${result.total} (${result.completenessPct}%) populated metric x jurisdiction combinations have a matching registry entry.`);
if (result.gaps.length > 0) {
  console.log(`\nGaps (${result.gaps.length}):`);
  for (const g of result.gaps) console.log(`  ${g.mandatory ? "MANDATORY" : "optional "} — ${g.martTable}.${g.metricName} (${g.jurisdiction})`);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  total_combinations_checked: result.total,
  covered: result.covered,
  completeness_pct: result.completenessPct,
  gaps: result.gaps,
  mandatory_gap_count: result.mandatoryGapCount,
  verdict: result.verdict,
};
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "metric_lineage_completeness_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`\nRun report written: warehouse/reports/metric_lineage_completeness_report.json`);
console.log(`Verdict: ${report.verdict}${result.mandatoryGapCount > 0 ? ` (${result.mandatoryGapCount} mandatory gaps — these mart metrics are not publishable until lineage is registered)` : ""}`);

if (result.mandatoryGapCount > 0) process.exit(1);
