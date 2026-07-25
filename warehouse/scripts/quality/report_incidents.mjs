#!/usr/bin/env node
/**
 * Sprint 12, Workstream 9 — incident report. Read-only.
 *
 * Usage:
 *   node report_incidents.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

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

const open = (await client.query(
  `select i.incident_id, i.rule_id, i.target_schema, i.target_table, i.jurisdiction_code, i.severity, i.summary, i.occurrence_count, i.opened_at
   from meta.data_incident i where i.status = 'open' order by i.severity, i.opened_at`
)).rows;
const resolved = (await client.query(
  `select count(*)::int as n from meta.data_incident where status = 'resolved'`
)).rows[0].n;
const quarantine = (await client.query(
  `select rule_id, target_schema, target_table, reason, quarantined_count, created_at from meta.data_quarantine_summary order by created_at desc limit 20`
)).rows;
const quarantineTotal = (await client.query(`select coalesce(sum(quarantined_count),0)::int as n from meta.data_quarantine_summary`)).rows[0].n;

console.log(`Open incidents: ${open.length}`);
for (const i of open) {
  const target = i.target_schema && i.target_table ? `${i.target_schema}.${i.target_table}` : "cross-cutting";
  console.log(`  [${i.severity}] ${i.rule_id} (${target}${i.jurisdiction_code ? `, ${i.jurisdiction_code}` : ""}) — occurred ${i.occurrence_count}x — ${i.summary}`);
}
console.log(`\nResolved incidents (all-time): ${resolved}`);
console.log(`\nQuarantined rows (all-time total): ${quarantineTotal}`);
for (const q of quarantine) console.log(`  ${q.rule_id}: ${q.quarantined_count} row(s) in ${q.target_schema}.${q.target_table} — ${q.reason}`);

const report = { generated_at: new Date().toISOString(), branch_ref: BRANCH_REF, production_touched: false, open_incidents: open, resolved_incident_count: resolved, quarantine_total: quarantineTotal, quarantine_summary: quarantine };
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "data_incidents_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/data_incidents_report.json");
