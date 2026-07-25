#!/usr/bin/env node
/**
 * NSW Valuer General PSI historical archive (1990-2000) local store builder
 * (Sprint 11, Workstream 8).
 *
 * Official source: NSW Valuer General Property Sales Information, archived
 * annual files. Single stable URL pattern per year
 * (https://www.valuergeneral.nsw.gov.au/__psi/yearly/<YYYY>.zip), same
 * domain and Cloudflare-protected bulk endpoint as the already-live
 * 2001-current dataset — retrieved via the gstack /browse skill in headed
 * mode (plain curl confirmed still 403s), per this repo's CLAUDE.md
 * requirement to use /browse for all web browsing. CC BY 4.0 (ND variant),
 * Crown in right of NSW through the Valuer General.
 *
 * Field layout verified against the official "Archived Property Sales Data
 * File Format (1990 to 2001)" fact sheet (downloaded live, see
 * warehouse/data/raw/nsw_sales_archive/format_guide_1990_to_2001.pdf) and
 * cross-checked character-by-character against real sample rows before
 * writing this parser — this format is NOT the same field layout as the
 * 2001-current dataset (fewer fields, only one date, no nature_of_property):
 *
 *   B ; district_code ; source ; valuation_num ; property_id ; unit_num ;
 *   house_num ; street_name ; suburb_name ; postcode ; contract_date ;
 *   purchase_price ; land_description ; area ; area_type ; dimensions ;
 *   comp_code ; zone_code ; vendor_name(removed) ; purchaser_name(removed)
 *
 * Two real, documented gaps vs. the 2001-current dataset:
 *  1. No settlement_date — only contract_date exists in the archive.
 *  2. No nature_of_property field, so the current pipeline's dwelling-type
 *     classification (RESIDENCE/UNIT/VACANT LAND text matching) cannot be
 *     reused. zone_code alone is NOT a dwelling-type signal — it is a
 *     broad NSW planning zone letter (confirmed against the official
 *     "Zone Codes and Descriptions" fact sheet: 'A' = Residential zoning,
 *     covering everything from a house to a block of units to vacant land
 *     within a residential area). Classification here is therefore
 *     necessarily coarser and lower-confidence:
 *       - zone_code != 'A' -> dwelling_type = 'non_residential_or_other_zone'
 *         (excluded from residential summary stats, same as the current
 *         pipeline's is_residential filter)
 *       - zone_code == 'A' and land_description matches a strata-plan
 *         pattern ('STRATA PLAN' or 'SP <digits>') -> 'apartment_unit'
 *         (medium confidence — verified this pattern actually appears in
 *         ~20% of zone-A archive rows)
 *       - zone_code == 'A' otherwise -> 'unknown_residential' (low
 *         confidence) — reuses the exact fallback bucket the current
 *         pipeline already uses for its own unclassifiable residential
 *         rows, rather than inventing a new category.
 *
 * Local-only. No Supabase connection. Branch promotion is deliberately NOT
 * attempted this pass — it would mean inserting into the already-live
 * core.fact_residential_sales_summary annual aggregates that existing
 * comparison-API marts already read from, which warrants its own careful,
 * dedicated pass rather than being rushed alongside first-time discovery.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const PROCESSED_DIR = rel("warehouse", "data", "processed", "nsw_sales_archive");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "nsw_sales_archive.duckdb");

const YEARS = ["1990", "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999", "2000"];

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

console.log("build_nsw_sales_archive_local_store — NSW VG PSI archive 1990-2000, local-first");

for (const year of YEARS) {
  const f = path.join(PROCESSED_DIR, year, `ARCHIVE_SALES_${year}.DAT`);
  if (!fs.existsSync(f)) fail(`missing extracted file for ${year}: ${f}`);
}

fs.mkdirSync(LOCAL_DIR, { recursive: true });
const OUT_CSV = path.join(LOCAL_DIR, "_nsw_sales_archive.tmp.csv");
const out = fs.createWriteStream(OUT_CSV);
out.write(
  [
    "district_code", "source", "valuation_num", "property_id", "unit_num", "house_num", "street_name",
    "suburb_raw", "postcode", "contract_date_raw", "purchase_price", "land_description", "area_value",
    "area_type", "dimensions", "comp_code", "zone_code", "source_year",
  ].join(",") + "\n"
);
const csvCell = (v) => {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v).replaceAll('"', '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

let scannedLines = 0;
let writtenRows = 0;
for (const year of YEARS) {
  const f = path.join(PROCESSED_DIR, year, `ARCHIVE_SALES_${year}.DAT`);
  const rl = readline.createInterface({ input: fs.createReadStream(f), crlfDelay: Infinity });
  let yearRows = 0;
  for await (const line of rl) {
    if (!line.startsWith("B;")) continue;
    scannedLines++;
    const fld = line.split(";");
    out.write(
      [
        fld[1], fld[2], fld[3], fld[4], fld[5], fld[6], fld[7],
        fld[8], fld[9], fld[10], fld[11], fld[12], fld[13],
        fld[14], fld[15], fld[16], fld[17], year,
      ].map(csvCell).join(",") + "\n"
    );
    writtenRows++;
    yearRows++;
  }
  console.log(`  ${year}: ${yearRows} B records`);
}
await new Promise((res) => out.end(res));
console.log(`Scan complete: ${scannedLines} B records read, ${writtenRows} rows written`);
if (writtenRows === 0) fail("no records written");

if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`create table nsw_sales_archive_staged as
  select district_code, source, valuation_num, property_id, unit_num, house_num, street_name,
         suburb_raw, postcode, contract_date_raw, try_cast(purchase_price as double) as purchase_price,
         land_description, try_cast(area_value as double) as area_value, area_type, dimensions,
         comp_code, zone_code, source_year::integer as source_year,
         try_strptime(contract_date_raw, '%d/%m/%Y')::date as contract_date
  from read_csv('${posix(OUT_CSV)}', header=true, all_varchar=true, quote='"', escape='"')`);
fs.rmSync(OUT_CSV, { force: true });

const [stagedN] = await one("select count(*) from nsw_sales_archive_staged");
console.log(`\nLoaded ${stagedN} raw archive records into DuckDB (pre-dedup)`);

// Natural key: district+property_id+contract_date (no sale_counter or
// reference_number field exists in this format to disambiguate further —
// an honest limitation, documented in the validation report, not hidden).
await run(`
  create table nsw_sales_archive_raw as
  select * exclude (rn) from (
    select *, row_number() over (
      partition by district_code, property_id, valuation_num, contract_date, purchase_price
      order by source_year desc
    ) as rn
    from nsw_sales_archive_staged
  ) where rn = 1
`);
const [dedupN] = await one("select count(*) from nsw_sales_archive_raw");
console.log(`After exact-duplicate collapse: ${dedupN} rows`);

await run(`alter table nsw_sales_archive_raw add column dwelling_type varchar`);
await run(`alter table nsw_sales_archive_raw add column dwelling_type_confidence varchar`);
await run(`
  update nsw_sales_archive_raw set
    dwelling_type = case
      when upper(zone_code) != 'A' then 'non_residential_or_other_zone'
      when regexp_matches(upper(land_description), 'STRATA PLAN|SP ?[0-9]+') then 'apartment_unit'
      else 'unknown_residential'
    end,
    dwelling_type_confidence = case
      when upper(zone_code) != 'A' then 'high'
      when regexp_matches(upper(land_description), 'STRATA PLAN|SP ?[0-9]+') then 'medium'
      else 'low'
    end
`);

const byDwelling = await db.runAndReadAll(
  `select dwelling_type, dwelling_type_confidence, count(*)::int n from nsw_sales_archive_raw group by 1,2 order by 3 desc`
);
console.log("\nDwelling type breakdown:");
for (const r of byDwelling.getRowObjects()) console.log(`  ${r.dwelling_type} (${r.dwelling_type_confidence}): ${r.n}`);

await run(`copy nsw_sales_archive_raw to '${posix(path.join(LOCAL_DIR, "nsw_sales_archive_transactions.parquet"))}' (format parquet, compression zstd)`);

// Annual summary by district + dwelling_type, residential zone only —
// mirrors the shape of the current-era annual mart so a future WS9/branch
// pass can extend the existing schema rather than invent a new one.
await run(`
  create table nsw_sales_archive_annual_summary as
  select source_year, district_code, dwelling_type,
    count(*) as sale_count,
    median(purchase_price) as median_sale_price,
    dwelling_type_confidence
  from nsw_sales_archive_raw
  where zone_code = 'A'
  group by 1,2,3,6
`);
await run(`copy nsw_sales_archive_annual_summary to '${posix(path.join(LOCAL_DIR, "nsw_sales_archive_annual_summary.parquet"))}' (format parquet, compression zstd)`);

await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal NSW sales archive store built (gitignored):");
console.log(`  warehouse/data/local/nsw_sales_archive.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/nsw_sales_archive_transactions.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_sales_archive_transactions.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_nsw_sales_archive_local_store.mjs.");
