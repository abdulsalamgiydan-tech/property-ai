#!/usr/bin/env node
/**
 * Queensland rental market local store builder (Sprint 11, Workstream 6).
 *
 * Single RTA (Residential Tenancies Authority) "Bond statistics data"
 * workbook, one stable URL, no bot protection. Three geography grains each
 * with a matching pair of sheets (median rent + new-bond count), quarters
 * aligned column-for-column across the pair so rent and count join by
 * position: suburb (sheets 4/5), LGA (sheets 7/8), postcode (sheets 1/2).
 *
 * Suburb-name collisions: 3 suburb names (Newtown, The Gap, West End) each
 * appear twice in the RTA file with a postcode suffix distinguishing two
 * real, different ASGS suburbs (e.g. "Newtown (4305)" vs "Newtown (4350)").
 * Stripping the suffix intentionally leaves both rows resolving to the same
 * normalised name; the existing multi-candidate ASGS lookup then correctly
 * marks both as unresolved (never fabricates which postcode is which SAL).
 *
 * LGA names carry a classification suffix (e.g. "Banana (S)", "Brisbane
 * (C)", "Central Highlands (R) (Qld)") stripped via a repeated trailing-
 * paren strip (VIC's adapter only stripped one group; QLD needs the loop
 * for the double-suffix case).
 *
 * RTA only reports 43 of QLD's 78 ASGS LGAs (remaining LGAs presumably below
 * RTA's own reporting threshold) — an honest source coverage gap, not an
 * adapter defect.
 *
 * The bonds sheets carry an extra "Other" dwelling category and an "All
 * dwellings" aggregate that the rent sheets never publish a median for (rent
 * sheets only break out Flat/House/Townhouse by bedroom count) — both are
 * mapped to an explicit dwelling_type ("other" / "all") rather than left
 * null, and any future unrecognised label now throws instead of silently
 * dropping into an unlabelled row.
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

const RAW_FILE = rel("warehouse", "data", "raw", "qld_rents", "rta-bond-statistics.xlsx");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "qld_rents.duckdb");

if (!fs.existsSync(RAW_FILE)) {
  console.error(`ERROR: missing ${RAW_FILE}`);
  process.exit(1);
}

const QLD_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "qld_all_sals.json"), "utf8"));
const QLD_LGAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "qld_all_lgas.json"), "utf8"));

function normName(s) {
  let out = s.toUpperCase().trim();
  // Loop-strip trailing paren groups: "Central Highlands (R) (Qld)" -> "CENTRAL HIGHLANDS"
  while (/\s*\([^)]*\)\s*$/.test(out)) out = out.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return out;
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
  const norm = normName(raw);
  const cands = lookup.byNorm.get(norm);
  if (cands && cands.length === 1) {
    const r = cands[0];
    return { geography_id: `${lookup.prefix}_${r.geography_code}_ASGS3_2021`, geography_code: r.geography_code, geography_name: r.geography_name, geography_confidence: "alias" };
  }
  return { geography_id: null, geography_code: null, geography_name: null, geography_confidence: "unresolved" };
}
const salLookup = buildLookup(QLD_SALS, "SAL");
const lgaLookup = buildLookup(QLD_LGAS, "LGA");

function parseDwelling(label) {
  if (label === "All dwellings") return { dwelling_type: "all", bedroom_count: null };
  // "Other" appears only in the *-new-bonds sheets (bond-count grain has no
  // matching rent sheet category) — never silently merge it into null.
  if (label === "Other") return { dwelling_type: "other", bedroom_count: null };
  const m = /^(Flat|House|Townhouse)\s+(\d+)$/.exec(label || "");
  if (!m) throw new Error(`unrecognised dwelling label: ${JSON.stringify(label)}`);
  const type = m[1] === "Flat" ? "apartment_unit" : m[1] === "House" ? "detached_house" : "townhouse";
  return { dwelling_type: type, bedroom_count: Number(m[2]) };
}

function parseQuarterHeaders(ws) {
  const row6 = ws.getRow(6), row7 = ws.getRow(7);
  const quarters = [];
  const monthMap = { Mar: "01", Jun: "04", Sep: "07", Dec: "10" };
  for (let c = 5; c <= ws.columnCount; c++) {
    const mon = row6.getCell(c).value;
    const yr = row7.getCell(c).value;
    if (!mon || !yr) continue;
    const mm = monthMap[String(mon).trim()];
    if (!mm) continue;
    quarters.push({ col: c, reference_period: `${yr}-${mm}-01` });
  }
  return quarters;
}
function parseVal(v) {
  if (v === null || v === undefined || v === "" || v === "-") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function extractSheet(ws, geoField) {
  const quarters = parseQuarterHeaders(ws);
  const out = new Map(); // key: geo|dwelling|period -> value
  for (let r = 9; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const geoRaw = row.getCell(3).value;
    const dwellingRaw = row.getCell(4).value;
    if (geoRaw === null || geoRaw === undefined || !dwellingRaw) continue;
    const geoKey = geoField === "postcode" ? String(geoRaw).trim() : String(geoRaw).trim();
    for (const q of quarters) {
      const val = parseVal(row.getCell(q.col).value);
      if (val === null) continue;
      out.set(`${geoKey}|${dwellingRaw}|${q.reference_period}`, val);
    }
  }
  return out;
}

async function buildGrain(wb, rentSheetName, bondsSheetName, geographyType, geoField, lookup, sourceId, datasetId) {
  const rentWs = wb.worksheets.find((s) => s.name.trim() === rentSheetName.trim());
  const bondsWs = wb.worksheets.find((s) => s.name.trim() === bondsSheetName.trim());
  if (!rentWs) throw new Error(`missing sheet: ${rentSheetName}`);
  if (!bondsWs) throw new Error(`missing sheet: ${bondsSheetName}`);

  const rentMap = await extractSheet(rentWs, geoField);
  const bondsMap = await extractSheet(bondsWs, geoField);

  const rows = [];
  const retrievedAt = new Date().toISOString();
  const geoDwellQuarters = new Set([...rentMap.keys(), ...bondsMap.keys()]);
  for (const key of geoDwellQuarters) {
    const [geoRaw, dwellingRaw, referencePeriod] = key.split("|");
    const median = rentMap.get(key) ?? null;
    const count = bondsMap.get(key) ?? null;
    if (median === null && count === null) continue;
    const { dwelling_type, bedroom_count } = parseDwelling(dwellingRaw);

    let geo;
    if (geoField === "postcode") {
      geo = { geography_id: `POA_${geoRaw}_ASGS3_2021`, geography_code: geoRaw, geography_name: geoRaw, geography_confidence: "direct" };
    } else {
      geo = resolve(lookup, geoRaw);
    }

    rows.push({
      jurisdiction: "QLD",
      geography_type: geographyType,
      geography_id: geo.geography_id,
      geography_code: geo.geography_code,
      geography_name: geo.geography_name,
      geography_confidence: geo.geography_confidence,
      locality_raw: geoRaw,
      dwelling_type,
      bedroom_count,
      reference_period: referencePeriod,
      median_weekly_rent: median,
      new_bond_count: count,
      direct_or_derived: "direct",
      confidence_label: count === null ? "insufficient" : count >= 30 ? "high" : count >= 10 ? "medium" : count >= 5 ? "low" : "insufficient",
      source_id: sourceId,
      dataset_id: datasetId,
      retrieved_at: retrievedAt,
    });
  }
  return rows;
}

console.log("build_qld_rents_local_store — QLD RTA bond statistics, triple grain (suburb + LGA + postcode), local-first");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(RAW_FILE);

const salRows = await buildGrain(wb, "4 sub-rents", "5 sub-new-bonds", "SAL", "suburb", salLookup, "qld_rent", "qld_rta_bond_statistics_suburb");
console.log(`  suburb-grain: ${salRows.length} rows`);
const lgaRows = await buildGrain(wb, "7 lga-rents", "8 lga-new-bonds", "LGA", "lga", lgaLookup, "qld_rent", "qld_rta_bond_statistics_lga");
console.log(`  LGA-grain: ${lgaRows.length} rows`);
const poaRows = await buildGrain(wb, "1 pc-rents", "2 pc-new-bonds", "POA", "postcode", null, "qld_rent", "qld_rta_bond_statistics_postcode");
console.log(`  postcode-grain: ${poaRows.length} rows`);

const allRows = [...salRows, ...lgaRows, ...poaRows];
console.log(`Total qld_rental_summary rows: ${allRows.length}`);

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}

await run(`
  create table qld_rental_summary (
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
    new_bond_count integer,
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
        `(${sqlStr(r.jurisdiction)},${sqlStr(r.geography_type)},${sqlStr(r.geography_id)},${sqlStr(r.geography_code)},${sqlStr(r.geography_name)},${sqlStr(r.geography_confidence)},${sqlStr(r.locality_raw)},${sqlStr(r.dwelling_type)},${sqlNum(r.bedroom_count)},${sqlStr(r.reference_period)}::date,${sqlNum(r.median_weekly_rent)},${sqlNum(r.new_bond_count)},${sqlStr(r.direct_or_derived)},${sqlStr(r.confidence_label)},${sqlStr(r.source_id)},${sqlStr(r.dataset_id)},${sqlStr(r.retrieved_at)}::timestamp)`
    )
    .join(",");
  await run(`insert into qld_rental_summary values ${values}`);
}

await run(`copy qld_rental_summary to '${posix(path.join(LOCAL_DIR, "qld_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const buf = fs.readFileSync(RAW_FILE);
const inventory = [{ file: path.basename(RAW_FILE), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") }];
fs.writeFileSync(rel("warehouse", "reports", "qld_rents_download_inventory.json"), JSON.stringify({ generated_at: new Date().toISOString(), files: inventory }, null, 2));

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal QLD rents store built (gitignored):");
console.log(`  warehouse/data/local/qld_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/qld_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "qld_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_qld_rents_local_store.mjs.");
