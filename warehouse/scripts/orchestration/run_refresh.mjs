#!/usr/bin/env node
/**
 * Refresh runner (Sprint 10, Phase 13). Dispatches to each dataset's known
 * local build/validate scripts and records a meta.dataset_refresh_run row.
 * Defaults to --dry-run. Never targets production. Branch loads require
 * the explicit --branch-load flag on top of --execute. Raw downloads stay
 * local — this script never invokes a headed-browser download itself
 * (those require interactive Cloudflare-challenge handling); it tells the
 * operator the exact command to run first if raw files are missing.
 *
 * A failing dataset's run is isolated to its own meta.dataset_refresh_run
 * row — it never blocks or corrupts another dataset's run.
 *
 * Usage:
 *   node run_refresh.mjs --dataset=vic_vpsr_median_house --plan
 *   node run_refresh.mjs --dataset=vic_vpsr_median_house --dry-run
 *   node run_refresh.mjs --dataset=vic_vpsr_median_house --execute --local-only
 *   node run_refresh.mjs --dataset=vic_vpsr_median_house --execute --branch-load
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
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
const has = (name) => args.includes(`--${name}`);

const datasetId = argVal("dataset");
const jurisdictionArg = argVal("jurisdiction");
const sinceArg = argVal("since");
const isPlan = has("plan");
const isDryRun = has("dry-run") || (!has("execute") && !isPlan);
const isExecute = has("execute");
const localOnly = has("local-only");
const branchLoad = has("branch-load");
const noDownload = has("no-download");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// Dispatch table: dataset_id -> local (no-Supabase) build/validate script
// pairs. Datasets not listed here require a documented manual/interactive
// step (raw download via headed browser) not automatable by this script.
const DISPATCH = {
  vic_vpsr_median_house: { build: "warehouse/scripts/sales/build_vic_sales_local_store.mjs", validate: "warehouse/scripts/sales/validate_vic_sales_local_store.mjs" },
  vic_vpsr_median_unit: { build: "warehouse/scripts/sales/build_vic_sales_local_store.mjs", validate: "warehouse/scripts/sales/validate_vic_sales_local_store.mjs" },
  vic_vpsr_median_land: { build: "warehouse/scripts/sales/build_vic_sales_local_store.mjs", validate: "warehouse/scripts/sales/validate_vic_sales_local_store.mjs" },
  vic_moving_annual_rent_by_suburb: { build: "warehouse/scripts/rents/build_vic_rents_local_store.mjs", validate: "warehouse/scripts/rents/validate_vic_rents_local_store.mjs" },
  vic_quarterly_median_rent_by_lga: { build: "warehouse/scripts/rents/build_vic_rents_local_store.mjs", validate: "warehouse/scripts/rents/validate_vic_rents_local_store.mjs" },
};
const BRANCH_LOAD_SCRIPT = "warehouse/scripts/market_intelligence/load_vic_market_intelligence_to_branch.mjs";

if (!datasetId && !jurisdictionArg) fail("must supply --dataset=<id> or --jurisdiction=<NSW|VIC>");

process.loadEnvFile(".env.local");
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);
if (has("target=production") || argVal("target") === "production") fail("refusing: --target=production is never supported by this orchestrator");

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const datasetsToRun = datasetId
  ? [datasetId]
  : // crude jurisdiction filter for --jurisdiction=VIC scope (all dispatch entries are VIC this sprint)
    Object.keys(DISPATCH).filter(() => jurisdictionArg === "VIC");

if (datasetsToRun.length === 0) fail(`no matching dataset for --dataset=${datasetId} --jurisdiction=${jurisdictionArg}`);

console.log(
  `run_refresh — mode=${isPlan ? "plan" : isExecute ? "execute" : "dry-run"} target=${branchLoad ? "branch" : "local"} datasets=${datasetsToRun.join(",")}` +
    (sinceArg ? ` since=${sinceArg} (accepted, not yet used to filter partial-history refreshes)` : "") +
    (noDownload ? " no-download=true (accepted, no dataset here has an automated download step yet)" : "")
);

for (const id of datasetsToRun) {
  const runResult = await client.query(
    `insert into meta.dataset_refresh_run (dataset_id, mode, status, target)
     values ($1, $2, 'running', $3) returning refresh_run_id`,
    [id, isPlan ? "plan" : isExecute ? (branchLoad ? "branch-load" : "download") : "dry-run", branchLoad ? "branch" : "local"]
  );
  const runId = runResult.rows[0].refresh_run_id;

  try {
    const dispatch = DISPATCH[id];
    if (!dispatch) throw new Error(`no automated dispatch entry for ${id} — requires manual/headed-browser download step, see warehouse/config/refresh_policies.yml`);

    if (isPlan || isDryRun) {
      console.log(`  [${id}] plan: would run ${dispatch.build} then ${dispatch.validate}`);
      await client.query(`update meta.dataset_refresh_run set status='succeeded', completed_at=now(), manifest=$2 where refresh_run_id=$1`, [runId, JSON.stringify({ planned_scripts: [dispatch.build, dispatch.validate] })]);
      continue;
    }

    if (localOnly || !branchLoad) {
      console.log(`  [${id}] running local build+validate (no Supabase writes)...`);
      execFileSync("node", [rel(dispatch.build)], { stdio: "inherit" });
      execFileSync("node", [rel(dispatch.validate)], { stdio: "inherit" });
      await client.query(`update meta.dataset_refresh_run set status='succeeded', completed_at=now(), manifest=$2 where refresh_run_id=$1`, [runId, JSON.stringify({ ran_scripts: [dispatch.build, dispatch.validate], target: "local" })]);
      console.log(`  [${id}] local refresh succeeded.`);
    } else if (branchLoad) {
      console.log(`  [${id}] branch-load requested — delegating to ${BRANCH_LOAD_SCRIPT} --execute (covers all VIC datasets in one transaction, not per-dataset)`);
      execFileSync("node", [rel(BRANCH_LOAD_SCRIPT), "--execute"], { stdio: "inherit" });
      await client.query(`update meta.dataset_refresh_run set status='succeeded', completed_at=now(), branch_ref_used=$2, manifest=$3 where refresh_run_id=$1`, [runId, BRANCH_REF, JSON.stringify({ ran_script: BRANCH_LOAD_SCRIPT, target: "branch" })]);
      console.log(`  [${id}] branch-load succeeded.`);
    }
  } catch (err) {
    console.error(`  [${id}] FAILED: ${err.message}`);
    await client.query(`update meta.dataset_refresh_run set status='failed', completed_at=now(), error_message=$2 where refresh_run_id=$1`, [runId, String(err.message).slice(0, 2000)]);
    // Continue to the next dataset — one failure must not corrupt another dataset's run.
  }
}

await client.end();
console.log("\nAll requested dataset runs recorded in meta.dataset_refresh_run. See generate_refresh_report.mjs for a summary.");
