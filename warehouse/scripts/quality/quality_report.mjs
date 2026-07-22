#!/usr/bin/env node
/**
 * Sprint 12, Workstream 9 — comprehensive quality/freshness report.
 * Read-only. Combines meta.data_quality_rule/run/result, meta.data_incident,
 * meta.data_quarantine_summary, meta.dataset_freshness_status, and the WS8
 * lineage completeness check into one report.
 *
 * Usage:
 *   node quality_report.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { validateLineageCompleteness } from "../lineage/validate_metric_lineage_completeness_lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
function fail(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

const freshness = await q("select dataset_id, jurisdiction, freshness_status, expected_cadence_days, last_retrieved_at from meta.dataset_freshness_status order by freshness_status, dataset_id");
const freshnessByStatus = {};
for (const f of freshness) (freshnessByStatus[f.freshness_status] ??= []).push(f);

const [latestRun] = await q("select quality_run_id, started_at, completed_at, status, rules_run, rules_passed, rules_failed_blocking, rules_failed_advisory from meta.data_quality_run order by started_at desc limit 1");
const latestFailedRules = await q(
  `select rule_id, severity, status, failed_record_count from meta.data_quality_result
   where quality_run_id = $1 and status = 'failed' order by severity, rule_id`,
  [latestRun?.quality_run_id ?? null]
);

const openIncidents = await q("select count(*)::int as n from meta.data_incident where status='open'");
const quarantineTotal = await q("select coalesce(sum(quarantined_count),0)::int as n from meta.data_quarantine_summary");

const [confidenceCompleteness] = await q(`
  select
    count(*) filter (where median_sale_price_12m is not null)::int as sales_populated,
    count(*) filter (where median_sale_price_12m is not null and sales_sample_confidence is not null)::int as sales_with_confidence,
    count(*) filter (where median_weekly_rent_latest is not null)::int as rent_populated,
    count(*) filter (where median_weekly_rent_latest is not null and rent_confidence is not null)::int as rent_with_confidence
  from mart.suburb_market_snapshot where dwelling_type is null`);
const confidencePct = (populated, withConf) => (populated > 0 ? Math.round((withConf / populated) * 1000) / 10 : 100);

const lineage = await validateLineageCompleteness(client);

const geoCoverage = await q(`
  select geography_type, count(*) filter (where is_current)::int as current_count
  from core.dim_geography group by 1 order by 1`);

const [dbSize] = await q("select pg_database_size(current_database())/1024.0/1024 as mb, pg_size_pretty(pg_database_size(current_database())) as pretty");

let localStorageMb = null;
try {
  const localDir = rel("warehouse", "data", "local");
  if (fs.existsSync(localDir)) {
    const files = fs.readdirSync(localDir);
    let bytes = 0;
    for (const f of files) bytes += fs.statSync(path.join(localDir, f)).size;
    localStorageMb = Math.round((bytes / 1024 / 1024) * 10) / 10;
  }
} catch {}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  latest_quality_run: latestRun ?? null,
  latest_run_failed_rules: latestFailedRules,
  freshness_summary: Object.fromEntries(Object.entries(freshnessByStatus).map(([k, v]) => [k, v.length])),
  freshness_detail: freshness,
  open_incident_count: openIncidents[0].n,
  quarantined_row_total: quarantineTotal[0].n,
  confidence_completeness: {
    sales_pct: confidencePct(confidenceCompleteness.sales_populated, confidenceCompleteness.sales_with_confidence),
    rent_pct: confidencePct(confidenceCompleteness.rent_populated, confidenceCompleteness.rent_with_confidence),
  },
  lineage_completeness_pct: lineage.completenessPct,
  lineage_mandatory_gaps: lineage.mandatoryGapCount,
  geography_coverage: geoCoverage,
  branch_storage_mb: Math.round(dbSize.mb * 10) / 10,
  branch_storage_pretty: dbSize.pretty,
  local_storage_mb: localStorageMb,
};

await client.end();
fs.writeFileSync(rel("warehouse", "reports", "quality_summary_report.json"), JSON.stringify(report, null, 2) + "\n");

console.log(`Latest quality run: ${latestRun ? `${latestRun.rules_passed}/${latestRun.rules_run} passed (${latestRun.rules_failed_blocking} blocking, ${latestRun.rules_failed_advisory} advisory failures)` : "none recorded yet"}`);
console.log(`Freshness: ${JSON.stringify(report.freshness_summary)}`);
console.log(`Open incidents: ${report.open_incident_count} | Quarantined rows: ${report.quarantined_row_total}`);
console.log(`Confidence completeness — sales: ${report.confidence_completeness.sales_pct}%, rent: ${report.confidence_completeness.rent_pct}%`);
console.log(`Lineage completeness: ${report.lineage_completeness_pct}% (${report.lineage_mandatory_gaps} mandatory gaps)`);
console.log(`Branch storage: ${report.branch_storage_pretty}${localStorageMb !== null ? ` | Local storage: ${localStorageMb} MB` : ""}`);
console.log("\nRun report written: warehouse/reports/quality_summary_report.json");
