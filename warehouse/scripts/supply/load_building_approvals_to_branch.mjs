#!/usr/bin/env node
/**
 * ABS Building Approvals — branch-only curated load (Sprint 4, Part D).
 *
 * Loads a CURATED subset of the local Building Approvals store into the
 * warehouse-validation Supabase branch ONLY (the full 59-month series stays
 * local; the branch is near capacity — see Sprint 3 notes):
 *   1. meta lineage (source/dataset/load_run/source_file with SHA-256)
 *   2. core.fact_building_approvals — trailing 12 individual months +
 *      1 rolling-12m total, per SA2 x dwelling_type (13 period rows instead
 *      of the full 59)
 *   3. mart.suburb_building_approvals + mart.postcode_building_approvals —
 *      built from the rolling-12m SA2 facts via the (dwelling-weighted where
 *      available) ASGS correspondence bridge, normalised per 1,000 existing
 *      2021 Census dwellings from the Sprint 3 dwelling-stock marts
 *
 * IMPORTANT convention: ABS Building Approvals omits SA2-month rows with
 * zero approvals (an administrative count series, not confidentiality-
 * suppressed like Census) — absence means a verified zero, not an unknown
 * value. The rolling-12m SUM therefore treats absent months as contributing
 * zero, which is the correct reading of the ABS data, not a "missing stays
 * NULL" violation. Individual month rows are only ever inserted for months
 * ABS actually published — never synthesized.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates
 * (rollback on failure); all local-store reads happen before BEGIN (a pooler
 * lesson from Sprint 3 — idle-in-transaction connections get killed).
 *
 * Usage:
 *   node load_building_approvals_to_branch.mjs             # dry run
 *   node load_building_approvals_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const BV = "ASGS3_2021";
const TRAILING_MONTHS = 12;

const DB_PATH = rel("warehouse", "data", "local", "building_approvals.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "building_approvals_local_store_report.json");
const INVENTORY = rel("warehouse", "reports", "building_approvals_download_inventory.json");
const MANIFEST = rel("warehouse", "reports", "building_approvals_source_manifest.json");
const RUN_REPORT = rel("warehouse", "reports", "building_approvals_branch_load_report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
// DuckDB's node-api returns DATE columns as {days: N} (days since epoch),
// not strings — convert to 'YYYY-MM-DD' before handing to pg.
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  const days = typeof v === "object" && "days" in v ? v.days : v;
  return new Date(Number(days) * 86400000).toISOString().slice(0, 10);
};

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);
if (!fs.existsSync(DB_PATH)) fail("local building approvals store missing — run build_building_approvals_local_store.mjs");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local store validation is not PASSED — refusing to load (hard stop)");
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entry = manifest.entries.find((e) => e.dataset_id === "building_approvals_sa2_2021");

console.log(`load_building_approvals_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();
const duckOne = async (sql) => (await duckRows(sql))[0];

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(`select to_regclass('core.fact_building_approvals') a,
                            to_regclass('mart.suburb_building_approvals') b,
                            to_regclass('mart.postcode_building_approvals') c`);
  if (!t[0].a || !t[0].b || !t[0].c) fail("migration 007 tables missing on branch — apply 007 first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1 and geography_type='SA2'", [BV]);
if (dimCheck.n < 2000) fail(`core.dim_geography SA2 rows look unpopulated (${dimCheck.n}) — geography backbone required (hard stop)`);
const [stockCheck] = await q("select count(*)::int a, count(*)::int b from mart.suburb_dwelling_stock_2021");
if (stockCheck.a === 0) fail("mart.suburb_dwelling_stock_2021 is empty — Sprint 3 Census load required before approvals-per-1000 can be computed (hard stop)");

const dimIds = new Set((await q("select geography_id from core.dim_geography where boundary_version=$1 and geography_type='SA2'", [BV])).map((r) => r.geography_id));
const gid = (c) => `SA2_${c}_${BV}`;

const [preState] = await q(`select
  (select count(*)::int from core.fact_building_approvals) facts,
  (select count(*)::int from mart.suburb_building_approvals) suburb_mart,
  (select count(*)::int from mart.postcode_building_approvals) postcode_mart`);
console.log(`  branch state: facts=${preState.facts} suburb_mart=${preState.suburb_mart} postcode_mart=${preState.postcode_mart}`);
console.log(`  SA2 dim ids loaded for join filter: ${dimIds.size}`);

if (!EXECUTE) {
  const d = await duckOne(`select count(distinct reference_period)::int periods, max(reference_period) maxp from building_approvals_sa2`);
  console.log(`\nDry run: local store has ${num(d.periods)} months (latest ${duckDate(d.maxp)}). Would load trailing ${TRAILING_MONTHS} months`);
  console.log(`+ 1 rolling-12m total per SA2 x dwelling_type into core.fact_building_approvals, then build both supply marts`);
  console.log("with approvals-per-1,000-existing-dwellings from the Sprint 3 Census marts. Phases with existing rows are skipped.");
  duck.closeSync();
  await client.end();
  process.exit(0);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local store (before transaction)...");
const [{ maxp: maxpRaw }] = await duckRows("select max(reference_period) maxp from building_approvals_sa2");
const maxp = duckDate(maxpRaw); // 'YYYY-MM-DD' — DuckDB dates are {days:N} objects, never pass raw downstream
const monthRows = (await duckRows(`
  select geography_code c, reference_period rp, dwelling_type dt, approval_count v
  from building_approvals_sa2
  where not is_quarantined and reference_period > (date '${maxp}' - interval ${TRAILING_MONTHS} month)`))
  .map((r) => ({ ...r, rp: duckDate(r.rp) }));
const rolling12Rows = await duckRows(`
  select geography_code c, dwelling_type dt, sum(approval_count)::int v, count(*)::int months_present
  from building_approvals_sa2
  where not is_quarantined and reference_period > (date '${maxp}' - interval 12 month)
  group by 1, 2`);
duck.closeSync();
console.log(`  pre-read: ${monthRows.length} monthly cells (trailing ${TRAILING_MONTHS}m), ${rolling12Rows.length} rolling-12m cells, latest month ${maxp}`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  approvals_per_1000_dwellings_created: false,
  loaded: {},
  skipped: {},
  gates_after: {},
  latest_month_in_local_store: maxp,
};

try {
  await client.query("begin");

  // 1. meta lineage.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
      source_url, licence, access_method, update_frequency, implementation_status)
    values ('abs_building_approvals','ABS Building Approvals','Australian Bureau of Statistics','supply','official',
      'https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia',
      'CC BY 4.0','api','monthly','in_progress')
    on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`);
  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ($1,'abs_building_approvals',$2,'SA2','2021-07',$3,'sdmx_csv_api','monthly',$4) on conflict (dataset_id) do nothing`,
    [entry.dataset_id, entry.dataset_name, String(maxp), entry.notes]);
  const { rows: runRows } = await client.query(
    "insert into meta.load_run (dataset_id, run_status) values ($1,'running') returning load_run_id", [entry.dataset_id]);
  const runId = runRows[0].load_run_id;
  const { rows: fileRows } = await client.query(
    `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
     values ($1,'abs_building_approvals',$2,'ba_sa2_monthly.csv','csv',$3,'2021-2026') returning source_file_id`,
    [runId, inventory.source_url, inventory.sha256]);
  const fileId = fileRows[0].source_file_id;
  console.log("\n  meta: source + dataset + load run registered");

  // 2. core.fact_building_approvals: trailing months + rolling-12m.
  let factsLoaded = 0;
  let factsSkippedOrphan = 0;
  if (preState.facts > 0) {
    console.log(`  core.fact_building_approvals: ${preState.facts} rows already present — phase skipped`);
    report.skipped.fact_building_approvals = `phase skipped: ${preState.facts} rows already present`;
  } else {
    const insertBatch = async (rows, periodType, cols) => {
      for (let i = 0; i < rows.length; i += 1000) {
        const slice = rows.slice(i, i + 1000).filter((r) => {
          const ok = dimIds.has(gid(r.c));
          if (!ok) factsSkippedOrphan++;
          return ok;
        });
        if (slice.length === 0) continue;
        const params = [];
        const tuples = slice.map((r) => {
          const values = cols(r);
          const b = params.length;
          params.push(...values);
          return `(${values.map((_, j) => `$${b + j + 1}`).join(",")})`;
        });
        await client.query(
          `insert into core.fact_building_approvals
             (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
              approval_count, measure_name, source_id, dataset_id, load_run_id, source_file_id, data_quality_status, confidence_label)
           values ${tuples.join(",")}
           on conflict (geography_id, reference_period, period_type, dwelling_type, measure_name) do nothing`,
          params);
        factsLoaded += slice.length;
      }
    };
    await insertBatch(monthRows, "month", (r) => [
      gid(r.c), "SA2", r.c, r.rp, "month", r.dt, r.v === null ? null : num(r.v),
      "dwelling_units_approved", "abs_building_approvals", entry.dataset_id, runId, fileId, "passed", "high",
    ]);
    await insertBatch(rolling12Rows, "rolling_12m", (r) => [
      gid(r.c), "SA2", r.c, maxp, "rolling_12m", r.dt, num(r.v),
      "dwelling_units_approved", "abs_building_approvals", entry.dataset_id, runId, fileId, "passed",
      num(r.months_present) >= 12 ? "high" : "medium",
    ]);
    console.log(`  core.fact_building_approvals: ${factsLoaded} rows (${factsSkippedOrphan} special-code cells excluded by dim join)`);
  }
  report.loaded.fact_building_approvals = factsLoaded;
  report.skipped.fact_building_approvals_orphans = factsSkippedOrphan;

  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3, records_quarantined=0 where load_run_id=$1",
    [runId, monthRows.length + rolling12Rows.length, factsLoaded]);

  // 3. Marts via SQL against branch-resident tables (SA2 -> SAL/POA,
  // dwelling-weighted correspondence from Sprint 3, existing stock from the
  // Sprint 3 Census marts).
  const buildMart = async (target, table, stockMart) => {
    const already = target === "SAL" ? preState.suburb_mart : preState.postcode_mart;
    if (already > 0) {
      console.log(`  ${table}: ${already} rows already present — phase skipped`);
      report.skipped[table] = `phase skipped: ${already} rows already present`;
      return 0;
    }
    const r = await client.query(`
      insert into ${table}
        (geography_id, geography_name, state_code, reference_period,
         approvals_12m_total, approvals_12m_houses, approvals_12m_other,
         existing_dwellings_2021, approvals_per_1000_dwellings,
         correspondence_method, data_coverage_score, confidence_label, source_summary)
      with corr as (
        select source_geography_id, target_geography_id, preferred_weight,
               (dwelling_weight is not null) as dwelling_based
        from core.bridge_geography_correspondence
        where target_geography_type = '${target}' and source_geography_type = 'SA2'
          and correspondence_version = '${BV}' and preferred_weight is not null
      ),
      f as (
        select geography_id, dwelling_type, approval_count
        from core.fact_building_approvals where geography_type = 'SA2' and period_type = 'rolling_12m'
      ),
      agg as (
        select c.target_geography_id gidt,
          round(sum(f.approval_count * c.preferred_weight) filter (where dwelling_type='total_dwellings'))::int total_ba,
          round(sum(f.approval_count * c.preferred_weight) filter (where dwelling_type='houses'))::int houses_ba,
          round(sum(f.approval_count * c.preferred_weight) filter (where dwelling_type='other_residential'))::int other_ba,
          (sum(case when c.dwelling_based then 0 else 1 end) = 0) as fully_dwelling_based,
          bool_and(c.dwelling_based) as any_dwelling_based
        from corr c join f on f.geography_id = c.source_geography_id
        group by 1
      )
      select agg.gidt, d.geography_name, d.state_code, date '${maxp}',
             agg.total_ba, agg.houses_ba, agg.other_ba,
             stock.total_private_dwellings,
             case when stock.total_private_dwellings > 0
                  then round((agg.total_ba::numeric / stock.total_private_dwellings) * 1000, 2)
                  else null end,
             case when agg.fully_dwelling_based then 'sa2_dwelling_weighted' else 'sa2_mixed_dwelling_area_weighted' end,
             1.0,
             case when stock.total_private_dwellings is null then 'insufficient_data'
                  when agg.fully_dwelling_based then 'high'
                  when agg.any_dwelling_based then 'medium'
                  else 'low' end,
             jsonb_build_object('source','abs_building_approvals','dataset', '${entry.dataset_id}',
                                'via','core.bridge_geography_correspondence','window_end_month','${maxp}',
                                'dwelling_stock_source','${stockMart}')
      from agg
      join core.dim_geography d on d.geography_id = agg.gidt
      left join ${stockMart} stock on stock.geography_id = agg.gidt and stock.census_year = 2021
      on conflict (geography_id, reference_period) do nothing`);
    console.log(`  ${table}: ${r.rowCount} rows built via correspondence`);
    return r.rowCount;
  };
  report.loaded.suburb_mart = await buildMart("SAL", "mart.suburb_building_approvals", "mart.suburb_dwelling_stock_2021");
  report.loaded.postcode_mart = await buildMart("POA", "mart.postcode_building_approvals", "mart.postcode_dwelling_stock_2021");
  report.approvals_per_1000_dwellings_created = report.loaded.suburb_mart > 0 || report.loaded.postcode_mart > 0 || preState.suburb_mart > 0;

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, period_type, dwelling_type, measure_name
       from core.fact_building_approvals group by 1,2,3,4,5 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_building_approvals where geography_id is null) as null_geo_ids,
    (select count(*)::int from core.fact_building_approvals where approval_count < 0) as negative_counts,
    (select count(*)::int from core.fact_building_approvals f
      where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_facts`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_grain=${post.dup_fact_grain} null_geo=${post.null_geo_ids} negative=${post.negative_counts} orphans=${post.orphan_facts}`);
  if (post.dup_fact_grain || post.null_geo_ids || post.negative_counts || post.orphan_facts) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_fact_grain],
    ["nulls_not_zero", post.null_geo_ids],
    ["geo_code_valid", post.orphan_facts],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "building_approvals_branch_load" })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary ──────────────────────────────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_building_approvals) as fact_total,
  (select json_object_agg(period_type, n) from (select period_type, count(*)::int n from core.fact_building_approvals group by 1) x) as facts_by_period_type,
  (select count(*)::int from mart.suburb_building_approvals) as suburb_mart,
  (select count(*)::int from mart.postcode_building_approvals) as postcode_mart,
  (select round(avg(approvals_per_1000_dwellings),2) from mart.suburb_building_approvals where approvals_per_1000_dwellings is not null) as suburb_avg_per_1000,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/building_approvals_branch_load_report.json");
console.log(`facts=${summary.fact_total} suburb_mart=${summary.suburb_mart} postcode_mart=${summary.postcode_mart} db=${summary.db_size}`);
