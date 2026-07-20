#!/usr/bin/env node
/**
 * ASGS local analytical store builder (cost-saving strategy).
 *
 * Builds a LOCAL DuckDB + Parquet staging layer from the already-downloaded,
 * already-inspected ABS ASGS Edition 3 files, so the Supabase branch stays
 * lean and no cloud disk is consumed:
 *
 *   warehouse/data/local/asgs_2021.duckdb            (gitignored)
 *   warehouse/data/local/asgs_geography.parquet      (gitignored)
 *   warehouse/data/local/asgs_correspondence.parquet (gitignored)
 *
 * No database connection, no network to Supabase, no secrets. The only
 * network access is DuckDB fetching its own `spatial` extension binary on
 * first INSTALL (tooling, like npm install — no ABS/data traffic).
 *
 * Same rules as the branch staging load:
 *   - geometry transformed GDA2020 (EPSG:7844) -> EPSG:4326 at load
 *   - ABS special-purpose records (no geometry / zero area) are quarantined
 *     in place with reasons — never dropped, never invented
 *   - correspondence ratios NULL when the source has zero area — never 0
 *   - lineage: dataset_id + source file name + SHA-256 carried on every row
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const PROCESSED = rel("warehouse", "data", "processed", "asgs", "ASGS3_2021");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "asgs_2021.duckdb");
const INVENTORY = rel("warehouse", "reports", "asgs_download_inventory.json");
const BV = "ASGS3_2021";
const PERIOD = "2021";

// Same level config as load_asgs_backbone.mjs (fields verified by inspection).
const LEVELS = [
  { level: "STATE", dataset: "asgs_state_2021_boundaries", code: "STE_CODE21", name: "STE_NAME21", parent: null, hasState: true },
  { level: "GCCSA", dataset: "asgs_gccsa_2021_boundaries", code: "GCC_CODE21", name: "GCC_NAME21", parent: "STE_CODE21", hasState: true },
  { level: "SA4", dataset: "asgs_sa4_2021_boundaries", code: "SA4_CODE21", name: "SA4_NAME21", parent: "GCC_CODE21", hasState: true },
  { level: "SA3", dataset: "asgs_sa3_2021_boundaries", code: "SA3_CODE21", name: "SA3_NAME21", parent: "SA4_CODE21", hasState: true },
  { level: "SA2", dataset: "asgs_sa2_2021_boundaries", code: "SA2_CODE21", name: "SA2_NAME21", parent: "SA3_CODE21", hasState: true },
  { level: "SA1", dataset: "asgs_sa1_2021_boundaries", code: "SA1_CODE21", name: null, parent: "SA2_CODE21", hasState: true },
  { level: "LGA", dataset: "asgs_lga_2021_boundaries", code: "LGA_CODE21", name: "LGA_NAME21", parent: null, hasState: true },
  { level: "SAL", dataset: "asgs_sal_2021_boundaries", code: "SAL_CODE21", name: "SAL_NAME21", parent: null, hasState: true },
  { level: "POA", dataset: "asgs_poa_2021_boundaries", code: "POA_CODE21", name: "POA_NAME21", parent: null, hasState: false },
];

const CORR_TARGETS = [
  { target: "SAL", codeCol: "SAL_CODE_2021", dataset: (s) => `asgs_corr_${s.toLowerCase()}_to_sal_2021` },
  { target: "POA", codeCol: "POA_CODE_2021", dataset: (s) => `asgs_corr_${s.toLowerCase()}_to_poa_2021` },
  { target: "LGA", codeCol: "LGA_CODE_2021", dataset: (s) => `asgs_corr_${s.toLowerCase()}_to_lga_2021` },
];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(INVENTORY)) fail("download inventory missing — run download_asgs_sources.mjs first");
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const invByDataset = new Map(inventory.files.map((f) => [f.dataset_id, f]));

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  // Rebuild from scratch: the store is a derived artefact of the immutable
  // raw files, so recreating it is reproduction, not data loss.
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}

console.log("build_asgs_local_store — local DuckDB/Parquet staging (no Supabase, no secrets)");
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run("INSTALL spatial; LOAD spatial;");

// ── Geography ─────────────────────────────────────────────────────────────

await run(`
  create table asgs_geography (
    geography_type    varchar not null,
    geography_code    varchar,
    geography_name    varchar,
    state_code        varchar,
    state_name        varchar,
    parent_code       varchar,
    boundary_version  varchar not null,
    reference_period  varchar not null,
    area_square_km    double,
    source_srid       integer,
    geom              geometry,
    dataset_id        varchar,
    source_file_name  varchar,
    source_sha256     varchar,
    is_quarantined    boolean not null default false,
    quarantine_reason varchar
  )`);

console.log("\nGeography levels (shapefile -> DuckDB, EPSG:7844 -> EPSG:4326):");
for (const cfg of LEVELS) {
  const dir = path.join(PROCESSED, cfg.level);
  if (!fs.existsSync(dir)) fail(`${cfg.level}: ${dir} missing — run inspect_asgs_local_files.mjs first`);
  const shp = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(".shp"));
  if (!shp) fail(`${cfg.level}: no .shp in ${dir}`);
  const inv = invByDataset.get(cfg.dataset) ?? {};
  const src = posix(path.join(dir, shp));
  await run(`
    insert into asgs_geography
    select '${cfg.level}', "${cfg.code}",
           ${cfg.name ? `"${cfg.name}"` : "null"},
           ${cfg.hasState ? '"STE_CODE21", "STE_NAME21"' : "null, null"},
           ${cfg.parent ? `"${cfg.parent}"` : "null"},
           '${BV}', '${PERIOD}',
           try_cast(AREASQKM21 as double), 7844,
           case when geom is null or ST_IsEmpty(geom) then null
                else ST_Transform(geom, 'EPSG:7844', 'EPSG:4326', true) end,
           '${cfg.dataset}', '${inv.file_name ?? shp}', '${inv.sha256 ?? ""}',
           (geom is null or ST_IsEmpty(geom)),
           case when geom is null or ST_IsEmpty(geom) then 'missing_geometry' end
    from st_read('${src}')`);
  const [n, q] = await one(
    `select count(*), count(*) filter (is_quarantined) from asgs_geography where geography_type='${cfg.level}'`
  );
  console.log(`  ${cfg.level.padEnd(6)} ${String(n).padStart(6)} rows (${q} quarantined)`);
}

// ── Correspondences (same MB-allocation aggregation as the branch load) ──

await run(`
  create table asgs_correspondence (
    source_geography_type  varchar not null,
    source_geography_code  varchar not null,
    target_geography_type  varchar not null,
    target_geography_code  varchar not null,
    ratio                  double,
    ratio_basis            varchar,
    correspondence_method  varchar,
    correspondence_version varchar,
    boundary_version       varchar,
    reference_period       varchar,
    mb_count               integer,
    sum_area_albers_sqkm   double,
    source_total_area_sqkm double,
    dataset_id             varchar,
    source_file_name       varchar,
    source_sha256          varchar,
    is_quarantined         boolean not null default false,
    quarantine_reason      varchar
  )`);

async function readXlsx(filePath, wanted) {
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
        if (missing.length) fail(`${path.basename(filePath)}: expected columns missing: ${missing.join(", ")}`);
        continue;
      }
      const cell = (name) => {
        let v = vals[colIdx[name]];
        if (v && typeof v === "object" && "result" in v) v = v.result;
        if (v === undefined || v === null || v === "") return null;
        return typeof v === "number" ? v : String(v).trim();
      };
      out.push(wanted.map(cell));
    }
    break;
  }
  return out;
}

const poaCode = (v) => (typeof v === "number" ? String(v).padStart(4, "0") : v);
const csvCell = (v) => (v === null || v === undefined ? "" : String(v));

const mbInv = invByDataset.get("asgs_mb_2021_allocation");
console.log("\nCorrespondences (official MB allocations, area-weighted):");
console.log("  reading MB_2021_AUST.xlsx ...");
const mbRows = await readXlsx(rel(mbInv.raw_storage_path), ["MB_CODE_2021", "SA1_CODE_2021", "SA2_CODE_2021", "AREA_ALBERS_SQKM"]);
const mb = new Map();
for (const [mbCodeV, sa1, sa2, area] of mbRows) {
  if (mbCodeV == null || sa1 == null || sa2 == null) continue;
  mb.set(String(mbCodeV), { sa1: String(sa1), sa2: String(sa2), area: typeof area === "number" ? area : null });
}
console.log(`    ${mbRows.length} MB rows`);

const csvPath = path.join(LOCAL_DIR, "_corr_load.tmp.csv");
const csv = fs.createWriteStream(csvPath);
csv.write("source_geography_type,source_geography_code,target_geography_type,target_geography_code,ratio,ratio_basis,correspondence_method,correspondence_version,boundary_version,reference_period,mb_count,sum_area_albers_sqkm,source_total_area_sqkm,dataset_id,source_file_name,source_sha256,is_quarantined,quarantine_reason\n");

for (const t of CORR_TARGETS) {
  const inv = invByDataset.get(t.dataset("SA1"));
  console.log(`  ${t.target}: joining ${inv.file_name} on MB_CODE_2021 ...`);
  const rows = await readXlsx(rel(inv.raw_storage_path), ["MB_CODE_2021", t.codeCol]);
  const agg = { SA1: new Map(), SA2: new Map() };
  const tot = { SA1: new Map(), SA2: new Map() };
  for (const [mbCodeV, rawTarget] of rows) {
    if (rawTarget == null) continue;
    const rec = mb.get(String(mbCodeV));
    if (!rec) continue;
    const target = t.target === "POA" ? poaCode(rawTarget) : String(rawTarget);
    const area = rec.area ?? 0;
    for (const [srcType, srcCode] of [["SA1", rec.sa1], ["SA2", rec.sa2]]) {
      const key = `${srcCode}|${target}`;
      const cur = agg[srcType].get(key) ?? { area: 0, mbs: 0 };
      cur.area += area;
      cur.mbs += 1;
      agg[srcType].set(key, cur);
      tot[srcType].set(srcCode, (tot[srcType].get(srcCode) ?? 0) + area);
    }
  }
  for (const srcType of ["SA1", "SA2"]) {
    const method = srcType === "SA1" ? "abs_sa1_allocation" : "derived_sa1_aggregation";
    const datasetId = t.dataset(srcType);
    for (const [key, { area, mbs }] of agg[srcType]) {
      const [srcCode, targetCode] = key.split("|");
      const total = tot[srcType].get(srcCode) ?? 0;
      const ratio = total > 0 ? area / total : null; // zero-area source: NULL, never 0
      const q = ratio === null;
      csv.write([
        srcType, srcCode, t.target, targetCode,
        csvCell(ratio), "area", method, BV, BV, PERIOD,
        mbs, area, total, datasetId, inv.file_name, inv.sha256,
        q, csvCell(q ? "zero_area_source" : null),
      ].join(",") + "\n");
    }
  }
}
await new Promise((res) => csv.end(res));
await run(`copy asgs_correspondence from '${posix(csvPath)}' (header, nullstr '')`);
fs.rmSync(csvPath, { force: true });
const [corrN, corrQ] = await one("select count(*), count(*) filter (is_quarantined) from asgs_correspondence");
console.log(`  ${corrN} correspondence rows (${corrQ} quarantined)`);

// ── Parquet exports (geometry as WKB) ────────────────────────────────────

const geoParquet = posix(path.join(LOCAL_DIR, "asgs_geography.parquet"));
const corrParquet = posix(path.join(LOCAL_DIR, "asgs_correspondence.parquet"));
await run(`copy (select * replace (ST_AsWKB(geom) as geom) from asgs_geography) to '${geoParquet}' (format parquet, compression zstd)`);
await run(`copy asgs_correspondence to '${corrParquet}' (format parquet, compression zstd)`);

await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal store built (all gitignored):");
console.log(`  ${posix(path.relative(repoRoot, DB_PATH))}  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/asgs_geography.parquet  ${mb1(rel("warehouse", "data", "local", "asgs_geography.parquet"))} MB`);
console.log(`  warehouse/data/local/asgs_correspondence.parquet  ${mb1(rel("warehouse", "data", "local", "asgs_correspondence.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_asgs_local_store.mjs.");
