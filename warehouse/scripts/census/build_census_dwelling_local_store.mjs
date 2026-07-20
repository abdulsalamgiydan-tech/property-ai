#!/usr/bin/env node
/**
 * 2021 Census dwelling local store builder (Sprint 3, Part C).
 *
 * Downloads the manifest-approved official ABS files into gitignored raw
 * storage (SHA-256 recorded), extracts the GCP DataPacks, and builds the
 * local DuckDB/Parquet staging store:
 *
 *   warehouse/data/local/census_2021.duckdb                   (gitignored)
 *     tables: census_dwelling_stock, census_household_tenure,
 *             mb_dwelling_counts, correspondence_dwelling_weights
 *   warehouse/data/local/census_dwelling_stock.parquet        (gitignored)
 *   warehouse/data/local/census_household_tenure.parquet      (gitignored)
 *   warehouse/data/local/correspondence_dwelling_weights.parquet (gitignored)
 *
 * Column mappings below were confirmed from the DataPack's own Metadata
 * workbook (2021 GCP: G36 = Dwelling Structure incl. unoccupied/total PDs;
 * G37 = Tenure and Landlord Type), not assumed.
 *
 * No Supabase connection, no secrets. Downloads are ABS-only, sequential and
 * polite (ABS rate-limits bursts; failures cool down and retry).
 * Missing data stays NULL; negative or code-less rows are quarantined.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const MANIFEST = rel("warehouse", "reports", "census_dwelling_source_manifest.json");
const INVENTORY_OUT = rel("warehouse", "reports", "census_dwelling_download_inventory.json");
const RAW_ROOT = rel("warehouse", "data", "raw", "census", "2021");
const PROCESSED = rel("warehouse", "data", "processed", "census", "2021");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "census_2021.duckdb");
const ASGS_CORR_DIR = rel("warehouse", "data", "raw", "asgs", "ASGS3_2021", "correspondences");
const BSDTAR = "C:\\Windows\\System32\\tar.exe";
const CENSUS_YEAR = 2021;

const LEVELS = ["SAL", "POA", "SA2", "SA1", "LGA"];

// Confirmed from Metadata_2021_GCP_DataPack_R1_R2.xlsx + G36/G37 CSV headers.
const G36_MAP = [
  ["occupied_private_dwellings", "separate_house", "OPDs_Separate_house_Dwellings"],
  ["occupied_private_dwellings", "semi_detached_row_terrace_townhouse", "OPDs_SD_r_t_h_th_Tot_Dwgs"],
  ["occupied_private_dwellings", "flat_apartment", "OPDs_Flt_apart_Tot_Dwgs"],
  ["occupied_private_dwellings", "other_dwelling", "OPDs_Other_dwelling_Tot_Dwgs"],
  ["occupied_private_dwellings", "not_stated", "OPDs_Dwlling_structur_NS_Dwgs"],
  ["occupied_private_dwellings", "all", "OPDs_Tot_OPDs_Dwellings"],
  ["unoccupied_private_dwellings", "all", "Unoccupied_PDs_Dwgs"],
  ["total_private_dwellings", "all", "Total_PDs_Dwellings"],
];
const G37_MAP = [
  ["owned_outright", "O_OR_Total"],
  ["owned_with_mortgage", "O_MTG_Total"],
  ["rented", "R_Tot_Total"],
  ["other_tenure", "Oth_ten_type_Total"],
  ["not_stated", "Ten_type_NS_Total"],
  ["all", "Total_Total"],
];

const ASGS_TARGETS = [
  ["SAL", "SAL_2021_AUST.xlsx", "SAL_CODE_2021"],
  ["POA", "POA_2021_AUST.xlsx", "POA_CODE_2021"],
  ["LGA", "LGA_2021_AUST.xlsx", "LGA_CODE_2021"],
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail("census source manifest missing — run discover_census_dwelling_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const downloadable = manifest.entries.filter((e) => e.status === "discovered" && e.intended_raw_storage_path);
const unresolved = manifest.entries.filter((e) => e.entry_type !== "documentation" && e.status !== "discovered");
if (unresolved.length) fail(`manifest has unresolved entries: ${unresolved.map((e) => e.dataset_id).join(", ")}`);
if (!fs.existsSync(ASGS_CORR_DIR)) fail("ASGS allocation xlsx files missing (needed for dwelling-weighted correspondence)");

// ── 1. Controlled download (curl; ABS-only; SHA-256; resumable) ──────────

function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    fs.createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let inventory = { files: [] };
if (fs.existsSync(INVENTORY_OUT)) inventory = JSON.parse(fs.readFileSync(INVENTORY_OUT, "utf8"));
const invByDataset = new Map(inventory.files.map((f) => [f.dataset_id, f]));

console.log("build_census_dwelling_local_store — local-first (no Supabase, no secrets)");
console.log(`\nDownloads (${downloadable.length} files, official ABS only):`);
for (const e of downloadable) {
  if (!e.official_url.startsWith("https://www.abs.gov.au/")) fail(`non-ABS URL refused by policy: ${e.dataset_id}`);
  const dest = rel(e.intended_raw_storage_path);
  const prior = invByDataset.get(e.dataset_id);
  if (fs.existsSync(dest) && prior?.sha256 && (await sha256File(dest)) === prior.sha256) {
    console.log(`  skip  ${e.dataset_id} (already downloaded, SHA-256 verified)`);
    continue;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let ok = false;
  for (let attempt = 1; attempt <= 8 && !ok; attempt++) {
    try {
      process.stdout.write(`  get   ${e.dataset_id} (attempt ${attempt}) ... `);
      execFileSync("curl", ["-sS", "-L", "--max-time", "3600", "-o", `${dest}.part`, e.official_url], { stdio: "pipe" });
      fs.renameSync(`${dest}.part`, dest);
      ok = true;
      const bytes = fs.statSync(dest).size;
      const hash = await sha256File(dest);
      invByDataset.set(e.dataset_id, {
        dataset_id: e.dataset_id,
        file_name: e.expected_file_name,
        source_url: e.official_url,
        raw_storage_path: e.intended_raw_storage_path,
        size_bytes: bytes,
        sha256: hash,
        downloaded_at: new Date().toISOString(),
      });
      console.log(`${(bytes / 1024 / 1024).toFixed(1)} MB ok`);
    } catch {
      console.log("failed; cooling down 90s (ABS rate limiting)");
      fs.rmSync(`${dest}.part`, { force: true });
      await sleep(90_000);
    }
  }
  if (!ok) fail(`download failed after retries: ${e.dataset_id}`);
  await sleep(8_000);
}
inventory = {
  generated_at: new Date().toISOString(),
  raw_root: "warehouse/data/raw/census/2021 (gitignored — only these hashes are committed)",
  files: [...invByDataset.values()].sort((a, b) => a.dataset_id.localeCompare(b.dataset_id)),
};
fs.writeFileSync(INVENTORY_OUT, JSON.stringify(inventory, null, 2) + "\n");

// ── 2. Extract packs ─────────────────────────────────────────────────────

console.log("\nExtracting DataPacks:");
for (const level of LEVELS) {
  const inv = invByDataset.get(`census_gcp_${level.toLowerCase()}_2021`);
  const dest = path.join(PROCESSED, level);
  const already = fs.existsSync(dest) && fs.readdirSync(dest).length > 0;
  if (!already) {
    fs.mkdirSync(dest, { recursive: true });
    execFileSync(BSDTAR, ["-xf", rel(inv.raw_storage_path), "-C", dest], { stdio: "pipe" });
  }
  console.log(`  ${level}: ${already ? "already extracted" : "extracted"}`);
}

function findGcsv(level, table) {
  const stack = [path.join(PROCESSED, level)];
  const want = `2021Census_${table}_AUST_${level}.csv`.toLowerCase();
  while (stack.length) {
    const d = stack.pop();
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) stack.push(p);
      else if (f.name.toLowerCase() === want) return p;
    }
  }
  fail(`${level}: ${table} CSV not found in extracted pack`);
}

// ── 3. DuckDB build ──────────────────────────────────────────────────────

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`
  create table census_dwelling_stock (
    geography_type    varchar not null,
    geography_code    varchar,            -- ASGS-aligned (alpha prefix stripped)
    geography_code_raw varchar,           -- as published in the DataPack
    census_year       integer not null,
    gcp_table         varchar not null,
    source_column     varchar not null,
    measure_name      varchar not null,
    dwelling_type     varchar not null,
    value_count       integer,            -- NULL when unpublished; never zero-filled
    dataset_id        varchar,
    source_file_name  varchar,
    source_sha256     varchar,
    is_quarantined    boolean not null default false,
    quarantine_reason varchar
  )`);
await run(`
  create table census_household_tenure (
    geography_type    varchar not null,
    geography_code    varchar,
    geography_code_raw varchar,
    census_year       integer not null,
    gcp_table         varchar not null,
    source_column     varchar not null,
    tenure_type       varchar not null,
    household_count   integer,
    dataset_id        varchar,
    source_file_name  varchar,
    source_sha256     varchar,
    is_quarantined    boolean not null default false,
    quarantine_reason varchar
  )`);

console.log("\nDuckDB build (G36 dwellings + G37 tenure, unpivoted):");
for (const level of LEVELS) {
  const inv = invByDataset.get(`census_gcp_${level.toLowerCase()}_2021`);
  const codeCol = `${level}_CODE_2021`;
  const g36 = posix(findGcsv(level, "G36"));
  const g37 = posix(findGcsv(level, "G37"));

  const g36Selects = G36_MAP.map(
    ([measure, dtype, col]) => `
      select '${level}', regexp_replace(cast("${codeCol}" as varchar), '^[A-Za-z]+', ''), cast("${codeCol}" as varchar),
             ${CENSUS_YEAR}, 'G36', '${col}', '${measure}', '${dtype}',
             try_cast("${col}" as integer),
             '${inv.dataset_id}', '${inv.file_name}', '${inv.sha256}',
             ("${codeCol}" is null or try_cast("${col}" as integer) < 0),
             case when "${codeCol}" is null then 'null_geography_code'
                  when try_cast("${col}" as integer) < 0 then 'negative_count' end
      from read_csv('${g36}', header=true)`
  );
  await run(`insert into census_dwelling_stock ${g36Selects.join(" union all ")}`);

  const g37Selects = G37_MAP.map(
    ([tenure, col]) => `
      select '${level}', regexp_replace(cast("${codeCol}" as varchar), '^[A-Za-z]+', ''), cast("${codeCol}" as varchar),
             ${CENSUS_YEAR}, 'G37', '${col}', '${tenure}',
             try_cast("${col}" as integer),
             '${inv.dataset_id}', '${inv.file_name}', '${inv.sha256}',
             ("${codeCol}" is null or try_cast("${col}" as integer) < 0),
             case when "${codeCol}" is null then 'null_geography_code'
                  when try_cast("${col}" as integer) < 0 then 'negative_count' end
      from read_csv('${g37}', header=true)`
  );
  await run(`insert into census_household_tenure ${g37Selects.join(" union all ")}`);

  const [dn, tn] = await one(
    `select (select count(*) from census_dwelling_stock where geography_type='${level}'),
            (select count(*) from census_household_tenure where geography_type='${level}')`
  );
  console.log(`  ${level.padEnd(4)} dwelling cells: ${dn}, tenure cells: ${tn}`);
}

// ── 4. Mesh Block dwelling counts (xlsx -> table) ────────────────────────

async function readMbCountsXlsx(filePath) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", worksheets: "emit",
  });
  const rows = [];
  for await (const sheet of wb) {
    let colIdx = null;
    for await (const row of sheet) {
      const vals = row.values;
      if (!colIdx) {
        // Header rows vary by sheet; detect the row that carries MB_CODE_2021.
        const idx = {};
        vals.forEach((v, i) => { if (v != null) idx[String(v).trim()] = i; });
        if ("MB_CODE_2021" in idx) colIdx = idx;
        continue;
      }
      const cell = (name) => {
        let v = vals[colIdx[name]];
        if (v && typeof v === "object" && "result" in v) v = v.result;
        if (v === undefined || v === null || v === "") return null;
        return v;
      };
      const mb = cell("MB_CODE_2021");
      if (mb === null) continue;
      const dw = cell("Dwelling");
      const ps = cell("Person");
      rows.push([String(mb), typeof dw === "number" ? dw : null, typeof ps === "number" ? ps : null]);
    }
  }
  return rows;
}

const mbInv = invByDataset.get("census_mb_counts_2021");
console.log("\nMesh Block counts (dwelling-weight input):");
const mbCounts = await readMbCountsXlsx(rel(mbInv.raw_storage_path));
await run("create table mb_dwelling_counts (mb_code varchar primary key, dwellings integer, persons integer)");
{
  const csvPath = path.join(LOCAL_DIR, "_mb_counts.tmp.csv");
  const out = fs.createWriteStream(csvPath);
  out.write("mb_code,dwellings,persons\n");
  for (const [mb, dw, ps] of mbCounts) out.write(`${mb},${dw ?? ""},${ps ?? ""}\n`);
  await new Promise((res) => out.end(res));
  await run(`copy mb_dwelling_counts from '${posix(csvPath)}' (header, nullstr '')`);
  fs.rmSync(csvPath, { force: true });
}
const [mbN, mbDw] = await one("select count(*), sum(dwellings) from mb_dwelling_counts");
console.log(`  ${mbN} MB rows, ${mbDw} total dwellings`);

// ── 5. Dwelling-weighted correspondence pairs ────────────────────────────
// Rebuilds the SA1/SA2 -> SAL/POA/LGA pairs from the official ASGS MB
// allocation files (already on disk, hash-verified in Sprint 2), weighted by
// Census MB dwelling counts. Zero-dwelling sources keep ratio NULL (they can
// fall back to the existing area weights at load time — never zero-filled).

async function readXlsxCols(filePath, wanted) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    entries: "emit", sharedStrings: "cache", styles: "ignore", hyperlinks: "ignore", worksheets: "emit",
  });
  const out = [];
  for await (const sheet of wb) {
    let colIdx = null;
    for await (const row of sheet) {
      const vals = row.values;
      if (!colIdx) {
        colIdx = {};
        vals.forEach((v, i) => { if (v != null) colIdx[String(v).trim()] = i; });
        const missing = wanted.filter((w) => !(w in colIdx));
        if (missing.length) fail(`${path.basename(filePath)}: columns missing: ${missing.join(", ")}`);
        continue;
      }
      const cell = (name) => {
        let v = vals[colIdx[name]];
        if (v && typeof v === "object" && "result" in v) v = v.result;
        if (v === undefined || v === null || v === "") return null;
        return v;
      };
      out.push(wanted.map(cell));
    }
    break;
  }
  return out;
}

console.log("\nDwelling-weighted correspondence pairs (ASGS MB allocations x MB dwelling counts):");
const mbMain = await readXlsxCols(path.join(ASGS_CORR_DIR, "MB_2021_AUST.xlsx"), ["MB_CODE_2021", "SA1_CODE_2021", "SA2_CODE_2021"]);
const mbToMain = new Map(mbMain.filter((r) => r[0] != null).map(([mb, sa1, sa2]) => [String(mb), { sa1: String(sa1), sa2: String(sa2) }]));
const mbDwMap = new Map(mbCounts.map(([mb, dw]) => [mb, dw]));

await run(`
  create table correspondence_dwelling_weights (
    source_geography_type varchar not null,
    source_geography_code varchar not null,
    target_geography_type varchar not null,
    target_geography_code varchar not null,
    dwelling_ratio        double,           -- NULL when the source has zero/unknown dwellings
    source_dwellings      integer,
    pair_dwellings        integer,
    mb_count              integer,
    census_year           integer not null
  )`);

const poaPad = (v) => (typeof v === "number" ? String(v).padStart(4, "0") : String(v));
for (const [target, file, codeCol] of ASGS_TARGETS) {
  const rows = await readXlsxCols(path.join(ASGS_CORR_DIR, file), ["MB_CODE_2021", codeCol]);
  const agg = { SA1: new Map(), SA2: new Map() };
  const tot = { SA1: new Map(), SA2: new Map() };
  for (const [mbCode, rawTarget] of rows) {
    if (rawTarget == null || mbCode == null) continue;
    const main = mbToMain.get(String(mbCode));
    if (!main) continue;
    const dw = mbDwMap.get(String(mbCode)) ?? 0;
    const targetCode = target === "POA" ? poaPad(rawTarget) : String(rawTarget);
    for (const [srcType, srcCode] of [["SA1", main.sa1], ["SA2", main.sa2]]) {
      const key = `${srcCode}|${targetCode}`;
      const cur = agg[srcType].get(key) ?? { dw: 0, mbs: 0 };
      cur.dw += dw;
      cur.mbs += 1;
      agg[srcType].set(key, cur);
      tot[srcType].set(srcCode, (tot[srcType].get(srcCode) ?? 0) + dw);
    }
  }
  const csvPath = path.join(LOCAL_DIR, "_cw.tmp.csv");
  const out = fs.createWriteStream(csvPath);
  out.write("source_geography_type,source_geography_code,target_geography_type,target_geography_code,dwelling_ratio,source_dwellings,pair_dwellings,mb_count,census_year\n");
  for (const srcType of ["SA1", "SA2"]) {
    for (const [key, { dw, mbs }] of agg[srcType]) {
      const [srcCode, targetCode] = key.split("|");
      const total = tot[srcType].get(srcCode) ?? 0;
      const ratio = total > 0 ? dw / total : ""; // NULL when zero-dwelling source
      out.write(`${srcType},${srcCode},${target},${targetCode},${ratio},${total},${dw},${mbs},${CENSUS_YEAR}\n`);
    }
  }
  await new Promise((res) => out.end(res));
  await run(`copy correspondence_dwelling_weights from '${posix(csvPath)}' (header, nullstr '')`);
  fs.rmSync(csvPath, { force: true });
  console.log(`  ${target}: pairs aggregated`);
}
const [cwN, cwNull] = await one("select count(*), count(*) filter (dwelling_ratio is null) from correspondence_dwelling_weights");
console.log(`  ${cwN} weighted pairs (${cwNull} zero-dwelling sources kept NULL)`);

// ── 6. Parquet exports ───────────────────────────────────────────────────

await run(`copy census_dwelling_stock to '${posix(path.join(LOCAL_DIR, "census_dwelling_stock.parquet"))}' (format parquet, compression zstd)`);
await run(`copy census_household_tenure to '${posix(path.join(LOCAL_DIR, "census_household_tenure.parquet"))}' (format parquet, compression zstd)`);
await run(`copy correspondence_dwelling_weights to '${posix(path.join(LOCAL_DIR, "correspondence_dwelling_weights.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal Census store built (all gitignored):");
for (const f of ["census_2021.duckdb", "census_dwelling_stock.parquet", "census_household_tenure.parquet", "correspondence_dwelling_weights.parquet"]) {
  console.log(`  warehouse/data/local/${f}  ${mb1(path.join(LOCAL_DIR, f))} MB`);
}
console.log("Download inventory (hashes) written: warehouse/reports/census_dwelling_download_inventory.json");
console.log("No Supabase connection was made. Validate with validate_census_dwelling_local_store.mjs.");
