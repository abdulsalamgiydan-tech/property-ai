#!/usr/bin/env node
/**
 * Dwelling commencements/completions — post-load validation (Sprint 12, WS3).
 * Read-only, independent re-query of the committed branch.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(path.join(repoRoot, ".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set");
if (DB_URL.includes(PROD_REF)) fail("refusing: production ref detected");
if (!DB_URL.includes(BRANCH_REF)) fail("refusing: not the validation branch");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let allPassed = true;
function check(name, passed, detail) {
  console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) allPassed = false;
}

console.log("validate_dwelling_construction_activity — read-only, independent re-query of the committed branch");

const total = await client.query("select count(*) as n from core.fact_dwelling_construction_activity");
check("rows present", Number(total.rows[0].n) > 0, `${total.rows[0].n} rows`);

const negative = await client.query("select count(*) as n from core.fact_dwelling_construction_activity where unit_count < 0");
check("no negative counts", Number(negative.rows[0].n) === 0, `found ${negative.rows[0].n}`);

const dupes = await client.query(`
  select count(*) as n from (
    select geography_id, reference_period, period_type, dwelling_type, stage, sector, count(*) as c
    from core.fact_dwelling_construction_activity group by 1,2,3,4,5,6 having count(*) > 1
  ) d
`);
check("no duplicate natural keys", Number(dupes.rows[0].n) === 0, `found ${dupes.rows[0].n}`);

const orphans = await client.query(`
  select count(*) as n from core.fact_dwelling_construction_activity f
  where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)
`);
check("no orphan geographies", Number(orphans.rows[0].n) === 0, `found ${orphans.rows[0].n}`);

const statesCovered = await client.query(`
  select count(distinct g.geography_code) as n
  from core.fact_dwelling_construction_activity f
  join core.dim_geography g on g.geography_id = f.geography_id
`);
check("all 8 states/territories covered", Number(statesCovered.rows[0].n) === 8, `found ${statesCovered.rows[0].n}`);

const lineage = await client.query(`
  select count(*) as n from core.fact_dwelling_construction_activity
  where source_id is null or dataset_id is null or confidence_label is null
`);
check("every row has source_id, dataset_id and confidence_label", Number(lineage.rows[0].n) === 0, `missing on ${lineage.rows[0].n} rows`);

await client.end();
console.log(`\n${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
if (!allPassed) process.exit(1);
