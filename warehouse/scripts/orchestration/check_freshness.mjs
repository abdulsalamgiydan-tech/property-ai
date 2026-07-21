#!/usr/bin/env node
/**
 * Freshness checker (Sprint 10, Phase 13/14). Computes and upserts
 * meta.dataset_freshness_status per dataset — the ONLY write this script
 * makes (never touches mart/core data). Backs the /research/data-status
 * observability page (Phase 14).
 *
 * Usage:
 *   node check_freshness.mjs              # dry run — prints the plan, no write
 *   node check_freshness.mjs --execute    # upserts meta.dataset_freshness_status
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

process.loadEnvFile(".env.local");
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const policies = await client.query(`
  select p.dataset_id, p.jurisdiction, p.expected_cadence_days,
         -- Only a real download/branch-load run counts as evidence of
         -- freshness — 'plan'/'dry-run' modes never touch actual data and
         -- must never make a dataset appear more current than it is.
         (select max(started_at) from meta.dataset_refresh_run r where r.dataset_id = p.dataset_id and r.status = 'succeeded' and r.mode not in ('plan', 'dry-run')) as last_success_run,
         (select error_message from meta.dataset_refresh_run r where r.dataset_id = p.dataset_id and r.status = 'failed' order by started_at desc limit 1) as last_failure,
         (select s.source_url from meta.source s join meta.dataset d on d.source_id = s.source_id where d.dataset_id = p.dataset_id) as source_url
  from meta.dataset_refresh_policy p
  order by p.dataset_id
`);

// Branch row counts per jurisdiction, for the observability page's
// "current branch row count" column — best-available proxy per dataset
// family (sales datasets -> suburb_market_snapshot rows with sales data
// for that jurisdiction; rent datasets -> rows with rent data).
const rowCounts = await client.query(`
  select jurisdiction,
         count(*) filter (where median_sale_price_12m is not null) as sales_rows,
         count(*) filter (where median_weekly_rent_latest is not null) as rent_rows
  from mart.suburb_market_snapshot
  where jurisdiction is not null
  group by 1
`);
const rowCountByJurisdiction = Object.fromEntries(rowCounts.rows.map((r) => [r.jurisdiction, r]));

const now = new Date();
const plan = policies.rows.map((row) => {
  const lastSuccess = row.last_success_run ? new Date(row.last_success_run) : null;
  const ageDays = lastSuccess ? Math.floor((now - lastSuccess) / 86400000) : null;
  let status;
  if (row.last_failure && !lastSuccess) status = "failed";
  else if (!lastSuccess) status = "manual_review"; // never refreshed via the orchestrator (built directly this sprint)
  else if (ageDays > row.expected_cadence_days * 2) status = "stale";
  else if (ageDays > row.expected_cadence_days) status = "due";
  else status = "current";

  const isSales = row.dataset_id.includes("sales") || row.dataset_id.includes("vpsr");
  const rowCount = rowCountByJurisdiction[row.jurisdiction]
    ? isSales
      ? Number(rowCountByJurisdiction[row.jurisdiction].sales_rows)
      : Number(rowCountByJurisdiction[row.jurisdiction].rent_rows)
    : null;

  return {
    dataset_id: row.dataset_id,
    jurisdiction: row.jurisdiction,
    latest_source_period: null, // not tracked per-run yet; left NULL rather than guessed
    last_retrieved_at: lastSuccess,
    last_successful_validation_at: lastSuccess,
    expected_cadence_days: row.expected_cadence_days,
    freshness_status: status,
    current_branch_row_count: rowCount,
    last_failure_summary: row.last_failure,
    local_only_or_branch_published: rowCount && rowCount > 0 ? "branch_published" : "local_only",
    source_url: row.source_url,
  };
});

console.log(JSON.stringify({ generated_at: now.toISOString(), plan }, null, 2));

if (!EXECUTE) {
  await client.end();
  console.log(`\nDry run — ${plan.length} dataset(s) planned, no write made. Re-run with --execute to upsert meta.dataset_freshness_status.`);
  process.exit(0);
}

for (const row of plan) {
  await client.query(
    `insert into meta.dataset_freshness_status
       (dataset_id, jurisdiction, latest_source_period, last_retrieved_at, last_successful_validation_at,
        expected_cadence_days, freshness_status, current_branch_row_count, last_failure_summary,
        local_only_or_branch_published, source_url, computed_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
     on conflict (dataset_id) do update set
       jurisdiction=excluded.jurisdiction, latest_source_period=excluded.latest_source_period,
       last_retrieved_at=excluded.last_retrieved_at, last_successful_validation_at=excluded.last_successful_validation_at,
       expected_cadence_days=excluded.expected_cadence_days, freshness_status=excluded.freshness_status,
       current_branch_row_count=excluded.current_branch_row_count, last_failure_summary=excluded.last_failure_summary,
       local_only_or_branch_published=excluded.local_only_or_branch_published, source_url=excluded.source_url,
       computed_at=now()`,
    [
      row.dataset_id, row.jurisdiction, row.latest_source_period, row.last_retrieved_at, row.last_successful_validation_at,
      row.expected_cadence_days, row.freshness_status, row.current_branch_row_count, row.last_failure_summary,
      row.local_only_or_branch_published, row.source_url,
    ]
  );
}
await client.end();
console.log(`\nUpserted meta.dataset_freshness_status for ${plan.length} dataset(s).`);
