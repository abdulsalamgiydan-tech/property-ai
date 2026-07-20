#!/usr/bin/env node
/**
 * RBA interest rates — branch-only compact load (Sprint 8, Part D).
 *
 * Loads the full local RBA rates store (2,264 rows — this module is
 * compact by design, see the source manifest) into the warehouse-validation
 * Supabase branch ONLY:
 *   1. meta lineage (3 sources/datasets: A2, F6, F5 — one load_run + one
 *      source_file per file, with SHA-256 from the download inventory)
 *   2. core.fact_interest_rates — all 2,264 rows
 *   3. mart.national_interest_rate_context — rebuilt from the core facts
 *      with human-readable labels
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-load
 * gates (rollback on failure); all local-store reads happen before BEGIN
 * (pooler-safety lesson from Sprint 3 — idle-in-transaction connections get
 * killed by Supabase's pooler).
 *
 * Usage:
 *   node load_rba_rates_to_branch.mjs             # dry run
 *   node load_rba_rates_to_branch.mjs --execute
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
const MAX_SAFE_DB_MB = 4500;

const DB_PATH = rel("warehouse", "data", "local", "rba_rates.duckdb");
const LOCAL_REPORT = rel("warehouse", "reports", "rba_rates_local_store_report.json");
const INVENTORY = rel("warehouse", "reports", "rba_rates_download_inventory.json");
const RUN_REPORT = rel("warehouse", "reports", "rba_rates_branch_load_report.json");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const duckDate = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const days = typeof v === "object" && "days" in v ? v.days : v;
  return new Date(Number(days) * 86400000).toISOString().slice(0, 10);
};

const RATE_TYPE_LABELS = {
  cash_rate_target: "Cash Rate Target",
  housing_lending_rate: "Housing Lending Rate (RBA Table F6, 2019-current)",
  indicator_lending_rate: "Indicator Lending Rate (RBA Table F5, long-run)",
};
const TABLE_CODE = {
  cash_rate_target: "A2",
  housing_lending_rate: "F6",
  indicator_lending_rate: "F5",
};

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);
if (!fs.existsSync(DB_PATH)) fail("local rba_rates store missing — run build_rba_rates_local_store.mjs");
if (!fs.existsSync(LOCAL_REPORT) || JSON.parse(fs.readFileSync(LOCAL_REPORT, "utf8")).verdict !== "PASSED") {
  fail("local store validation is not PASSED — refusing to load (hard stop)");
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const inventoryByDataset = Object.fromEntries(inventory.files.map((f) => [f.dataset_id, f]));

console.log(`load_rba_rates_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const duckInstance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const duck = await duckInstance.connect();
const duckRows = async (sql) => (await duck.runAndReadAll(sql)).getRowObjects();

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

{
  const [t] = await q(`select to_regclass('core.fact_interest_rates') a, to_regclass('mart.national_interest_rate_context') b`);
  if (!t.a || !t.b) fail("migration 011 tables missing on branch — apply 011 first (hard stop)");
}
const [sizeBefore] = await q("select pg_database_size(current_database()) bytes, pg_size_pretty(pg_database_size(current_database())) pretty");
const dbMbBefore = Number(sizeBefore.bytes) / 1024 / 1024;
if (dbMbBefore > MAX_SAFE_DB_MB) fail(`branch DB already at ${dbMbBefore.toFixed(0)}MB, over MAX_SAFE_DB_MB=${MAX_SAFE_DB_MB} — refusing to add more (hard stop)`);

const [preState] = await q(`select
  (select count(*)::int from core.fact_interest_rates) facts,
  (select count(*)::int from mart.national_interest_rate_context) mart`);
console.log(`  branch DB size before: ${sizeBefore.pretty}`);
console.log(`  branch state before: facts=${preState.facts} mart=${preState.mart}`);

if (!EXECUTE) {
  const [d] = await duckRows("select count(*)::int n from rba_interest_rates");
  console.log(`\nDry run: local store has ${num(d.n)} rows (this module is compact by design — the whole store is loaded, no curation split needed).`);
  console.log("Would load into core.fact_interest_rates + rebuild mart.national_interest_rate_context. Existing rows untouched (ON CONFLICT DO NOTHING).");
  duck.closeSync();
  await client.end();
  process.exit(0);
}

// ── Pre-read from DuckDB BEFORE opening the branch transaction ───────────

console.log("\n  pre-reading local store (before transaction)...");
const allRows = (await duckRows(
  "select reference_period, period_type, rate_type, borrower_type, loan_type, rate_percent, series_id, dataset_id, data_quality_status from rba_interest_rates order by rate_type, reference_period"
)).map((r) => ({ ...r, reference_period: duckDate(r.reference_period) }));
duck.closeSync();
console.log(`  pre-read: ${allRows.length} rows`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  db_size_before: sizeBefore.pretty,
  loaded: {},
  gates_after: {},
};

try {
  await client.query("begin");

  // 1. meta lineage — one source/dataset/load_run/source_file per RBA table.
  await client.query(`
    insert into meta.source (source_id, source_name, publisher, source_category, official_or_independent,
      source_url, licence, access_method, update_frequency, implementation_status)
    values ('rba_interest_rates','Reserve Bank of Australia — Interest Rate Statistics','Reserve Bank of Australia','macro','official',
      'https://www.rba.gov.au/statistics/interest-rates/','CC BY 4.0 (Cash Rate Target has additional benchmark conditions — see Copyright Notice s.4)',
      'file_download','as_announced_or_monthly','in_progress')
    on conflict (source_id) do update set implementation_status='in_progress', updated_at=now()`);

  const datasetDefs = [
    { dataset_id: "rba_cash_rate_target", name: "RBA Table A2 — Cash Rate Target (Changes in Monetary Policy and Administered Rates)", format: "xlsx" },
    { dataset_id: "rba_housing_lending_rates", name: "RBA Table F6 — Housing Lending Rates", format: "csv" },
    { dataset_id: "rba_indicator_lending_rates_housing", name: "RBA Table F5 — Indicator Lending Rates (housing subset)", format: "csv" },
  ];
  const runIdByDataset = {};
  const fileIdByDataset = {};
  for (const d of datasetDefs) {
    const rowsForDataset = allRows.filter((r) => r.dataset_id === d.dataset_id);
    const minP = rowsForDataset.reduce((m, r) => (!m || r.reference_period < m ? r.reference_period : m), null);
    const maxP = rowsForDataset.reduce((m, r) => (!m || r.reference_period > m ? r.reference_period : m), null);
    await client.query(
      `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency)
       values ($1,'rba_interest_rates',$2,'national',$3,$4,$5,'as_announced_or_monthly') on conflict (dataset_id) do nothing`,
      [d.dataset_id, d.name, minP, maxP, d.format]);
    const { rows: runRows } = await client.query(
      "insert into meta.load_run (dataset_id, run_status) values ($1,'running') returning load_run_id", [d.dataset_id]);
    runIdByDataset[d.dataset_id] = runRows[0].load_run_id;
    const inv = inventoryByDataset[d.dataset_id];
    const { rows: fileRows } = await client.query(
      `insert into meta.source_file (load_run_id, source_id, source_url, file_name, file_format, file_hash, reference_period)
       values ($1,'rba_interest_rates',$2,$3,$4,$5,$6) returning source_file_id`,
      [runIdByDataset[d.dataset_id], inv.url, path.basename(inv.path), d.format, inv.sha256, `${minP} to ${maxP}`]);
    fileIdByDataset[d.dataset_id] = fileRows[0].source_file_id;
  }
  console.log(`\n  meta: 1 source + ${datasetDefs.length} datasets + ${datasetDefs.length} load runs + ${datasetDefs.length} source files registered`);

  // 2. core.fact_interest_rates — whole store (compact by design).
  let factsLoaded = 0;
  if (preState.facts > 0) {
    console.log(`  core.fact_interest_rates: ${preState.facts} rows already present — inserting remaining rows via ON CONFLICT DO NOTHING`);
  }
  const cols = [
    "reference_period", "period_type", "rate_type", "borrower_type", "loan_type", "rate_percent",
    "series_id", "source_id", "dataset_id", "load_run_id", "source_file_id", "data_quality_status", "confidence_label",
  ];
  const BATCH = 500;
  for (let i = 0; i < allRows.length; i += BATCH) {
    const slice = allRows.slice(i, i + BATCH);
    const params = [];
    const tuples = slice.map((r) => {
      const values = [
        r.reference_period, r.period_type, r.rate_type, r.borrower_type, r.loan_type,
        r.rate_percent, r.series_id, "rba_interest_rates", r.dataset_id,
        runIdByDataset[r.dataset_id], fileIdByDataset[r.dataset_id], r.data_quality_status,
        r.data_quality_status === "passed" ? "official" : r.data_quality_status,
      ];
      const b = params.length;
      params.push(...values);
      return `(${values.map((_, j) => `$${b + j + 1}`).join(",")})`;
    });
    await client.query(
      `insert into core.fact_interest_rates (${cols.join(",")}) values ${tuples.join(",")}
       on conflict (reference_period, rate_type, (coalesce(borrower_type, '')), (coalesce(loan_type, ''))) do nothing`,
      params);
    factsLoaded += tuples.length;
  }
  console.log(`  core.fact_interest_rates: attempted ${factsLoaded} rows`);
  report.loaded.fact_interest_rates_attempted = factsLoaded;

  for (const d of datasetDefs) {
    const n = allRows.filter((r) => r.dataset_id === d.dataset_id).length;
    await client.query(
      "update meta.load_run set run_status='succeeded', finished_at=now(), records_extracted=$2, records_loaded=$2, records_quarantined=0 where load_run_id=$1",
      [runIdByDataset[d.dataset_id], n]);
  }

  // 3. mart.national_interest_rate_context — rebuilt from core facts with labels.
  const alreadyMart = preState.mart;
  if (alreadyMart > 0) {
    console.log(`  mart.national_interest_rate_context: ${alreadyMart} rows already present — phase skipped`);
    report.loaded.mart_national_interest_rate_context = 0;
  } else {
    const rateTypeCase = Object.entries(RATE_TYPE_LABELS)
      .map(([k, v]) => `when '${k}' then '${v.replaceAll("'", "''")}'`)
      .join(" ");
    const sourceSummaryCase = Object.entries(TABLE_CODE)
      .map(([k, v]) => `when '${k}' then '${v}'`)
      .join(" ");
    const r = await client.query(`
      insert into mart.national_interest_rate_context
        (reference_period, period_type, rate_type, rate_type_label, borrower_type, loan_type,
         rate_percent, data_quality_status, confidence_label, source_summary)
      select reference_period, period_type, rate_type,
             case rate_type ${rateTypeCase} end,
             borrower_type, loan_type, rate_percent, data_quality_status, confidence_label,
             jsonb_build_object('series_id', series_id, 'official_table', case rate_type ${sourceSummaryCase} end, 'publisher', 'Reserve Bank of Australia')
      from core.fact_interest_rates
      on conflict (reference_period, rate_type, (coalesce(borrower_type, '')), (coalesce(loan_type, ''))) do nothing`);
    console.log(`  mart.national_interest_rate_context: ${r.rowCount} rows built`);
    report.loaded.mart_national_interest_rate_context = r.rowCount;
  }

  // ── Post-load blocking gates ───────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select reference_period, rate_type, coalesce(borrower_type,'') bt, coalesce(loan_type,'') lt
       from core.fact_interest_rates group by 1,2,3,4 having count(*)>1) d) as dup_fact_grain,
    (select count(*)::int from core.fact_interest_rates where rate_percent < 0) as negative_rates,
    (select count(*)::int from core.fact_interest_rates where confidence_label is null) as missing_confidence_label,
    (select count(*)::int from core.fact_interest_rates where reference_period is null) as null_period,
    (select count(*)::int from (select reference_period, rate_type, coalesce(borrower_type,'') bt, coalesce(loan_type,'') lt
       from mart.national_interest_rate_context group by 1,2,3,4 having count(*)>1) d2) as dup_mart_grain,
    pg_size_pretty(pg_database_size(current_database())) as db_now`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_fact=${post.dup_fact_grain} dup_mart=${post.dup_mart_grain} negative=${post.negative_rates} missing_confidence=${post.missing_confidence_label} null_period=${post.null_period} db_now=${post.db_now}`);
  if (post.dup_fact_grain || post.dup_mart_grain || post.negative_rates || post.missing_confidence_label || post.null_period) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", post.dup_fact_grain || post.dup_mart_grain],
    ["no_negative_rates", post.negative_rates],
    ["confidence_label_required", post.missing_confidence_label],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "rba_rates_branch_load" })]);
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched; no raw file loaded).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 300)}`);
}

// ── Post-commit summary ──────────────────────────────────────────────────

const [summary] = await q(`select
  (select count(*)::int from core.fact_interest_rates) as fact_total,
  (select json_object_agg(rate_type, n) from (select rate_type, count(*)::int n from core.fact_interest_rates group by 1) x) as facts_by_rate_type,
  (select count(*)::int from mart.national_interest_rate_context) as mart_total,
  (select json_object_agg(confidence_label, n) from (select confidence_label, count(*)::int n from core.fact_interest_rates group by 1) x) as confidence_dist,
  (select min(rate_percent) from core.fact_interest_rates where rate_type='cash_rate_target') as min_cash_rate,
  (select max(rate_percent) from core.fact_interest_rates where rate_type='cash_rate_target') as max_cash_rate,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state = summary;
report.db_size_after = summary.db_size;
await client.end();

fs.writeFileSync(RUN_REPORT, JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/rba_rates_branch_load_report.json");
console.log(`facts=${summary.fact_total} mart=${summary.mart_total} db=${summary.db_size}`);
