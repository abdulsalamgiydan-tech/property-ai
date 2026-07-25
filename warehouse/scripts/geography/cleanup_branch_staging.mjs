#!/usr/bin/env node
/**
 * Branch staging cleanup (PREPARED — DO NOT RUN WITHOUT EXPLICIT APPROVAL).
 *
 * Frees Supabase branch disk by truncating the two heavy ASGS staging tables
 * on the warehouse-validation branch, AFTER the local DuckDB/Parquet store
 * has been built and validated as the replacement staging layer.
 *
 * Scope (all enforced in code):
 *   - truncates ONLY staging.asgs_geography and staging.asgs_correspondence
 *   - connection must come from WAREHOUSE_VALIDATION_DB_URL (.env.local)
 *   - hard-refuses any URL containing production ref "oshquaxsloolqucwvigc"
 *   - requires branch ref "lzonauinzatmtytyoems" in the URL
 *   - dry-run by default; --execute AND --confirm-local-store-validated both
 *     required to actually truncate
 *   - meta.* lineage rows (source, dataset, load_run, source_file, quality,
 *     coverage) are kept — only the bulk staging rows go
 *   - reports database + table sizes before and after; never prints the URL
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const CONFIRMED = process.argv.includes("--confirm-local-store-validated");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const TABLES = ["staging.asgs_geography", "staging.asgs_correspondence"]; // the ONLY tables this script may touch

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

// The local store must exist and have a PASSED validation report before this
// script will even consider truncating.
const localReport = rel("warehouse", "reports", "asgs_local_store_report.json");
let localVerdict = "missing";
if (fs.existsSync(localReport)) {
  localVerdict = JSON.parse(fs.readFileSync(localReport, "utf8")).verdict ?? "unknown";
}

console.log(`cleanup_branch_staging — ${EXECUTE ? "EXECUTE requested" : "DRY RUN (default)"}`);
console.log(`  scope: TRUNCATE ${TABLES.join(", ")} on branch ${BRANCH_REF} ONLY`);
console.log(`  local store validation verdict: ${localVerdict}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

const sizes = async () =>
  (await client.query(`
    select pg_size_pretty(pg_database_size(current_database())) as database,
           pg_size_pretty(pg_total_relation_size('staging.asgs_geography')) as staging_geography,
           pg_size_pretty(pg_total_relation_size('staging.asgs_correspondence')) as staging_correspondence,
           (select count(*) from staging.asgs_geography)::int as geo_rows,
           (select count(*) from staging.asgs_correspondence)::int as corr_rows`)).rows[0];

const before = await sizes();
console.log(`\nBefore: db=${before.database} | asgs_geography=${before.staging_geography} (${before.geo_rows} rows) | asgs_correspondence=${before.staging_correspondence} (${before.corr_rows} rows)`);

if (!EXECUTE) {
  console.log("\nDry run: nothing truncated. To run for real (ONLY after explicit user approval):");
  console.log("  node cleanup_branch_staging.mjs --execute --confirm-local-store-validated");
  await client.end();
  process.exit(0);
}
if (!CONFIRMED) {
  await client.end();
  fail("--execute also requires --confirm-local-store-validated (hard stop)");
}
if (localVerdict !== "PASSED") {
  await client.end();
  fail(`local store validation verdict is '${localVerdict}', not PASSED — refusing to truncate (hard stop)`);
}

for (const t of TABLES) {
  console.log(`  truncate ${t} ...`);
  await client.query(`truncate table ${t}`);
}
await client.query("vacuum staging.asgs_geography");
await client.query("vacuum staging.asgs_correspondence");

const after = await sizes();
console.log(`\nAfter:  db=${after.database} | asgs_geography=${after.staging_geography} (${after.geo_rows} rows) | asgs_correspondence=${after.staging_correspondence} (${after.corr_rows} rows)`);
console.log("meta.* lineage preserved. Production untouched. Done.");
await client.end();
