#!/usr/bin/env node
/**
 * Victoria rental market local store builder (Sprint 10, Phase 6).
 *
 * Two Homes Victoria (DFFH) sources, both modern .xlsx, no bot protection:
 *  - Moving annual rent by suburb/town (cumulative full history in one file,
 *    103 quarters back to Mar 2000). Locality grain is Homes Victoria's own
 *    "town group" labelling, which for ~42% of rows combines multiple real
 *    ASGS suburbs into one label (e.g. "Albert Park-Middle Park-West St
 *    Kilda") — those rows CANNOT be safely assigned to a single SAL without
 *    fabricating a many-to-one relationship, so they are quarantined from
 *    suburb-grain output (geography_confidence='unresolved') rather than
 *    guessed.
 *  - Quarterly median rents by LGA — matches ASGS LGA names directly for
 *    the large majority of rows (91.6% verified), giving full-state
 *    coverage where suburb grain cannot be established. This is the
 *    documented Phase 6 fallback: "if only LGA or broader figures exist,
 *    use direct LGA data only, never fabricate suburb figures."
 *
 * Output: single vic_rental_summary table spanning both geography_type
 * values (SAL and LGA), each row explicitly labelled with its grain,
 * confidence, and direct_or_derived status.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const RAW_DIR = rel("warehouse", "data", "raw", "vic_rents");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "vic_rents.duckdb");

const VIC_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "vic_all_sals.json"), "utf8"));
const VIC_LGAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "vic_all_lgas.json"), "utf8"));

function normName(s) {
  return s.toUpperCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
}
function buildLookup(rows, prefix) {
  const byFull = new Map(rows.map((r) => [r.geography_name.trim().toUpperCase(), r]));
  const byNorm = new Map();
  for (const r of rows) {
    const norm = normName(r.geography_name);
    if (!byNorm.has(norm)) byNorm.set(norm, []);
    byNorm.get(norm).push(r);
  }
  return { byFull, byNorm, prefix };
}
function resolve(lookup, raw) {
  const upper = raw.trim().toUpperCase();
  const direct = lookup.byFull.get(upper);
  if (direct) return { geography_id: `${lookup.prefix}_${direct.geography_code}_ASGS3_2021`, geography_code: direct.geography_code, geography_name: direct.geography_name, geography_confidence: "direct" };
  const cands = lookup.byNorm.get(upper);
  if (cands && cands.length === 1) {
    const r = cands[0];
    return { geography_id: `${lookup.prefix}_${r.geography_code}_ASGS3_2021`, geography_code: r.geography_code, geography_name: r.geography_name, geography_confidence: "alias" };
  }
  return { geography_id: null, geography_code: null, geography_name: null, geography_confidence: "unresolved" };
}

const salLookup = buildLookup(VIC_SALS, "SAL");
const lgaLookup = buildLookup(VIC_LGAS, "LGA");

const SHEET_MAP = [
  { name: "1 bedroom flat", nameLga: "1br flat", dwelling_type: "apartment_unit", bedroom_count: 1 },
  { name: "2 bedroom flat", nameLga: "2br Flat", dwelling_type: "apartment_unit", bedroom_count: 2 },
  { name: "3 bedroom flat", nameLga: "3br Flat", dwelling_type: "apartment_unit", bedroom_count: 3 },
  { name: "2 bedroom house", nameLga: "2br House", dwelling_type: "detached_house", bedroom_count: 2 },
  { name: "3 bedroom house", nameLga: "3br House", dwelling_type: "detached_house", bedroom_count: 3 },
  { name: "4 bedroom house", nameLga: "4br House", dwelling_type: "detached_house", bedroom_count: 4 },
  { name: "All properties", nameLga: "All Properties", dwelling_type: "all", bedroom_count: null },
];

const EXCLUDE_LABELS = new Set(["GROUP TOTAL", "STATE TOTAL", "VICTORIA", "METRO", "NON-METRO"]);

function parseQuarterHeaders(ws) {
  // Row 2 holds quarter labels (e.g. "Mar 2000") duplicated across the
  // Count+Median column pair; row 3 holds "Count"/"Median". Columns 1-2 are
  // region/locality labels.
  const row2 = ws.getRow(2);
  const quarters = [];
  for (let c = 3; c <= ws.columnCount; c += 2) {
    const label = row2.getCell(c).value;
    if (!label) continue;
    const m = String(label).trim().match(/^([A-Za-z]{3})\s+(\d{4})$/);
    if (!m) continue;
    const monthMap = { Mar: "01", Jun: "04", Sep: "07", Dec: "10" };
    const mm = monthMap[m[1]];
    if (!mm) continue;
    quarters.push({ col: c, reference_period: `${m[2]}-${mm}-01` });
  }
  return quarters;
}

function parseVal(v) {
  if (v === null || v === undefined || v === "-" || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function extractFile(filePath, sheetKey, lookup, geographyType, sourceId, datasetId) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const out = [];
  const retrievedAt = new Date().toISOString();

  for (const sheetDef of SHEET_MAP) {
    const sheetName = sheetKey === "sal" ? sheetDef.name : sheetDef.nameLga;
    const ws = wb.worksheets.find((s) => s.name === sheetName);
    if (!ws) continue;
    const quarters = parseQuarterHeaders(ws);

    for (let r = 4; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const localityCell = row.getCell(2).value;
      if (!localityCell || typeof localityCell !== "string" || !localityCell.trim()) continue;
      const localityRaw = localityCell.trim();
      if (EXCLUDE_LABELS.has(localityRaw.toUpperCase())) continue;

      const geo = resolve(lookup, localityRaw);

      for (const q of quarters) {
        const count = parseVal(row.getCell(q.col).value);
        const median = parseVal(row.getCell(q.col + 1).value);
        if (count === null && median === null) continue; // fully suppressed cell, nothing to record

        out.push({
          jurisdiction: "VIC",
          geography_type: geographyType,
          geography_id: geo.geography_id,
          geography_code: geo.geography_code,
          geography_name: geo.geography_name,
          geography_confidence: geo.geography_confidence,
          locality_raw: localityRaw,
          dwelling_type: sheetDef.dwelling_type,
          bedroom_count: sheetDef.bedroom_count,
          reference_period: q.reference_period,
          median_weekly_rent: median,
          rental_count: count,
          direct_or_derived: "direct",
          confidence_label:
            count === null ? "insufficient" : count >= 30 ? "high" : count >= 10 ? "medium" : count >= 5 ? "low" : "insufficient",
          source_id: sourceId,
          dataset_id: datasetId,
          retrieved_at: retrievedAt,
        });
      }
    }
  }
  return out;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

console.log("build_vic_rents_local_store — VIC Homes Victoria rental report, dual grain (suburb + LGA), local-first");

const salFile = path.join(RAW_DIR, "moving_annual_rent_suburb_sep2025.xlsx");
const lgaFile = path.join(RAW_DIR, "quarterly_median_rent_lga_sep2025.xlsx");
if (!fs.existsSync(salFile)) fail(`missing raw file: ${salFile}`);
if (!fs.existsSync(lgaFile)) fail(`missing raw file: ${lgaFile}`);

const salRows = await extractFile(salFile, "sal", salLookup, "SAL", "vic_rent", "vic_moving_annual_rent_by_suburb");
console.log(`  suburb-grain (moving annual rent by suburb): ${salRows.length} rows`);
const lgaRows = await extractFile(lgaFile, "lga", lgaLookup, "LGA", "vic_rent", "vic_quarterly_median_rent_by_lga");
console.log(`  LGA-grain (quarterly median rent by LGA): ${lgaRows.length} rows`);

const allRows = [...salRows, ...lgaRows];
console.log(`Total vic_rental_summary rows: ${allRows.length}`);

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}

await run(`
  create table vic_rental_summary (
    jurisdiction varchar,
    geography_type varchar,
    geography_id varchar,
    geography_code varchar,
    geography_name varchar,
    geography_confidence varchar,
    locality_raw varchar,
    dwelling_type varchar,
    bedroom_count integer,
    reference_period date,
    median_weekly_rent double,
    rental_count integer,
    direct_or_derived varchar,
    confidence_label varchar,
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

const BATCH = 1000;
for (let i = 0; i < allRows.length; i += BATCH) {
  const batch = allRows.slice(i, i + BATCH);
  const values = batch
    .map(
      (r) =>
        `(${sqlStr(r.jurisdiction)},${sqlStr(r.geography_type)},${sqlStr(r.geography_id)},${sqlStr(r.geography_code)},${sqlStr(r.geography_name)},${sqlStr(r.geography_confidence)},${sqlStr(r.locality_raw)},${sqlStr(r.dwelling_type)},${sqlNum(r.bedroom_count)},${sqlStr(r.reference_period)}::date,${sqlNum(r.median_weekly_rent)},${sqlNum(r.rental_count)},${sqlStr(r.direct_or_derived)},${sqlStr(r.confidence_label)},${sqlStr(r.source_id)},${sqlStr(r.dataset_id)},${sqlStr(r.retrieved_at)}::timestamp)`
    )
    .join(",");
  await run(`insert into vic_rental_summary values ${values}`);
}

await run(`copy vic_rental_summary to '${posix(path.join(LOCAL_DIR, "vic_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const inventory = [salFile, lgaFile].map((p) => {
  const buf = fs.readFileSync(p);
  return { file: path.basename(p), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
});
fs.writeFileSync(rel("warehouse", "reports", "vic_rents_download_inventory.json"), JSON.stringify({ generated_at: new Date().toISOString(), files: inventory }, null, 2));

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal VIC rents store built (gitignored):");
console.log(`  warehouse/data/local/vic_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/vic_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "vic_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_vic_rents_local_store.mjs.");
