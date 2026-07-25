#!/usr/bin/env node
/**
 * NSW rental market local store builder — FULL STATE (Sprint 7, Part B).
 *
 * Full-state expansion of the Sprint 6 pilot build. The already-downloaded
 * DCJ Rent and Sales Report quarterly files already contain ALL of NSW in
 * both the LGA and Postcode sheets — the pilot build filtered rows DOWN to
 * 6 LGAs / 63 postcodes at parse time. This script is that same parser with
 * the filter removed, widened to all 129 NSW LGAs and all NSW postcodes
 * (national POA lookup — DCJ's own report is inherently NSW-scoped, so no
 * out-of-state postcode can appear in the source data; see the pilot
 * build's header comment for the same reasoning applied to sales).
 *
 * No new downloads are needed — reuses the same 15 quarterly files already
 * hashed and stored under warehouse/data/raw/nsw_rents/.
 *
 * Local-first: the full quarterly sheet data stays under warehouse/data/
 * (gitignored) — only curated quarterly summaries leave the local store.
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

const ALL_LGAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_all_lgas.json"), "utf8"));
const ALL_POAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_all_poas.json"), "utf8"));
const lgaByName = new Map(ALL_LGAS.map((r) => [r.geography_name, r]));
const poaByCode = new Map(ALL_POAS.map((r) => [r.geography_code, r]));

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

console.log("build_nsw_rents_full_state_local_store — NSW DCJ Rent and Sales Report, full state (local-first, no Supabase, no secrets)");
console.log(`  NSW LGAs: ${ALL_LGAS.length}; NSW-scoped POA lookup: ${ALL_POAS.length}`);

// ── 1. Ensure files present (reuses Sprint 6 downloads; hashed inventory) ─

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

fs.mkdirSync(RAW_DIR, { recursive: true });
const inventory = { generated_at: new Date().toISOString(), raw_root: "warehouse/data/raw/nsw_rents (gitignored)", scope: "full_state", files: [] };
console.log(`\nChecking ${entries.length} quarterly files:`);
for (const e of entries) {
  const dest = path.join(RAW_DIR, `${e.quarter}.xlsx`);
  if (fs.existsSync(dest)) {
    const hash = sha256(fs.readFileSync(dest));
    console.log(`  ok    ${e.quarter} (already on disk)`);
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

// ── 2. Parse LGA + Postcode sheets per quarter — FULL STATE, no filter ────

async function parseSheet(filePath, sheetName, quarter, geoColIdx, geoType) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) fail(`${quarter}: sheet '${sheetName}' not found`);

  const expectFirst = geoType === "LGA" ? "Greater Metropolitan Region (GMR)" : "Postcode";
  let headerRow = null;
  for (let r = 1; r <= 20; r++) {
    if (String(ws.getRow(r).getCell(1).value ?? "").trim() === expectFirst) { headerRow = r; break; }
  }
  if (headerRow === null) fail(`${quarter}/${sheetName}: header row not found (looked for '${expectFirst}' in the first 20 rows)`);

  const rows = [];
  const suppressed = { s: 0, dash: 0 };
  const parseNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    if (v === "s") { suppressed.s++; return null; }
    if (v === "-") { suppressed.dash++; return null; }
    const n = typeof v === "number" ? v : Number(String(v).replaceAll(",", ""));
    return Number.isFinite(n) ? n : null;
  };
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    if (geoType === "LGA") {
      // Same redundant-grouping issue found in the pilot build: keep only
      // the ungrouped Total/Total/Total row for each LGA.
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

console.log("\nParsing LGA + Postcode sheets per quarter — FULL STATE (no geography filter):");
let totalRows = 0;
for (const e of entries) {
  const filePath = rel("warehouse", "data", "raw", "nsw_rents", `${e.quarter}.xlsx`);
  const inv = inventory.files.find((f) => f.quarter === e.quarter);
  const lga = await parseSheet(filePath, "LGA", e.quarter, 4, "LGA");
  const poa = await parseSheet(filePath, "Postcode", e.quarter, 1, "POA");
  totalRows += lga.rows.length + poa.rows.length;

  const insertBatch = async (rowsIn) => {
    for (let i = 0; i < rowsIn.length; i += 500) {
      const slice = rowsIn.slice(i, i + 500);
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
  await insertBatch(lga.rows);
  await insertBatch(poa.rows);
  console.log(`  ${e.quarter}: LGA ${lga.rows.length} rows, POA ${poa.rows.length} rows (suppressed: LGA s=${lga.suppressed.s}/-=${lga.suppressed.dash}, POA s=${poa.suppressed.s}/-=${poa.suppressed.dash})`);
}
console.log(`\nTotal parsed: ${totalRows} rows across all sheets (full state, no filter)`);

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
await run(`
  update nsw_rent_raw set reference_period = case
    when quarter like '%-03' then make_date(cast(split_part(quarter,'-',1) as integer), 1, 1)
    when quarter like '%-06' then make_date(cast(split_part(quarter,'-',1) as integer), 4, 1)
    when quarter like '%-09' then make_date(cast(split_part(quarter,'-',1) as integer), 7, 1)
    when quarter like '%-12' then make_date(cast(split_part(quarter,'-',1) as integer), 10, 1)
  end`);

const [dtCounts] = [await db.runAndReadAll("select dwelling_type, count(*)::int n from nsw_rent_raw group by 1 order by 1")];
console.log("\nDwelling type classification:", dtCounts.getRowObjects().map((r) => `${r.dwelling_type}=${Number(r.n)}`).join(", "));

// ── 4. Geography join — ALL NSW LGAs + national POA lookup ───────────────

await run(`alter table nsw_rent_raw add column lga_geography_id varchar; alter table nsw_rent_raw add column lga_geography_code varchar;`);
await run(`alter table nsw_rent_raw add column poa_geography_id varchar; alter table nsw_rent_raw add column poa_geography_code varchar;`);
{
  const lgaParams = [];
  for (const [name, r] of lgaByName) lgaParams.push(`('${name.replaceAll("'", "''")}', 'LGA_${r.geography_code}_ASGS3_2021', '${r.geography_code}')`);
  await db.run(`create temp table lga_lookup(name varchar, gid varchar, code varchar); insert into lga_lookup values ${lgaParams.join(",")};`);
  await run(`
    update nsw_rent_raw t set lga_geography_id = l.gid, lga_geography_code = l.code
    from lga_lookup l where t.geo_type='LGA' and t.geo_raw = l.name`);

  const poaParams = [];
  for (const [code, r] of poaByCode) poaParams.push(`('${code}', 'POA_${r.geography_code}_ASGS3_2021', '${r.geography_code}')`);
  await db.run(`create temp table poa_lookup(code varchar, gid varchar, geocode varchar); insert into poa_lookup values ${poaParams.join(",")};`);
  await run(`
    update nsw_rent_raw t set poa_geography_id = p.gid, poa_geography_code = p.geocode
    from poa_lookup p where t.geo_type='POA' and t.geo_raw = p.code`);
}
const [lgaMatched, lgaTotal] = await one(
  "select count(*) filter (lga_geography_id is not null), count(*) from nsw_rent_raw where geo_type='LGA'"
);
const [poaMatched, poaTotal] = await one(
  "select count(*) filter (poa_geography_id is not null), count(*) from nsw_rent_raw where geo_type='POA'"
);
console.log(`  LGA geography match: ${lgaMatched}/${lgaTotal}. POA geography match: ${poaMatched}/${poaTotal}`);

// ── 5. Curated summary (full history, all NSW geographies, local only) ───

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
    and bedroom_raw <> 'Not Specified'`);

const [summaryN] = await one("select count(*) from nsw_rental_summary");
console.log(`\nCurated summary rows (full state, local only): ${summaryN}`);

// ── 6. Parquet export ──────────────────────────────────────────────────

await run(`copy nsw_rental_summary to '${posix(path.join(LOCAL_DIR, "nsw_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal NSW rents store built, FULL STATE (all gitignored):");
console.log(`  warehouse/data/local/nsw_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/nsw_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_nsw_rents_full_state_local_store.mjs.");
