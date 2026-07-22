#!/usr/bin/env node
/**
 * ABS Building Activity — dwelling commencements/completions local build
 * (Sprint 12, Workstream 3).
 *
 * Parses tables 36 (commencements) and 39 (completions) from
 * "Building Activity, Australia" (cat. 8752.0), Original series, state/
 * territory grain. Extracts only "Total Sectors" (private+public
 * combined) x "Houses"/"Total Other Residential" x "New" — deliberately
 * excludes "Dwellings excluding new residential" (alterations, not new
 * stock) and the redundant "Total (Type of Building)" aggregate rows, and
 * excludes the "Australia" national-total column (a derivable aggregate
 * of the 8 states, not a distinct geography — this project stores the
 * finest real geography and lets aggregates be computed at query time).
 *
 * "Total Other Residential" maps to dwelling_type='attached_dwelling'
 * (the same ABS-bundled units+townhouses+semis category introduced in
 * Sprint 12 WS2 for the Total Value of Dwellings source) — not
 * apartment_unit, which means something narrower elsewhere in this
 * warehouse.
 *
 * Local-only. Writes a local JSON store + a committed report.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const RAW_DIR = rel("warehouse", "data", "raw", "abs_building_activity");
const LOCAL_STORE_PATH = rel("warehouse", "data", "local", "dwelling_construction_activity.json");

const STATE_NAME_TO_CODE = {
  "New South Wales": "1",
  Victoria: "2",
  Queensland: "3",
  "South Australia": "4",
  "Western Australia": "5",
  Tasmania: "6",
  "Northern Territory": "7",
  "Australian Capital Territory": "8",
};

function parseHeader(label) {
  // e.g. "Dwelling units commenced ;  Total Sectors ;  Houses ;  New ;  New South Wales ;"
  const parts = label.split(";").map((s) => s.trim());
  const [, sector, buildingType, typeOfWork, stateName] = parts;
  if (sector !== "Total Sectors") return null;
  if (typeOfWork !== "New") return null;
  if (!STATE_NAME_TO_CODE[stateName]) return null; // excludes "Australia" national total
  let dwelling_type;
  if (buildingType === "Houses") dwelling_type = "detached_house";
  else if (buildingType === "Total Other Residential") dwelling_type = "attached_dwelling";
  else return null; // excludes "Dwellings excluding new residential" and "Total (Type of Building)"
  return { dwelling_type, state_code: STATE_NAME_TO_CODE[stateName] };
}

async function extractTable(filePath, stage) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.getWorksheet("Data1");
  const headerRow = sheet.getRow(1);
  const columns = [];
  for (let c = 2; c <= sheet.columnCount; c++) {
    const parsed = parseHeader(headerRow.getCell(c).text);
    if (parsed) columns.push({ col: c, ...parsed });
  }
  const points = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const dateCell = row.getCell(1);
    if (!dateCell.value) continue;
    const date = new Date(dateCell.value);
    if (Number.isNaN(date.getTime())) continue;
    const reference_period = date.toISOString().slice(0, 10);
    for (const { col, dwelling_type, state_code } of columns) {
      const raw = row.getCell(col).value;
      if (raw === null || raw === undefined || raw === "") continue;
      const unit_count = typeof raw === "number" ? Math.round(raw) : Math.round(Number(raw));
      if (!Number.isFinite(unit_count)) continue;
      points.push({ state_code, dwelling_type, stage, reference_period, unit_count });
    }
  }
  return { points, columns_matched: columns.length };
}

console.log("build_dwelling_construction_activity_local_store — ABS Building Activity, states/territories, Original series");

const commenced = await extractTable(path.join(RAW_DIR, "table36.xlsx"), "commenced");
const completed = await extractTable(path.join(RAW_DIR, "table39.xlsx"), "completed");
console.log(`  table36 (commenced): ${commenced.columns_matched} columns matched (expect 16: 8 states x 2 dwelling types), ${commenced.points.length} data points`);
console.log(`  table39 (completed): ${completed.columns_matched} columns matched, ${completed.points.length} data points`);

const allPoints = [...commenced.points, ...completed.points];

// Sanity check: negative counts, implausible jumps
const negative = allPoints.filter((p) => p.unit_count < 0);
if (negative.length > 0) {
  console.error(`ERROR: ${negative.length} negative unit_count values found — refusing to proceed`);
  process.exit(1);
}

const byState = {};
for (const p of allPoints) {
  byState[p.state_code] ??= { commenced: 0, completed: 0, earliest: null, latest: null };
  byState[p.state_code][p.stage === "commenced" ? "commenced" : "completed"] += 1;
  if (!byState[p.state_code].earliest || p.reference_period < byState[p.state_code].earliest) byState[p.state_code].earliest = p.reference_period;
  if (!byState[p.state_code].latest || p.reference_period > byState[p.state_code].latest) byState[p.state_code].latest = p.reference_period;
}

const store = {
  generated_at: new Date().toISOString(),
  source: {
    catalogue_number: "8752.0",
    publication: "Building Activity, Australia",
    tables: ["Table 36: Number of Dwelling Unit Commencements by Sector, States and Territories: Original", "Table 39: Number of Dwelling Unit Completions by Sector, States and Territories: Original"],
    reference_period: "March 2026 quarter",
  },
  method: "Total Sectors (private+public), New work only, Houses->detached_house and Total Other Residential->attached_dwelling, per state/territory. Excludes alterations, the redundant Total-Type-of-Building rows, and the Australia national-total column (derivable, not a distinct geography).",
  points: allPoints,
  summary_by_state: byState,
};
fs.mkdirSync(path.dirname(LOCAL_STORE_PATH), { recursive: true });
fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));

const report = {
  generated_at: store.generated_at,
  local_store: "warehouse/data/local/dwelling_construction_activity.json (gitignored)",
  total_points: allPoints.length,
  commenced_points: commenced.points.length,
  completed_points: completed.points.length,
  summary_by_state: byState,
};
fs.writeFileSync(rel("warehouse", "reports", "dwelling_construction_activity_local_build_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("Wrote warehouse/data/local/dwelling_construction_activity.json (local, gitignored)");
console.log("Wrote warehouse/reports/dwelling_construction_activity_local_build_report.json");
