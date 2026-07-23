#!/usr/bin/env node
/**
 * National refresh engine v4 (Sprint 15, Workstream 13).
 *
 * v4 adds NO new execution capability over v3 — running a refresh is
 * still exclusively `refresh_engine_v3.mjs --execute`. The gap v4 closes
 * is visibility: today an operator has to separately run
 * plan_refresh.mjs, run_quality_check.mjs, and check_freshness.mjs and
 * mentally combine their output to answer "is it safe to run a refresh
 * right now, and has anything gotten worse recently?". v4's only command,
 * --summary, answers that in one read-only call, always dry-run (there is
 * no --execute flag on this script at all).
 *
 * Per this project's standing guardrail: no paid scheduling was added
 * (this remains a manually-invoked CLI command, not a cron job), and no
 * external notification service was introduced (output is stdout/JSON
 * only).
 *
 * Usage:
 *   node refresh_engine_v4.mjs --summary
 *   node refresh_engine_v4.mjs --summary --json
 *   node refresh_engine_v4.mjs --summary --domain=rent
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATASETS } from "../../config/refresh_registry.mjs";
import { filterByDomain, filterByJurisdiction } from "./refresh_lib.mjs";
import { buildRefreshSummary } from "./refresh_v4_lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const QUALITY_HISTORY_LIMIT = 10;

const args = process.argv.slice(2);
const argVal = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : null;
};
const has = (name) => args.includes(`--${name}`);

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

// This script has no --execute mode at all, but keeps the same hard-stop
// convention as v2/v3 in case a future flag ever tries to add one —
// defence in depth, cheap to keep consistent.
if (argVal("target") === "production") fail("--target=production is never supported by this orchestrator (hard stop)");

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL ?? "";
if (DB_URL.includes(PROD_REF)) fail(`connection string references PRODUCTION (${PROD_REF}) — refusing (hard stop)`);

if (!has("summary")) {
  console.log("refresh_engine_v4 currently supports one command: --summary");
  console.log("  node refresh_engine_v4.mjs --summary [--json] [--domain=<category>] [--jurisdiction=<code>]");
  process.exit(0);
}

if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set — required for --summary (hard stop)");
if (!DB_URL.includes(BRANCH_REF)) fail(`connection string does not reference the validation branch (${BRANCH_REF}) — refusing (hard stop)`);

const domainFilter = argVal("domain");
const jurisdictionFilter = argVal("jurisdiction") ?? "ALL";
const asJson = has("json");

let selected = filterByDomain(DATASETS.slice(), domainFilter);
selected = filterByJurisdiction(selected, jurisdictionFilter);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const { rows: freshnessRows } = await client.query(
  "select dataset_id, freshness_status from meta.dataset_freshness_status"
);
const { rows: qualityRuns } = await client.query(
  `select quality_run_id, started_at, rules_run, rules_passed, rules_failed_blocking, rules_failed_advisory
   from meta.data_quality_run
   order by started_at desc
   limit $1`,
  [QUALITY_HISTORY_LIMIT]
);
await client.end();

const summary = buildRefreshSummary({
  selectedDatasets: selected,
  freshnessRows,
  qualityRunsNewestFirst: qualityRuns,
});

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log("refresh_engine_v4 --summary (read-only, no writes, no execution)");
  console.log(`  Generated at:              ${summary.generated_at}`);
  console.log(`  Datasets in scope:         ${summary.selected_dataset_count}`);
  console.log(`  Freshness breakdown:       ${JSON.stringify(summary.freshness_counts)}`);
  console.log(`  Stale-or-worse datasets:   ${summary.stale_or_worse_count}`);
  console.log(`  Latest quality run:        ${summary.quality.latest_run_at ?? "none recorded"}`);
  console.log(`  Rules passed:              ${summary.quality.rules_passed ?? "n/a"} / ${summary.quality.rules_run ?? "n/a"}`);
  console.log(`  Blocking failures:         ${summary.quality.rules_failed_blocking ?? "n/a"} (trend: ${summary.quality.blocking_failure_trend})`);
  console.log(`  Advisory failures:         ${summary.quality.rules_failed_advisory ?? "n/a"}`);
  console.log(`  Pass-rate trend:           ${summary.quality.pass_rate_trend}`);
  console.log(`  Recommendation:            ${summary.safe_to_run_recommendation}`);
  console.log(`\nTo actually run a refresh: node refresh_engine_v3.mjs --execute --branch-load [...]`);
}
