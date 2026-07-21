#!/usr/bin/env node
/**
 * Cross-Census harmonisation — branch load (Sprint 11, Workstream 4).
 *
 * Fills the previously-NULL population_2016 / population_growth_2016_2021_pct
 * columns on mart.suburb_demographic_profile_2021 /
 * mart.postcode_demographic_profile_2021 (columns already exist, added
 * Sprint 9 — this is a data-only UPDATE, no schema change).
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only; production ref hard-refused;
 * dry-run by default; ONE transaction with blocking post-load gates
 * (rollback on failure); all local-store reads happen before BEGIN;
 * UPDATE only (existing rows, existing columns) — no INSERT, no DELETE.
 *
 * Usage:
 *   node load_cross_census_harmonisation_to_branch.mjs             # dry run
 *   node load_cross_census_harmonisation_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
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

console.log(`load_cross_census_harmonisation_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);

// ── 1. Read local converted-population store (before any DB connection) ──
const DB_PATH = rel("warehouse", "data", "local", "cross_census_harmonisation.duckdb");
const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
async function all(sql) {
  const reader = await db.runAndReadAll(sql);
  return reader.getRowObjects();
}
function bigintsToNumbers(rows) {
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : v;
    return out;
  });
}
const salConverted = bigintsToNumbers(await all(`select sal_code_2021, converted_population_2016 from sal_population_2016_converted`));
const poaConverted = bigintsToNumbers(await all(`select poa_code_2021, converted_population_2016 from poa_population_2016_converted`));
db.closeSync();
console.log(`  loaded ${salConverted.length} SAL + ${poaConverted.length} POA converted values from local store`);

// ── 2. Connect, stage, UPDATE inside one transaction ──────────────────────
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 0, query_timeout: 0 });
await client.connect();
const sizeBefore = await client.query("select pg_size_pretty(pg_database_size(current_database())) as sz, pg_database_size(current_database())::bigint as bytes");
console.log(`  branch DB size before: ${sizeBefore.rows[0].sz}`);

if (!EXECUTE) {
  console.log("\nDry run complete. No writes made. Re-run with --execute to load.");
  await client.end();
  process.exit(0);
}

try {
  await client.query("BEGIN");

  await client.query(`create temp table sal_pop2016_staged (geography_code text, population_2016 numeric) on commit drop`);
  await client.query(`create temp table poa_pop2016_staged (geography_code text, population_2016 numeric) on commit drop`);

  async function bulkInsert(table, rows, codePrefix) {
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = batch.map((r) => {
        params.push(`${codePrefix}${r[Object.keys(r)[0]]}`, r.converted_population_2016);
        return `($${params.length - 1},$${params.length})`;
      });
      await client.query(`insert into ${table} (geography_code, population_2016) values ${tuples.join(",")}`, params);
    }
  }
  await bulkInsert("sal_pop2016_staged", salConverted, "SAL");
  await bulkInsert("poa_pop2016_staged", poaConverted, "POA");

  const salUpdate = await client.query(`
    update mart.suburb_demographic_profile_2021 d
    set population_2016 = round(s.population_2016)::integer,
        population_growth_2016_2021_pct = case
          when s.population_2016 >= 50 and d.total_population is not null
          then round(((d.total_population - s.population_2016) / s.population_2016 * 100)::numeric, 2)
          else null
        end
    from sal_pop2016_staged s
    where s.geography_code = d.geography_code
  `);
  const poaUpdate = await client.query(`
    update mart.postcode_demographic_profile_2021 d
    set population_2016 = round(s.population_2016)::integer,
        population_growth_2016_2021_pct = case
          when s.population_2016 >= 50 and d.total_population is not null
          then round(((d.total_population - s.population_2016) / s.population_2016 * 100)::numeric, 2)
          else null
        end
    from poa_pop2016_staged s
    where s.geography_code = d.geography_code
  `);
  console.log(`  mart.suburb_demographic_profile_2021: ${salUpdate.rowCount} rows updated`);
  console.log(`  mart.postcode_demographic_profile_2021: ${poaUpdate.rowCount} rows updated`);

  // ── Blocking validation gates ────────────────────────────────────────
  const gates = await client.query(`
    select
      (select count(*)::int from mart.suburb_demographic_profile_2021 where population_2016 is not null and population_2016 < 0) as sal_negative,
      (select count(*)::int from mart.postcode_demographic_profile_2021 where population_2016 is not null and population_2016 < 0) as poa_negative,
      (select count(*)::int from mart.suburb_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_2016 < 50) as sal_low_base_leak,
      (select count(*)::int from mart.postcode_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_2016 < 50) as poa_low_base_leak,
      pg_database_size(current_database())::bigint as db_bytes_now
  `);
  const g = gates.rows[0];
  console.log(`  gates: sal_negative=${g.sal_negative} poa_negative=${g.poa_negative} sal_low_base_leak=${g.sal_low_base_leak} poa_low_base_leak=${g.poa_low_base_leak}`);
  if (g.sal_negative > 0 || g.poa_negative > 0 || g.sal_low_base_leak > 0 || g.poa_low_base_leak > 0) {
    throw new Error(`validation gate failed: ${JSON.stringify(g)}`);
  }

  await client.query("COMMIT");
  console.log("\nCOMMITTED (branch only; production untouched). This was a data-only UPDATE — no schema change, no new rows, no DELETE.");

  const sizeAfter = await client.query("select pg_size_pretty(pg_database_size(current_database())) as sz");
  const report = {
    generated_at: new Date().toISOString(),
    mode: "EXECUTE",
    branch_ref: BRANCH_REF,
    production_touched: false,
    rows_updated: { suburb_demographic_profile_2021: salUpdate.rowCount, postcode_demographic_profile_2021: poaUpdate.rowCount },
    validation_gates: { sal_negative: g.sal_negative, poa_negative: g.poa_negative, sal_low_base_leak: g.sal_low_base_leak, poa_low_base_leak: g.poa_low_base_leak },
    db_size_before: sizeBefore.rows[0].sz,
    db_size_after: sizeAfter.rows[0].sz,
    operation_type: "UPDATE only (existing columns, existing rows) — no schema change, no INSERT, no DELETE",
  };
  fs.writeFileSync(rel("warehouse", "reports", "cross_census_harmonisation_branch_load_report.json"), JSON.stringify(report, null, 2));
  console.log("Report written: warehouse/reports/cross_census_harmonisation_branch_load_report.json");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("ROLLED BACK due to error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
