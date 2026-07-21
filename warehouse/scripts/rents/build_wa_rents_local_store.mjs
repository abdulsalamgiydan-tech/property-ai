#!/usr/bin/env node
/**
 * Western Australia rental market local store builder (Sprint 11,
 * Workstream 6).
 *
 * Unlike every other rent source in this sprint, WA's "Monthly Bond
 * Lodgement Summary" (Government of Western Australia, DMIRS, CC BY 4.0,
 * hosted via the National Housing Data Exchange government open-data
 * aggregator) is RAW individual bond-lodgement records — one row per
 * lodgement with a locality name, postcode, and weekly rent amount, no
 * pre-computed median. This adapter computes its own suburb- and
 * postcode-grain medians directly from the raw records, applying the same
 * sample-size confidence thresholds used everywhere else in this project.
 *
 * No dwelling-type or bedroom-count breakdown exists anywhere in the raw
 * source, so every row here is necessarily dwelling_type='all',
 * bedroom_count=null — an honest source limitation, not a build
 * shortcoming.
 *
 * 39 monthly files, Mar 2023 - May 2026, ~5,600 lodgements/month
 * (~220,000 total raw records), read via DuckDB's glob + filename capture
 * rather than loaded into JS memory row-by-row.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const RAW_DIR = rel("warehouse", "data", "raw", "wa_rents", "wa-rental-bond");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "wa_rents.duckdb");

if (!fs.existsSync(RAW_DIR)) {
  console.error(`ERROR: missing ${RAW_DIR}`);
  process.exit(1);
}

const WA_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "wa_all_sals.json"), "utf8"));

function normName(s) {
  let out = s.toUpperCase().trim();
  // Free-text lodgement records sometimes carry a trailing state
  // abbreviation ("ASHBY WA", "ASHBY, WA") that a curated source never
  // would — safe to strip since "WA" is never itself part of a WA suburb
  // name. Typos/garbled entries/street addresses in the same field are
  // left alone; those are genuine source noise, not a normalisable suffix.
  out = out.replace(/,?\s*WA\s*$/, "").trim();
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
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { geography_id: null, geography_code: null, geography_name: null, geography_confidence: "unresolved" };
  }
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
const salLookup = buildLookup(WA_SALS, "SAL");

console.log("build_wa_rents_local_store — WA DMIRS raw bond lodgements, in-house median computation, suburb + postcode grain, local-first");

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

const glob = posix(path.join(RAW_DIR, "Monthly Bond Lodgement Summary*.csv"));

// filename encodes the period as "...-(DD-MM-YYYY-DD-MM-YYYY).csv"; take the
// first date's year/month as the reference month, normalised to the 1st.
await run(`
  create table wa_lodgements_raw as
  select
    regexp_extract(filename, '\\((\\d{2})-(\\d{2})-(\\d{4})-\\d{2}-\\d{2}-\\d{4}\\)', 3) as period_year,
    regexp_extract(filename, '\\((\\d{2})-(\\d{2})-(\\d{4})-\\d{2}-\\d{2}-\\d{4}\\)', 2) as period_month,
    "LOCALITY NAME" as locality_name,
    "POSTCODE" as postcode,
    try_cast("WEEKLY RENT AMOUNT" as double) as weekly_rent
  from read_csv('${glob}', header=true, all_varchar=true, filename=true, union_by_name=true)
`);

const rawCount = Number((await all("select count(*) n from wa_lodgements_raw"))[0].n);
const nullRentCount = Number((await all("select count(*) n from wa_lodgements_raw where weekly_rent is null"))[0].n);
console.log(`  raw lodgement rows: ${rawCount} (${nullRentCount} with unparseable/missing rent, excluded from medians)`);

await run(`
  create table wa_suburb_agg as
  select
    (period_year || '-' || period_month || '-01')::date as reference_period,
    locality_name,
    count(*) as new_bond_count,
    median(weekly_rent) as median_weekly_rent
  from wa_lodgements_raw
  where weekly_rent is not null
  group by 1, 2
`);
await run(`
  create table wa_postcode_agg as
  select
    (period_year || '-' || period_month || '-01')::date as reference_period,
    postcode,
    count(*) as new_bond_count,
    median(weekly_rent) as median_weekly_rent
  from wa_lodgements_raw
  where weekly_rent is not null
  group by 1, 2
`);

const suburbAggRows = bigintsToNumbers(await all("select * from wa_suburb_agg"));
const postcodeAggRows = bigintsToNumbers(await all("select * from wa_postcode_agg"));
console.log(`  aggregated suburb-months: ${suburbAggRows.length}, postcode-months: ${postcodeAggRows.length}`);

const retrievedAt = new Date().toISOString();
function confidenceLabel(count) {
  return count >= 30 ? "high" : count >= 10 ? "medium" : count >= 5 ? "low" : "insufficient";
}

const allRows = [];
for (const r of suburbAggRows) {
  const geo = resolve(salLookup, r.locality_name);
  allRows.push({
    jurisdiction: "WA",
    geography_type: "SAL",
    geography_id: geo.geography_id,
    geography_code: geo.geography_code,
    geography_name: geo.geography_name,
    geography_confidence: geo.geography_confidence,
    locality_raw: r.locality_name,
    dwelling_type: "all",
    bedroom_count: null,
    reference_period: r.reference_period,
    median_weekly_rent: Math.round(r.median_weekly_rent * 100) / 100,
    new_bond_count: r.new_bond_count,
    direct_or_derived: "derived", // median computed in-house from raw lodgements, not source-published
    confidence_label: confidenceLabel(r.new_bond_count),
    source_id: "wa_rent",
    dataset_id: "wa_dmirs_bond_lodgements_suburb_derived",
    retrieved_at: retrievedAt,
  });
}
for (const r of postcodeAggRows) {
  const postcode = String(r.postcode).trim();
  allRows.push({
    jurisdiction: "WA",
    geography_type: "POA",
    geography_id: `POA_${postcode}_ASGS3_2021`,
    geography_code: postcode,
    geography_name: postcode,
    geography_confidence: "direct",
    locality_raw: postcode,
    dwelling_type: "all",
    bedroom_count: null,
    reference_period: r.reference_period,
    median_weekly_rent: Math.round(r.median_weekly_rent * 100) / 100,
    new_bond_count: r.new_bond_count,
    direct_or_derived: "derived",
    confidence_label: confidenceLabel(r.new_bond_count),
    source_id: "wa_rent",
    dataset_id: "wa_dmirs_bond_lodgements_postcode_derived",
    retrieved_at: retrievedAt,
  });
}
console.log(`Total wa_rental_summary rows: ${allRows.length}`);

await run(`
  create table wa_rental_summary (
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
  await run(`insert into wa_rental_summary values ${values}`);
}

await run(`drop table wa_lodgements_raw`); // raw per-record data not needed after aggregation, keeps the local DB small
await run(`copy wa_rental_summary to '${posix(path.join(LOCAL_DIR, "wa_rental_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal WA rents store built (gitignored):");
console.log(`  warehouse/data/local/wa_rents.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/wa_rental_summary.parquet  ${mb1(path.join(LOCAL_DIR, "wa_rental_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_wa_rents_local_store.mjs.");
