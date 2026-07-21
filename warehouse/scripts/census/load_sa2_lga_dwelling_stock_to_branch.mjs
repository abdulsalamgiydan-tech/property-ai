#!/usr/bin/env node
/**
 * SA2/LGA dwelling stock marts — branch-only, pure-SQL direct pass-through
 * (Sprint 11, Workstream 9 sub-pass 2).
 *
 * Unlike every other branch-load script in this project, this one reads NO
 * local DuckDB file — core.fact_dwelling_stock and core.fact_household_tenure
 * already contain real, native SA2 (19,632 rows) and LGA (4,376 rows) Census
 * facts loaded in an earlier sprint (dataset_id census_gcp_sa2_2021 /
 * census_gcp_lga_2021, confirmed live before writing this script). This is
 * a pure in-database SQL transformation: aggregate the per-measure fact
 * rows into one wide row per geography, matching the exact column shape of
 * the existing mart.suburb_dwelling_stock_2021.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates.
 *
 * Usage:
 *   node load_sa2_lga_dwelling_stock_to_branch.mjs             # dry run
 *   node load_sa2_lga_dwelling_stock_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const CENSUS_YEAR = 2021;

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`load_sa2_lga_dwelling_stock_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("  pure in-database SQL transformation — no local file dependency, no downloads");

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(`select to_regclass('mart.sa2_dwelling_stock_2021') a, to_regclass('mart.lga_dwelling_stock_2021') b`);
  if (Object.values(t[0]).some((v) => !v)) fail("required tables missing on branch — apply migration 019 first (hard stop)");
}
const [factCheck] = await q(
  `select
     (select count(*)::int from core.fact_dwelling_stock where geography_type='SA2' and dataset_id='census_gcp_sa2_2021') sa2_dwelling,
     (select count(*)::int from core.fact_dwelling_stock where geography_type='LGA' and dataset_id='census_gcp_lga_2021') lga_dwelling,
     (select count(*)::int from core.fact_household_tenure where geography_type='SA2') sa2_tenure,
     (select count(*)::int from core.fact_household_tenure where geography_type='LGA') lga_tenure`
);
if (factCheck.sa2_dwelling === 0 || factCheck.lga_dwelling === 0) {
  fail(`expected native SA2/LGA dwelling stock facts not found (sa2=${factCheck.sa2_dwelling}, lga=${factCheck.lga_dwelling}) — hard stop`);
}
console.log(`  branch fact check: sa2_dwelling=${factCheck.sa2_dwelling} lga_dwelling=${factCheck.lga_dwelling} sa2_tenure=${factCheck.sa2_tenure} lga_tenure=${factCheck.lga_tenure}`);

const [preState] = await q(`select
  (select count(*)::int from mart.sa2_dwelling_stock_2021) sa2_mart,
  (select count(*)::int from mart.lga_dwelling_stock_2021) lga_mart`);
console.log(`  branch state before: sa2_mart=${preState.sa2_mart} lga_mart=${preState.lga_mart}`);

if (!EXECUTE) {
  console.log("\nDry run: would build mart.sa2_dwelling_stock_2021 and mart.lga_dwelling_stock_2021");
  console.log("as a direct in-database aggregation of core.fact_dwelling_stock + core.fact_household_tenure.");
  await client.end();
  process.exit(0);
}

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  raw_rows_loaded_to_branch: false,
  method: "pure in-database SQL transformation, no local file dependency",
  loaded: {},
  gates_after: {},
};

const buildMart = async (target, table) => {
  const r = await client.query(`
    insert into ${table}
      (geography_id, geography_name, state_code, census_year,
       total_private_dwellings, occupied_private_dwellings, unoccupied_private_dwellings,
       separate_house, semi_detached_row_terrace, flat_apartment, other_dwelling,
       owner_households, renter_households,
       correspondence_method, data_coverage_score, confidence_label, source_summary)
    with dw as (
      select geography_id,
        max(dwelling_count) filter (where measure_name='total_private_dwellings' and dwelling_type='all') as total_pd,
        max(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='all') as occ_pd,
        max(dwelling_count) filter (where measure_name='unoccupied_private_dwellings' and dwelling_type='all') as unocc_pd,
        max(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='separate_house') as sep,
        max(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='semi_detached_row_terrace_townhouse') as semi,
        max(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='flat_apartment') as flat,
        max(dwelling_count) filter (where measure_name='occupied_private_dwellings' and dwelling_type='other_dwelling') as oth
      from core.fact_dwelling_stock
      where geography_type = $1 and census_year = ${CENSUS_YEAR}
      group by geography_id
    ),
    tn as (
      select geography_id,
        sum(household_count) filter (where tenure_type in ('owned_outright','owned_with_mortgage')) as owners,
        sum(household_count) filter (where tenure_type = 'rented') as renters
      from core.fact_household_tenure
      where geography_type = $1 and census_year = ${CENSUS_YEAR}
      group by geography_id
    )
    select dw.geography_id, d.geography_name, d.state_code, ${CENSUS_YEAR},
           dw.total_pd, dw.occ_pd, dw.unocc_pd, dw.sep, dw.semi, dw.flat, dw.oth,
           tn.owners, tn.renters,
           'direct_native_census_geography',
           case when dw.total_pd is not null then 1.0 else 0.0 end,
           case when dw.total_pd is not null then 'high' else 'insufficient_data' end,
           jsonb_build_object('source','abs_census','datasets', jsonb_build_array($2::text),'census_year',${CENSUS_YEAR})
    from dw
    left join tn on tn.geography_id = dw.geography_id
    join core.dim_geography d on d.geography_id = dw.geography_id
    on conflict (geography_id, census_year) do nothing`,
    [target, target === "SA2" ? "census_gcp_sa2_2021" : "census_gcp_lga_2021"]
  );
  console.log(`  ${table}: ${r.rowCount} rows built`);
  return r.rowCount;
};

try {
  await client.query("begin");
  report.loaded.sa2_dwelling_stock_2021 = await buildMart("SA2", "mart.sa2_dwelling_stock_2021");
  report.loaded.lga_dwelling_stock_2021 = await buildMart("LGA", "mart.lga_dwelling_stock_2021");

  const [post] = await q(`select
    (select count(*)::int from (select geography_id, census_year from mart.sa2_dwelling_stock_2021 group by 1,2 having count(*)>1)) as dup_sa2,
    (select count(*)::int from (select geography_id, census_year from mart.lga_dwelling_stock_2021 group by 1,2 having count(*)>1)) as dup_lga,
    (select count(*)::int from mart.sa2_dwelling_stock_2021 where total_private_dwellings < 0) as negative_sa2,
    (select count(*)::int from mart.lga_dwelling_stock_2021 where total_private_dwellings < 0) as negative_lga,
    (select count(*)::int from mart.sa2_dwelling_stock_2021 f where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_sa2,
    (select count(*)::int from mart.lga_dwelling_stock_2021 f where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_lga`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup=${Number(post.dup_sa2) + Number(post.dup_lga)} negative=${Number(post.negative_sa2) + Number(post.negative_lga)} orphans=${Number(post.orphan_sa2) + Number(post.orphan_lga)}`);
  const gateFailed = post.dup_sa2 || post.dup_lga || post.negative_sa2 || post.negative_lga || post.orphan_sa2 || post.orphan_lga;
  if (gateFailed) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try {
    await client.query("rollback");
  } catch {}
  try {
    await client.end();
  } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

const [summary] = await q(`select
  (select count(*)::int from mart.sa2_dwelling_stock_2021) as sa2_mart,
  (select count(*)::int from mart.lga_dwelling_stock_2021) as lga_mart,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
await client.end();
fs.writeFileSync(rel("warehouse", "reports", "sa2_lga_dwelling_stock_branch_load_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`\nsa2_mart=${summary.sa2_mart} lga_mart=${summary.lga_mart} db=${summary.db_size}`);
console.log("Run report written: warehouse/reports/sa2_lga_dwelling_stock_branch_load_report.json");
