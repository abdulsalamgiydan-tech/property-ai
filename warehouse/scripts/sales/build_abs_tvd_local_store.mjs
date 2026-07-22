#!/usr/bin/env node
/**
 * ABS Total Value of Dwellings — local store builder (Sprint 12, Workstream 2).
 *
 * Parses the verified xlsx (see download_abs_tvd_source.mjs) and extracts
 * only the 4 series families relevant to TAS/NT/ACT — median price and
 * transfer count, for established houses and attached dwellings, at
 * "capital city" / "rest of state" grain — mapping each to the exact
 * ASGS GCCSA geography this project already has loaded:
 *   Hobart -> Greater Hobart, Rest of Tas. -> Rest of Tas.,
 *   Darwin -> Greater Darwin, Rest of NT -> Rest of NT,
 *   Canberra -> Australian Capital Territory (no "rest of ACT" split
 *   published — ACT has no meaningful area outside the Canberra GCCSA).
 *
 * "Attached dwelling" is ABS's own bundled category (units + townhouses +
 * semis together) — it does NOT reuse this project's apartment_unit
 * dwelling_type, which specifically means units/apartments elsewhere in
 * the warehouse. Mapped to a distinct dwelling_type, attached_dwelling,
 * so it's never confused with the finer-grained NSW/VIC categories.
 *
 * Local-only. Writes a local JSON store + a committed report. No branch
 * connection.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const XLSX_PATH = rel("warehouse", "data", "raw", "abs_total_value_dwellings", "643202_table2_median_price_transfers_mar_qtr_2026.xlsx");
const LOCAL_STORE_PATH = rel("warehouse", "data", "local", "abs_tvd_tas_act_nt.json");

// ABS column label fragment -> { geography_id, gccsa_name } (this project's ASGS GCCSA rows, confirmed live)
const GCCSA_MAP = {
  "Hobart": { geography_id: "GCCSA_6GHOB_ASGS3_2021", geography_code: "6GHOB", geography_name: "Greater Hobart", state_code: "6" },
  "Rest of Tas.": { geography_id: "GCCSA_6RTAS_ASGS3_2021", geography_code: "6RTAS", geography_name: "Rest of Tas.", state_code: "6" },
  "Darwin": { geography_id: "GCCSA_7GDAR_ASGS3_2021", geography_code: "7GDAR", geography_name: "Greater Darwin", state_code: "7" },
  "Rest of NT": { geography_id: "GCCSA_7RNTE_ASGS3_2021", geography_code: "7RNTE", geography_name: "Rest of NT", state_code: "7" },
  "Canberra": { geography_id: "GCCSA_8ACTE_ASGS3_2021", geography_code: "8ACTE", geography_name: "Australian Capital Territory", state_code: "8" },
};

function sampleSizeConfidence(count) {
  if (count === null || count === undefined) return null;
  if (count >= 30) return "high";
  if (count >= 10) return "medium";
  if (count >= 5) return "low";
  return "insufficient";
}

function parseHeader(label) {
  // e.g. "Median Price of Established House Transfers (Unstratified) ;  Hobart ;"
  //      "Number of Attached Dwelling Transfers ;  Rest of NT ;"
  const isPrice = label.startsWith("Median Price");
  const isHouse = label.includes("Established House");
  const dwelling_type = isHouse ? "detached_house" : "attached_dwelling";
  const metric = isPrice ? "median_price" : "transfer_count";
  const geoPart = label.split(";")[1]?.trim();
  const geo = GCCSA_MAP[geoPart];
  if (!geo) return null; // not TAS/NT/ACT — every other state's column, skip
  return { metric, dwelling_type, geo };
}

console.log(`Reading ${XLSX_PATH} ...`);
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX_PATH);
const sheet = wb.getWorksheet("Data1");
if (!sheet) throw new Error("Data1 sheet not found — xlsx structure has changed since this script was written");

const headerRow = sheet.getRow(1);
const columns = [];
for (let c = 2; c <= sheet.columnCount; c++) {
  const label = headerRow.getCell(c).text;
  const parsed = parseHeader(label);
  if (parsed) columns.push({ col: c, ...parsed });
}
console.log(`Found ${columns.length} relevant series (expect 20: 5 geographies x 2 dwelling types x 2 metrics)`);

// Row 11 onward is data (row 1 header, rows 2-10 metadata, confirmed by inspection)
const DATA_START_ROW = 11;
const points = []; // { geo, dwelling_type, reference_period, median_price, transfer_count }
const byGeoDwellingPeriod = new Map();

for (let r = DATA_START_ROW; r <= sheet.rowCount; r++) {
  const row = sheet.getRow(r);
  const dateCell = row.getCell(1);
  if (!dateCell.value) continue;
  const date = new Date(dateCell.value);
  if (Number.isNaN(date.getTime())) continue;
  const referencePeriod = date.toISOString().slice(0, 10);

  for (const { col, metric, dwelling_type, geo } of columns) {
    const raw = row.getCell(col).value;
    if (raw === null || raw === undefined || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(value)) continue;

    const key = `${geo.geography_id}|${dwelling_type}|${referencePeriod}`;
    if (!byGeoDwellingPeriod.has(key)) {
      byGeoDwellingPeriod.set(key, { geo, dwelling_type, reference_period: referencePeriod, median_price: null, transfer_count: null });
    }
    const entry = byGeoDwellingPeriod.get(key);
    if (metric === "median_price") entry.median_price = value * 1000; // source unit is $'000
    else entry.transfer_count = Math.round(value);
  }
}

for (const entry of byGeoDwellingPeriod.values()) points.push(entry);
points.sort((a, b) => a.geo.geography_id.localeCompare(b.geo.geography_id) || a.dwelling_type.localeCompare(b.dwelling_type) || a.reference_period.localeCompare(b.reference_period));

const withPriceOnly = points.filter((p) => p.median_price !== null && p.transfer_count === null);
const withCountOnly = points.filter((p) => p.median_price === null && p.transfer_count !== null);
const withBoth = points.filter((p) => p.median_price !== null && p.transfer_count !== null);

console.log(`${points.length} geo/dwelling/period rows: ${withBoth.length} with both price+count, ${withPriceOnly.length} price-only, ${withCountOnly.length} count-only`);

const byGeography = {};
for (const geoKey of Object.keys(GCCSA_MAP)) {
  const geo = GCCSA_MAP[geoKey];
  const rowsForGeo = points.filter((p) => p.geo.geography_id === geo.geography_id);
  byGeography[geo.geography_name] = {
    geography_id: geo.geography_id,
    row_count: rowsForGeo.length,
    earliest_period: rowsForGeo.length ? rowsForGeo.reduce((min, p) => (p.reference_period < min ? p.reference_period : min), rowsForGeo[0].reference_period) : null,
    latest_period: rowsForGeo.length ? rowsForGeo.reduce((max, p) => (p.reference_period > max ? p.reference_period : max), rowsForGeo[0].reference_period) : null,
  };
}

const store = {
  generated_at: new Date().toISOString(),
  source: {
    catalogue_number: "6432.0",
    publication: "Total Value of Dwellings",
    table: "Table 2. Median Price and Number of Transfers (Capital City and Rest of State)",
    reference_period: "March Quarter 2026",
    predecessor_note: "Previously published under 6432.0 'Residential Property Price Indexes: Eight Capital Cities', which ceased with the December quarter 2021 issue.",
  },
  method: "Quarterly time series, GCCSA grain (capital city vs rest of state), median price ($'000 source unit converted to whole dollars) and transfer count, established house and attached dwelling separately. Only TAS/NT/ACT columns extracted (this project has better SAL/POA-grain sources for the other 5 states).",
  points: points.map((p) => ({
    geography_id: p.geo.geography_id,
    geography_code: p.geo.geography_code,
    geography_name: p.geo.geography_name,
    state_code: p.geo.state_code,
    dwelling_type: p.dwelling_type,
    reference_period: p.reference_period,
    median_price: p.median_price,
    transfer_count: p.transfer_count,
    sample_size_confidence: sampleSizeConfidence(p.transfer_count),
  })),
  summary_by_geography: byGeography,
};

fs.mkdirSync(path.dirname(LOCAL_STORE_PATH), { recursive: true });
fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));

const report = {
  generated_at: store.generated_at,
  local_store: "warehouse/data/local/abs_tvd_tas_act_nt.json (gitignored)",
  total_points: points.length,
  points_with_both_price_and_count: withBoth.length,
  points_with_price_only: withPriceOnly.length,
  points_with_count_only: withCountOnly.length,
  summary_by_geography: byGeography,
};
fs.writeFileSync(rel("warehouse", "reports", "abs_tvd_local_store_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Wrote warehouse/data/local/abs_tvd_tas_act_nt.json (local, gitignored)");
console.log("Wrote warehouse/reports/abs_tvd_local_store_report.json");
