#!/usr/bin/env node
/**
 * South Australia rental market local store builder (Sprint 11, Workstream 6).
 *
 * SA Housing Trust "Private Rent Report", one CKAN resource per quarter
 * (data.sa.gov.au, 71 resources 2008-06..2026-03 downloaded in full by
 * download_sa_rents.mjs). The workbook format has THREE incompatible eras
 * over that span:
 *   - 2008-06..2012-06 (17 files): legacy binary .xls (OLE2 compound
 *     document), not parseable by exceljs. Downloaded, not parsed.
 *   - 2012-09..2020-06 (32 files): modern xlsx, sheets named "Final
 *     Suburbs"/"Final PC"/"Final Region"/"Final SLA" (or unprefixed
 *     variants), 30-column pivot layout.
 *   - 2020-12..2024-06 (15 files): modern xlsx, sheets renamed "Suburb"/
 *     "PC"/"Region"/"SLA", 31-column pivot layout (one extra column vs the
 *     current era).
 *   - 2024-09..2026-03 (7 files, THIS SCRIPT'S SCOPE): current 27-column
 *     pivot layout — "Row Labels" always at row 15, columns 2-9 = Flats/
 *     Units by bedroom (1/2/3/4+) as Count/Median pairs, 10-11 = Flats/
 *     Units dwelling-type total, 12-19 = Houses by bedroom, 20-21 = Houses
 *     dwelling-type total, 22-23 = Other/Unknown ("Not Applicable"
 *     bedroom), 24-25 = Other/Unknown total (duplicate of 22-23, single
 *     bedroom category), 26-27 = grand Total across all dwelling types.
 *
 * Rather than fabricate a parser across three incompatible pivot layouts in
 * one pass, this script covers only the current, verified-stable era (7
 * quarters, Sep 2024 - Mar 2026). The other 47 files remain on disk
 * (gitignored) for a future extension once each earlier layout has been
 * independently verified — same "don't guess across format drift"
 * discipline already applied to the legacy .xls files above.
 *
 * 3 of 258 postcodes (5118, 5153, 5172) appear TWICE per quarter in the PC
 * sheet with different values each time — almost certainly a Metro/Country
 * boundary split with no distinguishing label in this pivot layout. All
 * rows for a duplicated raw label are quarantined (geography_confidence=
 * 'unresolved') rather than guessing which occurrence is which.
 *
 * Grain: Suburb (SAL) and Postcode (PC/POA) only. Region and SLA sheets are
 * present in the source but out of scope this pass (Region is SA
 * Government's own non-ASGS regions; SLA is a pre-2011 ASGS geography
 * needing its own correspondence, same category of work already reserved
 * for Workstream 9 via the WS4 correspondence files).
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

const RAW_DIR = rel("warehouse", "data", "raw", "sa_rents");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "sa_rents.duckdb");

const CURRENT_ERA_PERIODS = ["2024-09", "2024-12", "2025-03", "2025-06", "2025-09", "2025-12", "2026-03"];

const SA_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "sa_all_sals.json"), "utf8"));

function normName(s) {
  let out = s.toUpperCase().trim();
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
const salLookup = buildLookup(SA_SALS, "SAL");

const EXCLUDE_LABELS = new Set(["METRO", "COUNTRY", "COUNTRY TOTAL", "METRO TOTAL", "GRAND TOTAL"]);

// Column map: [dwelling_type, bedroom_count, countCol, medianCol]
const COLUMN_MAP = [
  ["apartment_unit", 1, 2, 3],
  ["apartment_unit", 2, 4, 5],
  ["apartment_unit", 3, 6, 7],
  ["apartment_unit", 4, 8, 9],
  ["apartment_unit", null, 10, 11], // Flats/Units dwelling-type total
  ["detached_house", 1, 12, 13],
  ["detached_house", 2, 14, 15],
  ["detached_house", 3, 16, 17],
  ["detached_house", 4, 18, 19],
  ["detached_house", null, 20, 21], // Houses dwelling-type total
  ["other", null, 22, 23],
  ["all", null, 26, 27], // grand total across all dwelling types
];

function parseVal(v) {
  if (v === null || v === undefined || v === "" || v === "*") return null; // "*" = suppressed (1-5 dwellings), never fabricated
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function extractSheet(ws, referencePeriod, geographyType, geoField, lookup, sourceId, datasetId, retrievedAt) {
  // Anchor on the "Metro" section-header row rather than the "Row Labels"
  // header text — the latter is sometimes blank in the source (confirmed:
  // 2025-06 PC sheet has an empty A15), while "Metro" is present in every
  // quarter's Suburb and PC sheet at a consistent row.
  let metroRow = -1;
  for (let r = 1; r <= 20; r++) {
    if (ws.getRow(r).getCell(1).value === "Metro") {
      metroRow = r;
      break;
    }
  }
  if (metroRow === -1) throw new Error(`"Metro" section header not found in sheet "${ws.name}" for ${referencePeriod}`);

  // First pass: count raw-label occurrences in this sheet. A small number
  // of postcodes (verified: 3 of 258, e.g. "5153") appear TWICE per quarter
  // in the PC sheet with genuinely different values — almost certainly a
  // Metro/Country boundary split the source pivot doesn't otherwise label.
  // Rather than silently pick one occurrence (fabricating which is
  // "correct") or sum them (fabricating a combined figure the source never
  // published), every row for a duplicated label is quarantined as
  // unresolved.
  const labelCounts = new Map();
  for (let r = metroRow; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).getCell(1).value;
    if (v === null || v === undefined || v === "") continue;
    const label = String(v).trim();
    if (EXCLUDE_LABELS.has(label.toUpperCase())) continue;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }

  const rows = [];
  for (let r = metroRow; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const labelRaw = row.getCell(1).value;
    if (labelRaw === null || labelRaw === undefined || labelRaw === "") continue;
    const label = String(labelRaw).trim(); // postcode labels are numeric cells, not strings
    if (EXCLUDE_LABELS.has(label.toUpperCase())) continue;

    let geo;
    if (labelCounts.get(label) > 1) {
      geo = { geography_id: null, geography_code: null, geography_name: null, geography_confidence: "unresolved" };
    } else if (geoField === "postcode") {
      geo = { geography_id: `POA_${label}_ASGS3_2021`, geography_code: label, geography_name: label, geography_confidence: "direct" };
    } else {
      geo = resolve(lookup, label);
    }

    for (const [dwelling_type, bedroom_count, countCol, medianCol] of COLUMN_MAP) {
      const count = parseVal(row.getCell(countCol).value);
      const median = parseVal(row.getCell(medianCol).value);
      if (count === null && median === null) continue; // suppressed or genuinely zero bonds that quarter — never fabricated

      rows.push({
        jurisdiction: "SA",
        geography_type: geographyType,
        geography_id: geo.geography_id,
        geography_code: geo.geography_code,
        geography_name: geo.geography_name,
        geography_confidence: geo.geography_confidence,
        locality_raw: label,
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
  }
  return rows;
}

function quarterStartDate(period) {
  // period is "YYYY-MM" where MM is the quarter END month (03/06/09/12);
  // reference_period is stored as the quarter start date for consistency
  // with the QLD/VIC adapters' convention.
  const [y, m] = period.split("-").map(Number);
  if (m === 3) return `${y}-01-01`;
  if (m === 6) return `${y}-04-01`;
  if (m === 9) return `${y}-07-01`;
  if (m === 12) return `${y}-10-01`;
  throw new Error(`unexpected month in period ${period}`);
}

console.log("build_sa_rents_local_store — SA Housing Trust Private Rent Report, current-era (2024-09..2026-03), suburb + postcode grain, local-first");

const allRows = [];
for (const period of CURRENT_ERA_PERIODS) {
  const file = path.join(RAW_DIR, `private-rental-report-${period}.xlsx`);
  if (!fs.existsSync(file)) throw new Error(`missing raw file for ${period}: ${file}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const retrievedAt = new Date().toISOString();
  const referencePeriod = quarterStartDate(period);

  const suburbWs = wb.worksheets.find((s) => s.name === "Suburb");
  const pcWs = wb.worksheets.find((s) => s.name === "PC");
  if (!suburbWs || !pcWs) throw new Error(`missing expected sheet names in ${period} (found: ${wb.worksheets.map((s) => s.name).join(",")})`);

  const salRows = await extractSheet(suburbWs, referencePeriod, "SAL", "suburb", salLookup, "sa_rent", "sa_private_rent_report_suburb", retrievedAt);
  const pcRows = await extractSheet(pcWs, referencePeriod, "POA", "postcode", null, "sa_rent", "sa_private_rent_report_postcode", retrievedAt);
  allRows.push(...salRows, ...pcRows);
  console.log(`  ${period}: suburb=${salRows.length} postcode=${pcRows.length}`);
}
console.log(`Total sa_rental_summary rows: ${allRows.length}`);

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}

await run(`
  create table sa_rental_summary (
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
  await run(`insert into sa_rental_summary values ${values}`);
}

await run(`copy sa_rental_summary to '${posix(path.join(LOCAL_DIR, "sa_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const inventory = CURRENT_ERA_PERIODS.map((period) => {
  const p = path.join(RAW_DIR, `private-rental-report-${period}.xlsx`);
  const buf = fs.readFileSync(p);
  return { period, file: path.basename(p), bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
});
fs.writeFileSync(
  rel("warehouse", "reports", "sa_rents_parsed_inventory.json"),
  JSON.stringify({ generated_at: new Date().toISOString(), scope: "current-era files actually parsed by this script (subset of the 71 downloaded)", files: inventory }, null, 2)
);

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal SA rents store built (gitignored):");
console.log(`  warehouse/data/local/sa_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/sa_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "sa_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_sa_rents_local_store.mjs.");
