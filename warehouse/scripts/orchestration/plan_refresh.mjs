#!/usr/bin/env node
/**
 * Refresh planner (Sprint 10, Phase 13). Read-only against the branch —
 * computes which datasets are due/stale based on
 * meta.dataset_refresh_policy (expected_cadence_days) vs the most recent
 * successful meta.dataset_refresh_run per dataset. Never writes anything.
 *
 * Usage:
 *   node plan_refresh.mjs                        # plan for every policy row
 *   node plan_refresh.mjs --jurisdiction=VIC
 *   node plan_refresh.mjs --dataset=vic_vpsr_median_house
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

const args = process.argv.slice(2);
const argVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : null;
};
const jurisdictionFilter = argVal("jurisdiction");
const datasetFilter = argVal("dataset");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

process.loadEnvFile(".env.local");
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const policies = await client.query(`
  select p.dataset_id, p.jurisdiction, p.refresh_frequency, p.expected_cadence_days,
         p.source_discovery_method, p.auto_discoverable, p.requires_headed_browser,
         (select max(started_at) from meta.dataset_refresh_run r where r.dataset_id = p.dataset_id and r.status = 'succeeded') as last_success
  from meta.dataset_refresh_policy p
  where ($1::text is null or p.jurisdiction = $1)
    and ($2::text is null or p.dataset_id = $2)
  order by p.dataset_id
`, [jurisdictionFilter, datasetFilter]);

await client.end();

const now = new Date();
const plan = policies.rows.map((row) => {
  const lastSuccess = row.last_success ? new Date(row.last_success) : null;
  const ageDays = lastSuccess ? Math.floor((now - lastSuccess) / 86400000) : null;
  let action;
  if (!lastSuccess) action = "never_refreshed_locally — run download step manually";
  else if (ageDays > row.expected_cadence_days * 1.5) action = "stale — refresh recommended";
  else if (ageDays > row.expected_cadence_days) action = "due — refresh recommended";
  else action = "current — no action needed";
  return {
    dataset_id: row.dataset_id,
    jurisdiction: row.jurisdiction,
    expected_cadence_days: row.expected_cadence_days,
    last_success_run_at: row.last_success,
    age_days_since_last_success: ageDays,
    auto_discoverable: row.auto_discoverable,
    requires_headed_browser: row.requires_headed_browser,
    recommended_action: action,
  };
});

console.log(JSON.stringify({ generated_at: now.toISOString(), plan }, null, 2));
console.log(`\n${plan.length} dataset(s) planned. This command made no writes (read-only).`);
