#!/usr/bin/env node
/**
 * National population-demand layer (Sprint 11, Workstream 5).
 *
 * Parses ABS Regional Population Table 1 (Estimated Resident Population,
 * SA2 grain, observed 2001-2025 — genuine ERP, never a projection) into a
 * local DuckDB store, and computes 1-year and 5-year population growth.
 *
 * Local-only. No Supabase connection made by this script. SA2-grain
 * promotion to the branch is deliberately deferred to Workstream 9 (which
 * owns the SA2/LGA canonical mart schema decisions) — this script's job
 * is to build and validate the local source of truth first.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const RAW_FILE = rel("warehouse", "data", "raw", "abs_regional_population", "32180DS0003_2001-25_SA2_population_2001_2025.xlsx");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "national_population.duckdb");

if (!fs.existsSync(RAW_FILE)) {
  console.error(`ERROR: missing ${RAW_FILE}`);
  process.exit(1);
}

console.log("build_national_population_layer — ABS Regional Population, SA2 grain, 2001-2025 (local-first, no Supabase)");

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(RAW_FILE);
const ws = wb.worksheets[1]; // "Table 1" — SA2 grain

// Row 5 holds the year for each "no." column starting at column 11.
const yearRow = ws.getRow(5);
const years = [];
for (let c = 11; c <= ws.columnCount; c++) {
  const y = yearRow.getCell(c).value;
  if (typeof y === "number" && y >= 2000 && y <= 2030) years.push({ col: c, year: y });
  else if (years.length > 0) break; // stop at the first gap after we've started
}
console.log(`  detected ${years.length} year columns: ${years[0]?.year}-${years[years.length - 1]?.year}`);

const rows = [];
for (let r = 7; r <= ws.rowCount; r++) {
  const row = ws.getRow(r);
  const sa2Code = row.getCell(9).value;
  const sa2Name = row.getCell(10).value;
  if (!sa2Code || typeof sa2Code !== "number") continue;
  const stCode = row.getCell(1).value;
  const stName = row.getCell(2).value;
  for (const { col, year } of years) {
    const pop = row.getCell(col).value;
    if (pop === null || pop === undefined || typeof pop !== "number") continue;
    rows.push({ sa2_code: String(sa2Code), sa2_name: sa2Name, state_code: String(stCode), state_name: stName, year, population: pop });
  }
}
console.log(`  parsed ${rows.length} (SA2 x year) population observations`);

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}
async function all(sql) {
  const reader = await db.runAndReadAll(sql);
  return reader.getRowObjects();
}
function bigintsToNumbers(rowsArr) {
  return rowsArr.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : v;
    return out;
  });
}

await run(`
  create table sa2_population_2001_2025 (
    sa2_code varchar, sa2_name varchar, state_code varchar, state_name varchar,
    year integer, population integer
  )
`);

function sqlStr(v) {
  return v === null || v === undefined ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
}
function sqlNum(v) {
  return v === null || v === undefined ? "NULL" : String(v);
}
const BATCH = 2000;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const values = batch
    .map((r) => `(${sqlStr(r.sa2_code)},${sqlStr(r.sa2_name)},${sqlStr(r.state_code)},${sqlStr(r.state_name)},${sqlNum(r.year)},${sqlNum(r.population)})`)
    .join(",");
  await run(`insert into sa2_population_2001_2025 values ${values}`);
}

// ── Derived: latest year, 1-year growth, 5-year annualised growth ────────
const latestYear = years[years.length - 1].year;
const prevYear = latestYear - 1;
const fiveYearAgo = latestYear - 5;

await run(`
  create table sa2_population_growth as
  with latest as (select sa2_code, sa2_name, state_code, population as pop_latest from sa2_population_2001_2025 where year = ${latestYear}),
  prev as (select sa2_code, population as pop_prev from sa2_population_2001_2025 where year = ${prevYear}),
  five_ago as (select sa2_code, population as pop_5y_ago from sa2_population_2001_2025 where year = ${fiveYearAgo})
  select l.sa2_code, l.sa2_name, l.state_code, l.pop_latest,
    p.pop_prev,
    case when p.pop_prev > 0 then round((l.pop_latest - p.pop_prev)::double / p.pop_prev * 100, 2) else null end as growth_1y_pct,
    f.pop_5y_ago,
    case when f.pop_5y_ago > 0 then round((pow(l.pop_latest::double / f.pop_5y_ago, 1.0/5) - 1) * 100, 2) else null end as growth_5y_annualised_pct
  from latest l
  left join prev p on p.sa2_code = l.sa2_code
  left join five_ago f on f.sa2_code = l.sa2_code
`);

const nationalTotalLatest = bigintsToNumbers(await all(`select sum(population) as total from sa2_population_2001_2025 where year = ${latestYear}`))[0].total;
const sa2Count = bigintsToNumbers(await all(`select count(distinct sa2_code) as n from sa2_population_2001_2025`))[0].n;
const growthRowCount = bigintsToNumbers(await all(`select count(*) as n from sa2_population_growth`))[0].n;

await run(`copy sa2_population_2001_2025 to '${posix(path.join(LOCAL_DIR, "sa2_population_2001_2025.parquet"))}' (format parquet, compression zstd)`);
await run(`copy sa2_population_growth to '${posix(path.join(LOCAL_DIR, "sa2_population_growth.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

console.log(`  ${sa2Count} distinct SA2 geographies, latest year ${latestYear} national total: ${nationalTotalLatest.toLocaleString()}`);
console.log(`  growth table: ${growthRowCount} rows`);

const report = {
  generated_at: new Date().toISOString(),
  source: "ABS Regional Population, Table 1 (Estimated resident population, Statistical Areas Level 2, Australia), 2001-2025",
  source_type: "observed Estimated Resident Population (ERP) — NOT a projection",
  geography_level: "SA2",
  years_covered: `${years[0].year}-${latestYear}`,
  distinct_sa2_geographies: sa2Count,
  national_total_population_latest_year: nationalTotalLatest,
  latest_year: latestYear,
  growth_computed: { one_year: `${prevYear} -> ${latestYear}`, five_year_annualised: `${fiveYearAgo} -> ${latestYear}` },
  local_storage: { duckdb: "warehouse/data/local/national_population.duckdb", parquet: ["sa2_population_2001_2025.parquet", "sa2_population_growth.parquet"] },
  branch_promotion_status: "NOT YET PROMOTED — deferred to Workstream 9, which owns the SA2/LGA canonical mart schema decisions. This is the validated local source of truth ready for that promotion.",
};
fs.writeFileSync(rel("warehouse", "reports", "national_population_layer_local_build.json"), JSON.stringify(report, null, 2));
console.log("\nLocal build complete: warehouse/data/local/national_population.duckdb");
