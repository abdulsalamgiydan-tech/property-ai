#!/usr/bin/env node
/**
 * RBA interest-rate local store builder (Sprint 8, Part C).
 *
 * Downloads the three curated official RBA files (A2 cash rate target, F6
 * housing lending rates, F5 indicator lending rates housing subset) into
 * warehouse/data/raw/rba_rates/ (gitignored, SHA-256 recorded), and builds
 * a single unified local DuckDB table + Parquet export.
 *
 * No Supabase connection, no secrets. rba.gov.au has no bot protection —
 * plain HTTPS fetch works directly (confirmed by discover_rba_rate_sources.mjs).
 * Missing/non-numeric source values stay NULL — nothing here invents or
 * estimates a rate (see the range-format A2 rows documented in the manifest).
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

const MANIFEST = rel("warehouse", "reports", "rba_rates_source_manifest.json");
const INVENTORY_OUT = rel("warehouse", "reports", "rba_rates_download_inventory.json");
const RAW_DIR = rel("warehouse", "data", "raw", "rba_rates");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "rba_rates.duckdb");
const UA = "propellect-warehouse/1.0";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function sqlDate(iso) {
  return `DATE '${iso}'`;
}
function sqlStr(v) {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replaceAll("'", "''")}'`;
}
function sqlNum(v) {
  return v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v);
}
// DD/MM/YYYY (RBA CSV date format) -> ISO YYYY-MM-DD
function ddmmyyyyToIso(s) {
  const [d, m, y] = s.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

if (!fs.existsSync(MANIFEST)) fail("manifest missing — run discover_rba_rate_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const byId = Object.fromEntries(manifest.entries.map((e) => [e.dataset_id, e]));
for (const id of ["rba_cash_rate_target", "rba_housing_lending_rates", "rba_indicator_lending_rates_housing"]) {
  if (!byId[id] || byId[id].status !== "discovered") fail(`manifest entry ${id} not discovered — resolve before pulling data`);
}

console.log("build_rba_rates_local_store — local-first (no Supabase, no secrets)");
fs.mkdirSync(RAW_DIR, { recursive: true });

// ── 1. Download the three files ──────────────────────────────────────────

async function download(url, destName) {
  const dest = path.join(RAW_DIR, destName);
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(`${dest}.part`, buf);
  fs.renameSync(`${dest}.part`, dest);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  console.log(`  ${destName}: ${(buf.length / 1024).toFixed(1)} KB, sha256 ${sha256.slice(0, 12)}...`);
  return { path: dest, bytes: buf.length, sha256, url };
}

console.log("\nDownloading official RBA files...");
const a2File = await download(byId.rba_cash_rate_target.download_url, "a02hist.xlsx");
const f6File = await download(byId.rba_housing_lending_rates.download_url, "f6-data.csv");
const f5File = await download(byId.rba_indicator_lending_rates_housing.download_url, "f5-data.csv");

const inventory = {
  generated_at: new Date().toISOString(),
  files: [
    { dataset_id: "rba_cash_rate_target", ...a2File, path: posix(path.relative(repoRoot, a2File.path)) },
    { dataset_id: "rba_housing_lending_rates", ...f6File, path: posix(path.relative(repoRoot, f6File.path)) },
    { dataset_id: "rba_indicator_lending_rates_housing", ...f5File, path: posix(path.relative(repoRoot, f5File.path)) },
  ],
};
fs.writeFileSync(INVENTORY_OUT, JSON.stringify(inventory, null, 2) + "\n");
console.log("Download inventory (hashes) written: warehouse/reports/rba_rates_download_inventory.json");

// ── 2. Parse into unified fact rows ──────────────────────────────────────

const facts = []; // { reference_period(iso), period_type, rate_type, borrower_type, loan_type, rate_percent, series_id, raw_value, dataset_id, data_quality_status }

// A2 — cash rate target (event table)
{
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(a2File.path);
  const ws = wb.getWorksheet("Data");
  for (let r = 12; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = row.getCell(1).value;
    const target = row.getCell(3).value;
    if (!date) continue;
    const iso = new Date(date).toISOString().slice(0, 10);
    const isNumeric = typeof target === "number";
    facts.push({
      reference_period: iso,
      period_type: "day",
      rate_type: "cash_rate_target",
      borrower_type: null,
      loan_type: null,
      rate_percent: isNumeric ? target : null,
      series_id: "ARBAMPCNCRT",
      raw_value: String(target),
      dataset_id: "rba_cash_rate_target",
      data_quality_status: isNumeric ? "passed" : "range_not_numeric",
    });
  }
}
console.log(`\nA2 parsed: ${facts.length} cash rate target change-events`);

// F6 — housing lending rates (8 curated series)
const F6_SERIES = {
  FLRHOOTA: { borrower_type: "owner_occupier", loan_type: "all" },
  FLRHOOVA: { borrower_type: "owner_occupier", loan_type: "variable" },
  FLRHOOFA: { borrower_type: "owner_occupier", loan_type: "fixed_le_3y" },
  FLRHOOFB: { borrower_type: "owner_occupier", loan_type: "fixed_gt_3y" },
  FLRHIOTA: { borrower_type: "investor", loan_type: "all" },
  FLRHIOVA: { borrower_type: "investor", loan_type: "variable" },
  FLRHIOFA: { borrower_type: "investor", loan_type: "fixed_le_3y" },
  FLRHIOFB: { borrower_type: "investor", loan_type: "fixed_gt_3y" },
};
{
  const lines = fs.readFileSync(f6File.path, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  const seriesIdRow = parseCsvLine(lines[10]);
  const colIdx = Object.fromEntries(Object.keys(F6_SERIES).map((s) => [s, seriesIdRow.indexOf(s)]));
  const dataLines = lines.slice(11).filter((l) => l.trim().length > 0);
  let f6Count = 0;
  for (const line of dataLines) {
    const cells = parseCsvLine(line);
    const iso = ddmmyyyyToIso(cells[0]);
    for (const [seriesId, def] of Object.entries(F6_SERIES)) {
      const raw = cells[colIdx[seriesId]];
      const num = raw === "" || raw === undefined ? null : Number(raw);
      facts.push({
        reference_period: iso,
        period_type: "month",
        rate_type: "housing_lending_rate",
        borrower_type: def.borrower_type,
        loan_type: def.loan_type,
        rate_percent: Number.isFinite(num) ? num : null,
        series_id: seriesId,
        raw_value: raw ?? null,
        dataset_id: "rba_housing_lending_rates",
        data_quality_status: raw === "" || raw === undefined ? "unpublished_cell" : Number.isFinite(num) ? "passed" : "range_not_numeric",
      });
      f6Count++;
    }
  }
  console.log(`F6 parsed: ${f6Count} rows (8 series x ${dataLines.length} months)`);
}

// F5 — indicator lending rates, housing subset (4 curated series)
const F5_SERIES = {
  FILRHLBVS: { borrower_type: "owner_occupier", loan_type: "standard_variable" },
  FILRHL3YF: { borrower_type: "owner_occupier", loan_type: "fixed_3y" },
  FILRHLBVSI: { borrower_type: "investor", loan_type: "standard_variable" },
  FILRHL3YFI: { borrower_type: "investor", loan_type: "fixed_3y" },
};
{
  const lines = fs.readFileSync(f5File.path, "utf8").replace(/^﻿/, "").split(/\r?\n/);
  const seriesIdRow = parseCsvLine(lines[10]);
  const colIdx = Object.fromEntries(Object.keys(F5_SERIES).map((s) => [s, seriesIdRow.indexOf(s)]));
  const dataLines = lines.slice(11).filter((l) => l.trim().length > 0);
  let f5Count = 0;
  for (const line of dataLines) {
    const cells = parseCsvLine(line);
    const iso = ddmmyyyyToIso(cells[0]);
    for (const [seriesId, def] of Object.entries(F5_SERIES)) {
      const raw = cells[colIdx[seriesId]];
      if (raw === "" || raw === undefined) continue; // series didn't exist yet this month — omit, never zero-fill
      const num = Number(raw);
      facts.push({
        reference_period: iso,
        period_type: "month",
        rate_type: "indicator_lending_rate",
        borrower_type: def.borrower_type,
        loan_type: def.loan_type,
        rate_percent: Number.isFinite(num) ? num : null,
        series_id: seriesId,
        raw_value: raw,
        dataset_id: "rba_indicator_lending_rates_housing",
        data_quality_status: Number.isFinite(num) ? "passed" : "range_not_numeric",
      });
      f5Count++;
    }
  }
  console.log(`F5 parsed: ${f5Count} rows (4 series, varying start dates)`);
}

console.log(`\nTotal unified fact rows: ${facts.length}`);

// ── 3. DuckDB build ───────────────────────────────────────────────────────

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(`${DB_PATH}.wal`, { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`
  create table rba_interest_rates (
    reference_period    date not null,
    period_type         varchar not null,
    rate_type           varchar not null,
    borrower_type       varchar,
    loan_type           varchar,
    rate_percent        double,
    series_id           varchar not null,
    raw_value           varchar,
    dataset_id          varchar not null,
    data_quality_status varchar not null
  )`);

const BATCH = 500;
for (let i = 0; i < facts.length; i += BATCH) {
  const slice = facts.slice(i, i + BATCH);
  const values = slice
    .map(
      (f) =>
        `(${sqlDate(f.reference_period)}, ${sqlStr(f.period_type)}, ${sqlStr(f.rate_type)}, ${sqlStr(f.borrower_type)}, ${sqlStr(f.loan_type)}, ${sqlNum(f.rate_percent)}, ${sqlStr(f.series_id)}, ${sqlStr(f.raw_value)}, ${sqlStr(f.dataset_id)}, ${sqlStr(f.data_quality_status)})`
    )
    .join(",\n");
  await run(`insert into rba_interest_rates values ${values}`);
}

const [total] = await one("select count(*) from rba_interest_rates");
const [nullRates] = await one("select count(*) from rba_interest_rates where rate_percent is null");
const [minP, maxP] = await one("select min(reference_period), max(reference_period) from rba_interest_rates");
console.log(`\nDuckDB build: ${total} rows (${nullRates} with NULL rate_percent — range-format/unpublished cells), ${minP} .. ${maxP}`);

// ── 4. Parquet export ──────────────────────────────────────────────────────

await run(`copy rba_interest_rates to '${posix(path.join(LOCAL_DIR, "rba_interest_rates.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal RBA rates store built (all gitignored):");
console.log(`  warehouse/data/local/rba_rates.duckdb  ${mb(DB_PATH)} MB`);
console.log(`  warehouse/data/local/rba_interest_rates.parquet  ${mb(path.join(LOCAL_DIR, "rba_interest_rates.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_rba_rates_local_store.mjs.");
