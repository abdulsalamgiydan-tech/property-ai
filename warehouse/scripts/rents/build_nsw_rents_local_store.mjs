#!/usr/bin/env node
/**
 * NSW rental market local store builder — pilot (Sprint 6, Part C-D).
 *
 * Downloads the manifest-verified quarterly DCJ Rent and Sales Report xlsx
 * files (plain HTTPS, no anti-bot challenge on dcj.nsw.gov.au — unlike the
 * NSW VG PSI source in Sprint 5) into gitignored local storage, hashes them,
 * and parses both the `LGA` and `Postcode` sheets of each quarter.
 *
 * Sheet layout (validated directly against a real downloaded file —
 * Table 1 "Weekly rents statistics by NSW Local Government Area" / Table 2
 * "...by NSW Postcode"): header row 9, data from row 10. Columns:
 *   LGA:      GMR, Greater Sydney, Rings, LGA, Dwelling Type, Bedrooms,
 *             Q1 rent, Median rent, Q3 rent, New Bonds Lodged, Total Bonds
 *             Held, QoQ change, YoY change, QoQ bonds change, YoY bonds change
 *   Postcode: Postcode, Dwelling Type, Bedrooms, Q1 rent, Median rent,
 *             Q3 rent, New Bonds Lodged, Total Bonds Held, ... (same changes)
 *
 * Suppression: DCJ marks cells "s" (<=30 bonds, use with caution) or "-"
 * (<=10 bonds, suppressed) instead of publishing a number. Both are parsed
 * to NULL with a recorded suppression reason — never treated as zero or
 * estimated.
 *
 * Local-first: raw files + this full store stay under warehouse/data/
 * (gitignored) and are never promoted to Supabase in full — only curated
 * quarterly summaries leave the local store (Part E).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const MANIFEST = rel("warehouse", "reports", "nsw_rental_bonds_source_manifest.json");
const INVENTORY_OUT = rel("warehouse", "reports", "nsw_rental_bonds_download_inventory.json");
const RAW_DIR = rel("warehouse", "data", "raw", "nsw_rents");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "nsw_rents.duckdb");

const PILOT_LGAS = ["Blacktown", "Camden", "Newcastle", "Parramatta", "Shellharbour", "Wollongong"];
const pilotPostcodes = new Set(
  JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_sales_pilot_poas.json"), "utf8")).map((r) => r.geography_code)
);

// Dwelling-type mapping: DCJ's own categories map directly (unlike the NSW
// VG PSI records, which needed inference) — preserved 1:1, high confidence.
const DWELLING_MAP = {
  House: ["detached_house", "high"],
  "Flat/Unit": ["apartment_unit", "high"],
  Townhouse: ["townhouse_villa_semidetached", "high"],
  Other: ["other_residential", "medium"],
  Total: ["all", "high"],
};
const BEDROOM_MAP = { Bedsitter: 0, "1 Bedroom": 1, "2 Bedrooms": 2, "3 Bedrooms": 3, "4 or more Bedrooms": 4, "Not Specified": null, Total: null };

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail("manifest missing — run discover_nsw_rent_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const entries = manifest.entries.filter((e) => e.status === "discovered");
if (entries.length === 0) fail("no discovered quarters in the manifest");

console.log("build_nsw_rents_local_store — NSW DCJ Rent and Sales Report pilot (local-first, no Supabase, no secrets)");
console.log(`  pilot LGAs: ${PILOT_LGAS.join(", ")}; pilot postcodes: ${pilotPostcodes.size}`);

// ── 1. Download (plain HTTPS; hashed inventory) ───────────────────────────

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

fs.mkdirSync(RAW_DIR, { recursive: true });
const inventory = { generated_at: new Date().toISOString(), raw_root: "warehouse/data/raw/nsw_rents (gitignored)", files: [] };
console.log(`\nDownloading ${entries.length} quarterly files:`);
for (const e of entries) {
  const dest = path.join(RAW_DIR, `${e.quarter}.xlsx`);
  if (fs.existsSync(dest)) {
    const hash = sha256(fs.readFileSync(dest));
    console.log(`  skip  ${e.quarter} (already downloaded)`);
    inventory.files.push({ quarter: e.quarter, dataset_id: e.dataset_id, source_url: e.official_url, file: `nsw_rents/${e.quarter}.xlsx`, size_bytes: fs.statSync(dest).size, sha256: hash });
    continue;
  }
  if (!e.official_url.startsWith("https://dcj.nsw.gov.au/")) fail(`non-official URL refused by policy: ${e.quarter}`);
  const res = await fetch(e.official_url, { redirect: "follow", signal: AbortSignal.timeout(60000) });
  if (!res.ok) fail(`download failed for ${e.quarter}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  const hash = sha256(buf);
  console.log(`  get   ${e.quarter}  ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
  inventory.files.push({ quarter: e.quarter, dataset_id: e.dataset_id, source_url: e.official_url, file: `nsw_rents/${e.quarter}.xlsx`, size_bytes: buf.length, sha256: hash });
  await new Promise((r) => setTimeout(r, 1000));
}
fs.writeFileSync(INVENTORY_OUT, JSON.stringify(inventory, null, 2) + "\n");
console.log(`Inventory written: ${inventory.files.length} files hashed`);

// ── 2. Parse LGA + Postcode sheets per quarter ────────────────────────────

async function parseSheet(filePath, sheetName, quarter, geoColIdx, geoType) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) fail(`${quarter}: sheet '${sheetName}' not found`);

  // Header row position shifted between report vintages (row 8 in 2021,
  // row 9 from ~2022 onward — an extra explanatory note line was added) —
  // locate it by content instead of assuming a fixed row number.
  const expectFirst = geoType === "LGA" ? "Greater Metropolitan Region (GMR)" : "Postcode";
  let headerRow = null;
  for (let r = 1; r <= 20; r++) {
    if (String(ws.getRow(r).getCell(1).value ?? "").trim() === expectFirst) { headerRow = r; break; }
  }
  if (headerRow === null) fail(`${quarter}/${sheetName}: header row not found (looked for '${expectFirst}' in the first 20 rows)`);

  const rows = [];
  const suppressed = { s: 0, dash: 0 };
  const parseNum = (v, reasonKey) => {
    if (v === null || v === undefined || v === "") return null;
    if (v === "s") { suppressed.s++; return null; }
    if (v === "-") { suppressed.dash++; return null; }
    const n = typeof v === "number" ? v : Number(String(v).replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  };
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    if (geoType === "LGA") {
      // The LGA sheet redundantly repeats each LGA's row under every
      // GMR/Greater-Sydney-region/Ring grouping it belongs to, with
      // identical values each time — keep only the ungrouped
      // Total/Total/Total row (the plain LGA-level figures) to avoid
      // loading the same data multiple times under different labels.
      const gmr = String(row.getCell(1).value ?? "").trim();
      const region = String(row.getCell(2).value ?? "").trim();
      const ring = String(row.getCell(3).value ?? "").trim();
      if (gmr !== "Total" || region !== "Total" || ring !== "Total") return;
    }
    const geoRaw = row.getCell(geoColIdx).value;
    const dwellingRaw = String(row.getCell(geoColIdx + 1).value ?? "").trim();
    const bedroomRaw = String(row.getCell(geoColIdx + 2).value ?? "").trim();
    rows.push({
      quarter,
      geo_type: geoType,
      geo_raw: geoType === "LGA" ? String(geoRaw).trim() : String(geoRaw),
      dwelling_raw: dwellingRaw,
      bedroom_raw: bedroomRaw,
      q1_rent: parseNum(row.getCell(geoColIdx + 3).value),
      median_rent: parseNum(row.getCell(geoColIdx + 4).value),
      q3_rent: parseNum(row.getCell(geoColIdx + 5).value),
      new_bonds: parseNum(row.getCell(geoColIdx + 6).value),
      total_bonds: parseNum(row.getCell(geoColIdx + 7).value),
    });
  });
  return { rows, suppressed };
}

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`create table nsw_rent_raw (
  quarter varchar, geo_type varchar, geo_raw varchar, dwelling_raw varchar, bedroom_raw varchar,
  q1_rent double, median_rent double, q3_rent double, new_bonds integer, total_bonds integer,
  dataset_id varchar, source_sha256 varchar
)`);

console.log("\nParsing LGA + Postcode sheets per quarter, filtering to pilot area:");
let totalRows = 0;
let pilotRows = 0;
for (const e of entries) {
  const filePath = rel("warehouse", "data", "raw", "nsw_rents", `${e.quarter}.xlsx`);
  const inv = inventory.files.find((f) => f.quarter === e.quarter);
  const lga = await parseSheet(filePath, "LGA", e.quarter, 4, "LGA");
  const poa = await parseSheet(filePath, "Postcode", e.quarter, 1, "POA");
  const pilotLga = lga.rows.filter((r) => PILOT_LGAS.includes(r.geo_raw));
  const pilotPoa = poa.rows.filter((r) => pilotPostcodes.has(String(r.geo_raw)));
  totalRows += lga.rows.length + poa.rows.length;
  pilotRows += pilotLga.length + pilotPoa.length;

  const insertBatch = async (rows) => {
    for (let i = 0; i < rows.length; i += 500) {
      const slice = rows.slice(i, i + 500);
      if (slice.length === 0) continue;
      const params = [];
      const tuples = slice.map((r) => {
        params.push(r.quarter, r.geo_type, r.geo_raw, r.dwelling_raw, r.bedroom_raw, r.q1_rent, r.median_rent, r.q3_rent, r.new_bonds, r.total_bonds, e.dataset_id, inv.sha256);
        const b = params.length - 12;
        return `(${Array.from({ length: 12 }, (_, j) => `$${b + j + 1}`).join(",")})`;
      });
      await db.run(`insert into nsw_rent_raw values ${tuples.join(",")}`, params);
    }
  };
  await insertBatch(pilotLga);
  await insertBatch(pilotPoa);
  console.log(`  ${e.quarter}: LGA ${pilotLga.length}/${lga.rows.length} pilot rows, POA ${pilotPoa.length}/${poa.rows.length} pilot rows (suppressed: LGA s=${lga.suppressed.s}/-=${lga.suppressed.dash}, POA s=${poa.suppressed.s}/-=${poa.suppressed.dash})`);
}
console.log(`\nTotal parsed: ${totalRows} rows across all sheets, ${pilotRows} matched the pilot area`);

// ── 3. Classify dwelling type + bedroom, quarter start date ──────────────

await run(`
  alter table nsw_rent_raw add column dwelling_type varchar;
  alter table nsw_rent_raw add column dwelling_type_confidence varchar;
  alter table nsw_rent_raw add column bedroom_count integer;
  alter table nsw_rent_raw add column reference_period date;
`);
for (const [raw, [mapped, conf]] of Object.entries(DWELLING_MAP)) {
  await run(`update nsw_rent_raw set dwelling_type='${mapped}', dwelling_type_confidence='${conf}' where dwelling_raw='${raw.replaceAll("'", "''")}'`);
}
await run(`update nsw_rent_raw set dwelling_type='unknown_residential', dwelling_type_confidence='low' where dwelling_type is null`);
for (const [raw, mapped] of Object.entries(BEDROOM_MAP)) {
  await run(`update nsw_rent_raw set bedroom_count=${mapped === null ? "null" : mapped} where bedroom_raw='${raw.replaceAll("'", "''")}'`);
}
// quarter labels are 'YYYY-QQ' where QQ is the quarter END month (03/06/09/12)
// per DCJ's reporting convention (e.g. "2026-03" = Jan-Mar 2026 quarter) —
// reference_period is the quarter's FIRST day for consistency with the other
// warehouse fact tables (reference_period = start of period).
await run(`
  update nsw_rent_raw set reference_period = case
    when quarter like '%-03' then make_date(cast(split_part(quarter,'-',1) as integer), 1, 1)
    when quarter like '%-06' then make_date(cast(split_part(quarter,'-',1) as integer), 4, 1)
    when quarter like '%-09' then make_date(cast(split_part(quarter,'-',1) as integer), 7, 1)
    when quarter like '%-12' then make_date(cast(split_part(quarter,'-',1) as integer), 10, 1)
  end`);

const [dtCounts] = [await db.runAndReadAll("select dwelling_type, count(*)::int n from nsw_rent_raw group by 1 order by 1")];
console.log("\nDwelling type classification:", dtCounts.getRowObjects().map((r) => `${r.dwelling_type}=${Number(r.n)}`).join(", "));

// ── 4. Geography join (LGA name -> LGA dim; postcode -> POA dim) ─────────

const PILOT_LGA_CODES = { Blacktown: "10750", Camden: "11450", Newcastle: "15900", Parramatta: "16260", Shellharbour: "16900", Wollongong: "18450" };
await run(`alter table nsw_rent_raw add column lga_geography_id varchar; alter table nsw_rent_raw add column lga_geography_code varchar;`);
await run(`alter table nsw_rent_raw add column poa_geography_id varchar; alter table nsw_rent_raw add column poa_geography_code varchar;`);
for (const [name, code] of Object.entries(PILOT_LGA_CODES)) {
  await run(`update nsw_rent_raw set lga_geography_id='LGA_${code}_ASGS3_2021', lga_geography_code='${code}' where geo_type='LGA' and geo_raw='${name}'`);
}
{
  const poaRows = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_sales_pilot_poas.json"), "utf8"));
  const params = [];
  const tuples = poaRows.map((r) => {
    params.push(r.geography_code, `POA_${r.geography_code}_ASGS3_2021`, r.geography_code);
    const b = params.length - 3;
    return `($${b + 1},$${b + 2},$${b + 3})`;
  });
  await db.run(`create temp table poa_lookup(code varchar, gid varchar, geocode varchar); insert into poa_lookup values ${tuples.join(",")};`, params);
  await run(`
    update nsw_rent_raw t set poa_geography_id = p.gid, poa_geography_code = p.geocode
    from poa_lookup p where t.geo_type='POA' and t.geo_raw = p.code`);
}

// ── 5. Curated summary (this is what gets promoted, at LGA + POA grain) ──

await run(`create table nsw_rental_summary as
  select coalesce(lga_geography_id, poa_geography_id) as geography_id,
         geo_type as geography_type,
         coalesce(lga_geography_code, poa_geography_code) as geography_code,
         reference_period, 'quarter' as period_type,
         dwelling_type, bedroom_count,
         median_rent as median_weekly_rent, q1_rent as lower_quartile_weekly_rent, q3_rent as upper_quartile_weekly_rent,
         new_bonds as rental_count, total_bonds as total_bonds_held,
         dataset_id, source_sha256,
         case when new_bonds is null then 'insufficient'
              when new_bonds >= 30 then 'high' when new_bonds >= 10 then 'medium'
              when new_bonds >= 5 then 'low' else 'insufficient' end as sample_size_confidence
  from nsw_rent_raw
  where coalesce(lga_geography_id, poa_geography_id) is not null
    -- 'Not Specified' bedroom rows (lease didn't record bedroom count) and
    -- 'Total' rows (aggregate across all bedroom counts) both carry
    -- bedroom_count=NULL — they are different things, but this pilot only
    -- needs the Total aggregate; drop 'Not Specified' to keep the natural
    -- key (geography, period, dwelling_type, bedroom_count) unique.
    and bedroom_raw <> 'Not Specified'`);

const [summaryN] = await one("select count(*) from nsw_rental_summary");
console.log(`\nCurated summary rows: ${summaryN}`);

// ── 6. Parquet export ──────────────────────────────────────────────────

await run(`copy nsw_rental_summary to '${posix(path.join(LOCAL_DIR, "nsw_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal NSW rents store built (all gitignored):");
console.log(`  warehouse/data/local/nsw_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/nsw_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_nsw_rents_local_store.mjs.");
