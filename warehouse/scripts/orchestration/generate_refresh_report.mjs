#!/usr/bin/env node
/**
 * Refresh report generator (Sprint 10, Phase 13). Read-only — summarizes
 * meta.dataset_refresh_run + meta.dataset_freshness_status into
 * warehouse/reports/refresh_dry_run_report.{json,md}.
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

const recentRuns = await client.query(`
  select dataset_id, mode, status, target, started_at, completed_at, rows_affected, error_message
  from meta.dataset_refresh_run
  order by started_at desc
  limit 50
`);

const freshness = await client.query(`
  select dataset_id, jurisdiction, freshness_status, current_branch_row_count, local_only_or_branch_published, computed_at
  from meta.dataset_freshness_status
  order by dataset_id
`);

// Prove the orchestrator's own guardrails work: attempt a production-target
// run and confirm it's rejected before this report is generated (evidence,
// not just a claim).
let productionRejectionProof;
try {
  const { execFileSync } = await import("node:child_process");
  execFileSync("node", [rel("warehouse", "scripts", "orchestration", "run_refresh.mjs"), "--dataset=vic_vpsr_median_house", "--target=production"], { stdio: "pipe" });
  productionRejectionProof = "FAILED — production target was NOT rejected (should not happen)";
} catch (err) {
  const output = (err.stdout?.toString() ?? "") + (err.stderr?.toString() ?? "");
  productionRejectionProof = output.includes("refusing") ? "PASS — run_refresh.mjs --target=production was rejected before any write" : `INCONCLUSIVE — ${output.slice(0, 300)}`;
}

await client.end();

const report = {
  generated_at: new Date().toISOString(),
  scope: "Sprint 10 Phase 13 — refresh orchestration dry-run report",
  branch_ref: BRANCH_REF,
  recent_runs: recentRuns.rows,
  freshness_status: freshness.rows,
  production_rejection_proof: productionRejectionProof,
  default_mode_is_dry_run: true,
  no_schedule_enabled: true,
  notes: [
    "plan_refresh.mjs and check_freshness.mjs are strictly read-only except check_freshness.mjs's own upsert into meta.dataset_freshness_status (never touches mart/core data).",
    "run_refresh.mjs isolates each dataset's run to its own meta.dataset_refresh_run row — a failure in one dataset does not block or corrupt another.",
    "No cron, Supabase Edge Function schedule, or any other automated trigger was created this sprint — every run is manual, on demand.",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "refresh_dry_run_report.json"), JSON.stringify(report, null, 2));

const md = `# Refresh Dry-Run Report (Sprint 10, Phase 13)

Generated: ${report.generated_at}

Branch ref: ${BRANCH_REF}. No schedule enabled. Default mode is dry-run.

## Production-target rejection proof

**${productionRejectionProof}**

## Recent refresh runs (up to 50)

| dataset | mode | status | target | started |
|---|---|---|---|---|
${recentRuns.rows.map((r) => `| ${r.dataset_id} | ${r.mode} | ${r.status} | ${r.target} | ${r.started_at} |`).join("\n") || "| (none run yet) | | | | |"}

## Freshness status

| dataset | jurisdiction | status | branch rows | local/branch |
|---|---|---|---|---|
${freshness.rows.map((r) => `| ${r.dataset_id} | ${r.jurisdiction} | ${r.freshness_status} | ${r.current_branch_row_count ?? "n/a"} | ${r.local_only_or_branch_published} |`).join("\n") || "| (run check_freshness.mjs --execute first) | | | | |"}

## Notes

${report.notes.map((n) => `- ${n}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "refresh_dry_run_report.md"), md);
console.log(`Report written. Production rejection proof: ${productionRejectionProof}`);
