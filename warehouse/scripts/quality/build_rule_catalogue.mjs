#!/usr/bin/env node
/**
 * Sprint 12, Workstream 9 — populate meta.data_quality_rule from the
 * catalogue in rule_catalogue.mjs. Idempotent upsert.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default.
 *
 * Usage:
 *   node build_rule_catalogue.mjs             # dry run
 *   node build_rule_catalogue.mjs --execute
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { RULE_CATALOGUE } from "./rule_catalogue.mjs";
import { RULE_EXECUTORS } from "./rule_engine.mjs";

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

// Fail fast on a typo before touching the database: every catalogue row's
// rule_family must have a registered executor in rule_engine.mjs.
for (const rule of RULE_CATALOGUE) {
  if (!RULE_EXECUTORS[rule.ruleFamily]) fail(`rule '${rule.ruleId}' references unknown rule_family '${rule.ruleFamily}' — no executor registered in rule_engine.mjs`);
}
console.log(`  ${RULE_CATALOGUE.length} catalogue rows pre-validated against RULE_EXECUTORS`);

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`build_rule_catalogue — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();

const [chk] = (await client.query("select to_regclass('meta.data_quality_rule') r")).rows;
if (!chk.r) fail("meta.data_quality_rule missing — apply migration 032 first (hard stop)");

if (!EXECUTE) {
  console.log(`\nDry run: would upsert ${RULE_CATALOGUE.length} rows into meta.data_quality_rule.`);
  await client.end();
  process.exit(0);
}

let upserted = 0;
for (const r of RULE_CATALOGUE) {
  const res = await client.query(
    `insert into meta.data_quality_rule
       (rule_id, rule_family, description, domain, target_schema, target_table, jurisdiction_code, geography_grain, severity, blocking, expected_threshold)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (rule_id) do update set
       rule_family = excluded.rule_family, description = excluded.description, domain = excluded.domain,
       target_schema = excluded.target_schema, target_table = excluded.target_table, jurisdiction_code = excluded.jurisdiction_code,
       geography_grain = excluded.geography_grain, severity = excluded.severity, blocking = excluded.blocking,
       expected_threshold = excluded.expected_threshold, updated_at = now()`,
    [
      r.ruleId, r.ruleFamily, r.description, r.domain ?? null, r.targetSchema ?? null, r.targetTable ?? null,
      r.jurisdictionCode ?? null, r.geographyGrain ?? null, r.severity ?? "blocker", r.severity !== "advisory",
      r.expectedThreshold ? JSON.stringify(r.expectedThreshold) : null,
    ]
  );
  upserted += res.rowCount;
}
console.log(`\n  meta.data_quality_rule: ${upserted} rows upserted`);

const [summary] = (await client.query("select count(*)::int as total, count(*) filter (where blocking)::int as blocking, count(*) filter (where not blocking)::int as advisory from meta.data_quality_rule")).rows;
await client.end();
console.log(`Total rules registered: ${summary.total} (${summary.blocking} blocking, ${summary.advisory} advisory)`);
