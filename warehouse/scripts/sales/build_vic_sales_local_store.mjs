#!/usr/bin/env node
/**
 * Victoria VPSR sales local store builder (Sprint 10, Phase 5).
 *
 * VPSR (Valuer-General Victoria / Dept. of Transport and Planning) is a
 * pre-aggregated summary product (median sale price by suburb by quarter),
 * unlike NSW's PSI which is transaction-level. There is therefore no
 * transactions table for VIC — only a summary table, built directly from
 * the three parallel VPSR products (house / unit / vacant land).
 *
 * Source files are legacy .xls (OLE2/BIFF, Crystal Reports export) parsed
 * with node-xlrd (exceljs cannot read this format). Local-first: raw files
 * and this store stay under warehouse/data/ (gitignored). Only compact
 * curated summaries are promoted to Supabase, in a later phase.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import xl from "node-xlrd";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const RAW_DIR = rel("warehouse", "data", "raw", "vic_sales", "vpsr");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "vic_sales.duckdb");

const VIC_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "vic_all_sals.json"), "utf8"));

function normName(s) {
  return s.toUpperCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const salByFullUpper = new Map(VIC_SALS.map((r) => [r.geography_name.trim().toUpperCase(), r]));
const salByNormUpper = new Map();
for (const r of VIC_SALS) {
  const norm = normName(r.geography_name);
  if (!salByNormUpper.has(norm)) salByNormUpper.set(norm, []);
  salByNormUpper.get(norm).push(r);
}

function resolveGeography(localityRaw) {
  const upper = localityRaw.trim().toUpperCase();
  const direct = salByFullUpper.get(upper);
  if (direct) {
    return { geography_id: `SAL_${direct.geography_code}_ASGS3_2021`, geography_code: direct.geography_code, geography_name: direct.geography_name, geography_confidence: "direct" };
  }
  const candidates = salByNormUpper.get(upper);
  if (candidates && candidates.length === 1) {
    const r = candidates[0];
    return { geography_id: `SAL_${r.geography_code}_ASGS3_2021`, geography_code: r.geography_code, geography_name: r.geography_name, geography_confidence: "alias" };
  }
  return { geography_id: null, geography_code: null, geography_name: null, geography_confidence: "unresolved" };
}

const QUARTERS = [
  { colPrice: 1, colFlag: 2, reference_period: "2024-10-01" }, // Oct-Dec 2024
  { colPrice: 3, colFlag: 4, reference_period: "2025-01-01" }, // Jan-Mar 2025
  { colPrice: 5, colFlag: 6, reference_period: "2025-04-01" }, // Apr-Jun 2025
  { colPrice: 7, colFlag: 8, reference_period: "2025-07-01" }, // Jul-Sep 2025
  { colPrice: 9, colFlag: 10, reference_period: "2025-10-01", isLatest: true }, // Oct-Dec 2025
];
const COL_SALES_COUNT_LATEST_QUARTER = 11;
const COL_SALES_COUNT_ROLLING_12M = 12;
const COL_CHANGE_PCT_ANNUAL = 13;
const COL_CHANGE_PCT_QUARTER = 14;

function parsePrice(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
function parseNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function sampleSizeConfidence(count) {
  if (count === null || count === undefined) return null;
  if (count >= 30) return "high";
  if (count >= 10) return "medium";
  if (count >= 5) return "low";
  return "insufficient";
}

function openWorkbook(filePath) {
  return new Promise((resolve, reject) => {
    xl.open(filePath, (err, bk) => (err ? reject(err) : resolve(bk)));
  });
}

const FILES = [
  { file: "median_house_q4_2025.xls", dataset_id: "vic_vpsr_median_house", dwelling_type: "detached_house" },
  { file: "median_unit_q4_2025.xls", dataset_id: "vic_vpsr_median_unit", dwelling_type: "apartment_unit" },
  { file: "median_land_q4_2025.xls", dataset_id: "vic_vpsr_median_land", dwelling_type: "residential_land" },
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

console.log("build_vic_sales_local_store — VIC VPSR sales, suburb grain (local-first, no Supabase, no secrets)");

const rows = [];
const inventory = [];
const retrievedAt = new Date().toISOString();

for (const { file, dataset_id, dwelling_type } of FILES) {
  const filePath = path.join(RAW_DIR, file);
  if (!fs.existsSync(filePath)) fail(`missing raw file: ${filePath} — run the download step first`);
  const buf = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  inventory.push({ dataset_id, file, bytes: buf.length, sha256 });

  const bk = await openWorkbook(filePath);
  const sht = bk.sheets[0];
  const rCount = sht.row.count;
  let parsedRows = 0;
  let footerRow = rCount - 1; // last row is always the legend/footer in this source layout

  for (let r = 5; r < footerRow; r++) {
    const localityCell = sht.cell(r, 0);
    if (!localityCell || typeof localityCell !== "string" || !localityCell.trim()) continue;
    const localityRaw = localityCell.trim();
    const geo = resolveGeography(localityRaw);

    const latestQuarterCount = parseNum(sht.cell(r, COL_SALES_COUNT_LATEST_QUARTER));
    const rolling12mCount = parseNum(sht.cell(r, COL_SALES_COUNT_ROLLING_12M));
    const annualChangePct = parseNum(sht.cell(r, COL_CHANGE_PCT_ANNUAL));
    const quarterChangePct = parseNum(sht.cell(r, COL_CHANGE_PCT_QUARTER));

    for (const q of QUARTERS) {
      const rawPrice = sht.cell(r, q.colPrice);
      const flagRaw = sht.cell(r, q.colFlag);
      const flag = (flagRaw ?? "").toString().trim();
      const isCarriedForward = flag === "*";
      const isLowSample = flag === "^";
      const medianPrice = isCarriedForward ? null : parsePrice(rawPrice);

      let confidence;
      if (isCarriedForward) confidence = "insufficient";
      else if (q.isLatest && latestQuarterCount !== null) confidence = sampleSizeConfidence(latestQuarterCount);
      else if (isLowSample) confidence = "low";
      else confidence = "medium"; // unflagged historical quarter: source implies >=10 sales, exact tier unknown

      rows.push({
        jurisdiction: "VIC",
        geography_type: "SAL",
        geography_id: geo.geography_id,
        geography_code: geo.geography_code,
        geography_name: geo.geography_name,
        geography_confidence: geo.geography_confidence,
        locality_raw: localityRaw,
        dwelling_type,
        reference_period: q.reference_period,
        period_type: "quarter",
        median_sale_price: medianPrice,
        source_flag: flag || null,
        carried_forward_no_sales: isCarriedForward,
        transaction_count: q.isLatest ? latestQuarterCount : null,
        rolling_12m_transaction_count: q.isLatest ? rolling12mCount : null,
        annual_change_pct: q.isLatest ? annualChangePct : null,
        quarterly_change_pct: q.isLatest ? quarterChangePct : null,
        sample_size_confidence: confidence,
        source_id: "vic_vg_sales",
        dataset_id,
        retrieved_at: retrievedAt,
      });
    }
    parsedRows++;
  }
  console.log(`  ${file}: ${parsedRows} localities parsed -> ${parsedRows * QUARTERS.length} summary rows`);
}

console.log(`\nTotal vic_sales_summary rows: ${rows.length}`);

// ── Load into DuckDB, export parquet ───────────────────────────────────────

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}
async function one(sql) {
  const reader = await db.runAndReadAll(sql);
  return reader.getRows()[0];
}

await run(`
  create table vic_sales_summary (
    jurisdiction varchar,
    geography_type varchar,
    geography_id varchar,
    geography_code varchar,
    geography_name varchar,
    geography_confidence varchar,
    locality_raw varchar,
    dwelling_type varchar,
    reference_period date,
    period_type varchar,
    median_sale_price double,
    source_flag varchar,
    carried_forward_no_sales boolean,
    transaction_count integer,
    rolling_12m_transaction_count integer,
    annual_change_pct double,
    quarterly_change_pct double,
    sample_size_confidence varchar,
    source_id varchar,
    dataset_id varchar,
    retrieved_at timestamp
  )
`);

function sqlStr(v) {
  return v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
}
function sqlNum(v) {
  return v === null || v === undefined ? "NULL" : String(v);
}
function sqlBool(v) {
  return v ? "true" : "false";
}

const BATCH = 1000;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const values = batch
    .map(
      (r) =>
        `(${sqlStr(r.jurisdiction)},${sqlStr(r.geography_type)},${sqlStr(r.geography_id)},${sqlStr(r.geography_code)},${sqlStr(r.geography_name)},${sqlStr(r.geography_confidence)},${sqlStr(r.locality_raw)},${sqlStr(r.dwelling_type)},${sqlStr(r.reference_period)}::date,${sqlStr(r.period_type)},${sqlNum(r.median_sale_price)},${sqlStr(r.source_flag)},${sqlBool(r.carried_forward_no_sales)},${sqlNum(r.transaction_count)},${sqlNum(r.rolling_12m_transaction_count)},${sqlNum(r.annual_change_pct)},${sqlNum(r.quarterly_change_pct)},${sqlStr(r.sample_size_confidence)},${sqlStr(r.source_id)},${sqlStr(r.dataset_id)},${sqlStr(r.retrieved_at)}::timestamp)`
    )
    .join(",");
  await run(`insert into vic_sales_summary values ${values}`);
}

await run(`copy vic_sales_summary to '${posix(path.join(LOCAL_DIR, "vic_sales_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

fs.writeFileSync(
  rel("warehouse", "reports", "vic_sales_download_inventory.json"),
  JSON.stringify({ generated_at: retrievedAt, files: inventory }, null, 2)
);

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal VIC sales store built (gitignored):");
console.log(`  warehouse/data/local/vic_sales.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/vic_sales_summary.parquet  ${mb1(path.join(LOCAL_DIR, "vic_sales_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_vic_sales_local_store.mjs.");
