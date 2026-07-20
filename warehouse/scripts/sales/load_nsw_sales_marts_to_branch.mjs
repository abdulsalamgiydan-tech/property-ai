#!/usr/bin/env node
/**
 * NSW sales pilot — branch-only curated load (Sprint 5, Part F).
 *
 * Loads ONLY the pre-aggregated local summary (never raw transactions) into
 * the warehouse-validation Supabase branch:
 *   1. meta lineage (source/dataset/load_run/source_file, one file hash entry
 *      per raw PSI zip already inventoried locally)
 *   2. core.fact_residential_sales_summary — the local nsw_sales_summary
 *      table as-is (34,866 rows: monthly + annual, SAL + POA, by dwelling
 *      type), filtered to geography_ids that exist in core.dim_geography
 *   3. mart.suburb_sales_monthly / _annual + mart.postcode_sales_monthly /
 *      _annual — built directly from the just-loaded core fact table (this
 *      pilot's sales are already at native SAL/POA grain via suburb-name and
 *      postcode text matching, so no SA1/SA2 correspondence apportionment is
 *      needed here, unlike the Census/Building-Approvals loads)
 *
 * No raw transaction table is ever created or loaded in Supabase — the full
 * 211,266-row transaction history stays in the local DuckDB store only.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-gates
 * (rollback on failure); all local-store reads happen before BEGIN (pooler
 * lesson from Sprint 3/4 — idle-in-transaction connections get killed).
 *
 * Usage:
 *   node load_nsw_sales_marts_to_branch.mjs             # dry run
 *   node load_nsw_sales_marts_to_branch.mjs --execute
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

const DB_PATH = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "nsw_sales_local_store_report.json");
const INVENTORY = rel("warehouse", "reports", "nsw_sales_download_inventory.json");
const RUN_REPORT = rel("warehouse", "reports", "nsw_sales_branch_load_report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
// DuckDB DATE columns come back as {days:N} objects, TIMESTAMP columns as
// {micros:N} (Sprint 4/5 lessons) — never hand these to a pg parameter or
// SQL string directly.
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object" && "days" in v) return new Date(Number(v.days) * 86400000).toISOString().slice(0, 10);
  if (typeof v === "object" && "micros" in v) return new Date(Number(v.micros) / 1000).toISOString().slice(0, 10);
  return new Date(Number(v) * 86400000).toISOString().slice(0, 10);
};

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);
if (!fs.existsSync(DB_PATH)) fail("local NSW sales store missing — run build_nsw_sales_local_store.mjs");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local store validation is not PASSED — refusing to load (hard stop)");
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));

console.log(`load_nsw_sales_marts_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);
console.log("  scope: curated summary only — no raw transaction table is created or loaded on the branch");

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const t = await q(`select to_regclass('core.fact_residential_sales_summary') a,
                            to_regclass('mart.suburb_sales_monthly') b, to_regclass('mart.suburb_sales_annual') c,
                            to_regclass('mart.postcode_sales_monthly') d, to_regclass('mart.postcode_sales_annual') e`);
  if (!t[0].a || !t[0].b || !t[0].c || !t[0].d || !t[0].e) fail("migration 008 tables missing on branch — apply 008 first (hard stop)");
}
const [dimCheck] = await q("select count(*)::int n from core.dim_geography where boundary_version=$1 and geography_type in ('SAL','POA')", [BV]);
if (dimCheck.n < 15000) fail(`core.dim_geography SAL/POA rows look unpopulated (${dimCheck.n}) — geography backbone required (hard stop)`);
const dimIds = new Set((await q("select geography_id from core.dim_geography where boundary_version=$1 and geography_type in ('SAL','POA')", [BV])).map((r) => r.geography_id));

const [preState] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) facts,
  (select count(*)::int from mart.suburb_sales_monthly) sm,
  (select count(*)::int from mart.suburb_sales_annual) sa,
  (select count(*)::int from mart.postcode_sales_monthly) pm,
  (select count(*)::int from mart.postcode_sales_annual) pa`);
console.log(`  branch state: facts=${preState.facts} suburb_monthly=${preState.sm} suburb_annual=${preState.sa} postcode_monthly=${preState.pm} postcode_annual=${preState.pa}`);
console.log(`  SAL/POA dim ids loaded for join filter: ${dimIds.size}`);

if (!EXECUTE) {
  const [d] = await duckRows("select count(*)::int n from nsw_sales_summary");
  console.log(`\nDry run: local summary has ${num(d.n)} rows. Would load into core.fact_residential_sales_summary`);
  console.log("then build all 4 marts (suburb/postcode x monthly/annual) directly from the branch-resident fact table.");
  console.log("Phases with existing rows are skipped (idempotent). Use --execute to load.");
  duck.closeSync();
  await client.end();
  process.exit(0);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local summary (before transaction)...");
const summaryRows = (await duckRows(
  `select geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
          transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
          upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence
   from nsw_sales_summary`
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
duck.closeSync();
console.log(`  pre-read: ${summaryRows.length} summary rows`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  raw_transactions_loaded_to_branch: false,
  loaded: {},
  skipped: {},
  gates_after: {},
};

try {
  await client.query("begin");

  // 1. meta lineage — one source_file row per raw PSI zip already inventoried.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
      source_url, licence, access_method, update_frequency, implementation_status)
    values ('nsw_vg_sales','NSW Valuer General Property Sales Information','NSW Valuer General','sales','official',
      'https://valuation.property.nsw.gov.au/embed/propertySalesInformation','CC BY 4.0','file_download','weekly','in_progress')
    on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`);
  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ('nsw_psi_2001_current','nsw_vg_sales','NSW VG Property Sales Information — pilot (6 LGAs)','SAL,POA','2021','2026','zip_dat','weekly',
     'Pilot scope: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour. Curated summary only — raw transactions stay local.')
     on conflict (dataset_id) do nothing`);
  const { rows: runRows } = await client.query(
    "insert into meta.load_run (dataset_id, run_status) values ('nsw_psi_2001_current','running') returning load_run_id");
  const runId = runRows[0].load_run_id;
  for (const f of inventory.files) {
    await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'nsw_vg_sales',$2,$3,'zip',$4,$5)`,
      [runId, f.file, f.file, f.sha256, f.kind === "annual_bundle" ? f.file.match(/(\d{4})/)[1] : "2026"]);
  }
  console.log(`\n  meta: source + dataset + load run + ${inventory.files.length} source files registered`);

  // 2. core.fact_residential_sales_summary
  let factsLoaded = 0;
  let factsSkippedOrphan = 0;
  if (preState.facts > 0) {
    console.log(`  core.fact_residential_sales_summary: ${preState.facts} rows already present — phase skipped`);
    report.skipped.fact_residential_sales_summary = `phase skipped: ${preState.facts} rows already present`;
  } else {
    for (let i = 0; i < summaryRows.length; i += 500) {
      const slice = summaryRows.slice(i, i + 500).filter((r) => {
        const ok = dimIds.has(r.geography_id);
        if (!ok) factsSkippedOrphan++;
        return ok;
      });
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((r) => {
        params.push(
          r.geography_id, r.geography_type, r.geography_code, r.reference_period, r.period_type, r.dwelling_type,
          num(r.transaction_count), r.median_sale_price, r.mean_sale_price, r.lower_quartile_sale_price,
          r.upper_quartile_sale_price, r.min_sale_price, r.max_sale_price, r.sample_size_confidence,
          "nsw_vg_sales", "nsw_psi_2001_current", runId, "passed", r.sample_size_confidence
        );
        const b = params.length - 19;
        return `(${Array.from({ length: 19 }, (_, j) => `$${b + j + 1}`).join(",")})`;
      });
      await client.query(
        `insert into core.fact_residential_sales_summary
           (geography_id, geography_type, geography_code, reference_period, period_type, dwelling_type,
            transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price,
            upper_quartile_sale_price, min_sale_price, max_sale_price, sample_size_confidence,
            source_id, dataset_id, load_run_id, data_quality_status, confidence_label)
         values ${tuples.join(",")}
         on conflict (geography_id, reference_period, period_type, dwelling_type) do nothing`,
        params);
      factsLoaded += slice.length;
    }
    console.log(`  core.fact_residential_sales_summary: ${factsLoaded} rows (${factsSkippedOrphan} rows skipped — geography not in core.dim_geography)`);
  }
  report.loaded.fact_residential_sales_summary = factsLoaded;
  report.skipped.fact_residential_sales_summary_orphans = factsSkippedOrphan;
  await client.query(
    "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$3, records_quarantined=$4 where load_run_id=$1",
    [runId, summaryRows.length, factsLoaded, factsSkippedOrphan]);

  // 3. Marts — direct from the branch-resident fact table (native SAL/POA
  // grain already; no correspondence apportionment needed for this source).
  const buildMart = async (geoType, periodType, periodCol, table) => {
    const already = await q(`select count(*)::int n from ${table}`);
    if (already[0].n > 0) {
      console.log(`  ${table}: ${already[0].n} rows already present — phase skipped`);
      report.skipped[table] = `phase skipped: ${already[0].n} rows already present`;
      return 0;
    }
    const r = await client.query(`
      insert into ${table}
        (geography_id, geography_name, state_code, ${periodCol}, dwelling_type,
         transaction_count, median_sale_price, mean_sale_price, lower_quartile_sale_price, upper_quartile_sale_price,
         sample_size_confidence, confidence_label, source_summary)
      select f.geography_id, d.geography_name, d.state_code, f.reference_period, f.dwelling_type,
             f.transaction_count, f.median_sale_price, f.mean_sale_price, f.lower_quartile_sale_price, f.upper_quartile_sale_price,
             f.sample_size_confidence, f.confidence_label,
             jsonb_build_object('source','nsw_vg_sales','dataset','nsw_psi_2001_current',
                                 'method','direct_suburb_postcode_match','pilot_lgas',
                                 jsonb_build_array('Blacktown','Parramatta','Camden','Wollongong','Newcastle','Shellharbour'))
      from core.fact_residential_sales_summary f
      join core.dim_geography d on d.geography_id = f.geography_id
      where f.geography_type = '${geoType}' and f.period_type = '${periodType}'
      on conflict (geography_id, ${periodCol}, dwelling_type) do nothing`);
    console.log(`  ${table}: ${r.rowCount} rows built`);
    return r.rowCount;
  };
  report.loaded.suburb_sales_monthly = await buildMart("SAL", "month", "reference_month", "mart.suburb_sales_monthly");
  report.loaded.suburb_sales_annual = await buildMart("SAL", "year", "reference_year", "mart.suburb_sales_annual");
  report.loaded.postcode_sales_monthly = await buildMart("POA", "month", "reference_month", "mart.postcode_sales_monthly");
  report.loaded.postcode_sales_annual = await buildMart("POA", "year", "reference_year", "mart.postcode_sales_annual");

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id, reference_period, period_type, dwelling_type
       from core.fact_residential_sales_summary group by 1,2,3,4 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_residential_sales_summary where geography_id is null) as null_geo_ids,
    (select count(*)::int from core.fact_residential_sales_summary where median_sale_price < 0 or mean_sale_price < 0) as negative_prices,
    (select count(*)::int from core.fact_residential_sales_summary f
      where not exists (select 1 from core.dim_geography g where g.geography_id = f.geography_id)) as orphan_facts,
    (select count(*)::int from core.fact_residential_sales_summary where transaction_count is null or transaction_count < 1) as invalid_txn_count`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_grain=${post.dup_fact_grain} null_geo=${post.null_geo_ids} negative_prices=${post.negative_prices} orphans=${post.orphan_facts} invalid_txn_count=${post.invalid_txn_count}`);
  if (post.dup_fact_grain || post.null_geo_ids || post.negative_prices || post.orphan_facts || post.invalid_txn_count) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_fact_grain],
    ["nulls_not_zero", post.null_geo_ids],
    ["geo_code_valid", post.orphan_facts],
    ["price_range_sanity", post.negative_prices],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "nsw_sales_branch_load" })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched; no raw transactions loaded).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary ──────────────────────────────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_residential_sales_summary) as fact_total,
  (select json_object_agg(sample_size_confidence, n) from (select sample_size_confidence, count(*)::int n from core.fact_residential_sales_summary group by 1) x) as confidence_dist,
  (select count(*)::int from mart.suburb_sales_monthly) as suburb_monthly,
  (select count(*)::int from mart.suburb_sales_annual) as suburb_annual,
  (select count(*)::int from mart.postcode_sales_monthly) as postcode_monthly,
  (select count(*)::int from mart.postcode_sales_annual) as postcode_annual,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/nsw_sales_branch_load_report.json");
console.log(`facts=${summary.fact_total} suburb_monthly=${summary.suburb_monthly} suburb_annual=${summary.suburb_annual} postcode_monthly=${summary.postcode_monthly} postcode_annual=${summary.postcode_annual} db=${summary.db_size}`);
