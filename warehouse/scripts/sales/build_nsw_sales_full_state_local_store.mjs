#!/usr/bin/env node
/**
 * NSW Valuer General sales local store builder — FULL STATE (Sprint 7, Part A).
 *
 * Full-state expansion of the Sprint 5 pilot build. Same proven pipeline
 * (extraction, streaming B-record parse, natural-key dedup with
 * latest-publication-wins, dwelling-type classification, price flagging,
 * geography join, monthly+annual aggregation) — widened from the 6 pilot
 * LGAs / 236 SALs / 63 POAs to all of NSW (4,542 SALs / 2,641 POAs), and
 * from 2021-current to 2001-current (annual bundles 2001-2025 + current-year
 * weekly files).
 *
 * Because virtually every real NSW residential B record should match some
 * real NSW suburb/postcode at full-state scope, there is no pilot pre-filter
 * at scan time — every parseable B record is written to the transactions
 * table (geo_match_method='unmatched' rows are excluded from aggregation
 * downstream, and are a useful data-quality signal at this scale rather
 * than a reason to drop the row at scan time).
 *
 * Local-first: raw files + this full store stay under warehouse/data/
 * (gitignored) and are NEVER promoted to Supabase in full — only curated
 * annual + trailing-12-months summaries leave the local store (Part C).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const RAW_ROOT = rel("warehouse", "data", "raw", "nsw_sales");
const PROCESSED_ROOT = rel("warehouse", "data", "processed", "nsw_sales");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "nsw_sales.duckdb");
const INVENTORY_OUT = rel("warehouse", "reports", "nsw_sales_download_inventory.json");
const BSDTAR = "C:\\Windows\\System32\\tar.exe";

const ALL_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_all_sals.json"), "utf8"));
const ALL_POAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_all_poas.json"), "utf8"));

const normName = (s) => s.toUpperCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
const salByName = new Map(ALL_SALS.map((r) => [normName(r.geography_name), r]));
const poaByCode = new Map(ALL_POAS.map((r) => [r.geography_code, r]));

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

console.log("build_nsw_sales_full_state_local_store — NSW VG PSI, full state (local-first, no Supabase, no secrets)");
console.log(`  full-state suburbs (SAL): ${ALL_SALS.length}, postcodes (POA): ${ALL_POAS.length}`);

// ── 1. Inventory (hash) every raw file already on disk ────────────────────

function sha256File(p) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

if (!fs.existsSync(RAW_ROOT)) fail("no raw NSW sales files on disk");
const annualFiles = fs.readdirSync(RAW_ROOT).filter((f) => /^\d{4}\.zip$/.test(f)).sort();
const weeklyDir = path.join(RAW_ROOT, "weekly");
const weeklyFiles = fs.existsSync(weeklyDir) ? fs.readdirSync(weeklyDir).filter((f) => /^\d{8}\.zip$/.test(f)).sort() : [];
if (annualFiles.length === 0) fail("no annual PSI bundles on disk");
console.log(`  annual bundles on disk: ${annualFiles.length} (${annualFiles[0]} .. ${annualFiles[annualFiles.length - 1]}), weekly: ${weeklyFiles.length}`);

const inventory = {
  generated_at: new Date().toISOString(),
  raw_root: "warehouse/data/raw/nsw_sales (gitignored)",
  scope: "full_state_2001_current",
  files: [
    ...annualFiles.map((f) => {
      const p = path.join(RAW_ROOT, f);
      return { file: `nsw_sales/${f}`, kind: "annual_bundle", size_bytes: fs.statSync(p).size, sha256: sha256File(p) };
    }),
    ...weeklyFiles.map((f) => {
      const p = path.join(weeklyDir, f);
      return { file: `nsw_sales/weekly/${f}`, kind: "current_year_weekly", size_bytes: fs.statSync(p).size, sha256: sha256File(p) };
    }),
  ],
};
fs.writeFileSync(INVENTORY_OUT, JSON.stringify(inventory, null, 2) + "\n");
console.log(`\nInventory: ${annualFiles.length} annual bundles, ${weeklyFiles.length} current-year weekly files, hashes recorded`);

// ── 2. Extract (idempotent) ───────────────────────────────────────────────

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(BSDTAR, ["-xf", zipPath, "-C", destDir], { stdio: "pipe" });
}

console.log("\nExtracting (format varies by vintage: recent years are annual zip-of-weekly-zips;");
console.log("older years (~pre-2015) are a single zip with date-named folders of .DAT files directly)...");
for (const f of annualFiles) {
  const year = f.replace(".zip", "");
  const yearDir = path.join(PROCESSED_ROOT, year);
  if (fs.existsSync(yearDir) && fs.readdirSync(yearDir).length > 0) {
    console.log(`  ${year}: already extracted`);
    continue;
  }
  const tmpWeeklyDir = path.join(PROCESSED_ROOT, `_tmp_${year}`);
  extractZip(path.join(RAW_ROOT, f), tmpWeeklyDir);
  const innerZips = fs.readdirSync(tmpWeeklyDir).filter((z) => z.endsWith(".zip"));
  if (innerZips.length > 0) {
    // Recent-vintage format: nested weekly zips.
    for (const iz of innerZips) {
      const weekLabel = iz.replace(".zip", "");
      extractZip(path.join(tmpWeeklyDir, iz), path.join(yearDir, weekLabel));
    }
    fs.rmSync(tmpWeeklyDir, { recursive: true, force: true });
    console.log(`  ${year}: extracted ${innerZips.length} weeks (nested-zip format)`);
  } else {
    // Older-vintage format: no inner zips — the top-level extraction
    // already produced the final .DAT files (in date-named folders); move
    // the whole tree into place rather than discarding it.
    fs.mkdirSync(path.dirname(yearDir), { recursive: true });
    fs.renameSync(tmpWeeklyDir, yearDir);
    const datCount = fs.readdirSync(yearDir, { recursive: true }).filter((p) => String(p).toUpperCase().endsWith(".DAT")).length;
    console.log(`  ${year}: extracted directly, ${datCount} .DAT files (flat/older format)`);
  }
}
if (weeklyFiles.length > 0) {
  const curDir = path.join(PROCESSED_ROOT, "current_year_weekly");
  for (const f of weeklyFiles) {
    const weekLabel = f.replace(".zip", "");
    const destDir = path.join(curDir, weekLabel);
    if (fs.existsSync(destDir) && fs.readdirSync(destDir).length > 0) continue;
    extractZip(path.join(weeklyDir, f), destDir);
  }
  console.log(`  current_year_weekly: extracted ${weeklyFiles.length} weeks`);
}

// ── 3. Stream-parse every .DAT file — keep every parseable B record ───────

function findDatFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.name.toUpperCase().endsWith(".DAT")) out.push(p);
    }
  }
  return out;
}

const datFiles = findDatFiles(PROCESSED_ROOT);
console.log(`\nFound ${datFiles.length} district .DAT files across all years/weeks (full state, 2001-current). Parsing...`);

const OUT_CSV = path.join(LOCAL_DIR, "_nsw_sales_full.tmp.csv");
fs.mkdirSync(LOCAL_DIR, { recursive: true });
const out = fs.createWriteStream(OUT_CSV);
out.write(
  [
    "district_code", "property_id", "sale_counter", "unit_number", "house_number", "street_name",
    "suburb_raw", "postcode", "area_value", "area_unit", "contract_date", "settlement_date",
    "sale_price", "zone_code", "nature_of_property", "strata_lot", "reference_number", "source_file",
  ].join(",") + "\n"
);

const csvCell = (v) => {
  if (v === undefined || v === null || v === "") return "";
  const s = String(v).replaceAll('"', '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};

let scannedFiles = 0;
let scannedLines = 0;
let writtenRows = 0;
const startTs = Date.now();
for (const file of datFiles) {
  scannedFiles++;
  const districtFromName = path.basename(file).split("_")[0];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("B;")) continue;
    scannedLines++;
    const f = line.split(";");
    const suburbRaw = (f[9] ?? "").trim();
    const postcode = (f[10] ?? "").trim();
    writtenRows++;
    out.write(
      [
        f[1] ?? districtFromName, f[2], f[3], f[6], f[7], f[8],
        suburbRaw, postcode, f[11], f[12], f[13], f[14],
        f[15], f[17], f[18], f[19], f[23], path.basename(file),
      ].map(csvCell).join(",") + "\n"
    );
  }
  if (scannedFiles % 2000 === 0) {
    const elapsedMin = ((Date.now() - startTs) / 60000).toFixed(1);
    console.log(`  ...${scannedFiles}/${datFiles.length} files scanned, ${writtenRows} rows written (${elapsedMin} min elapsed)`);
  }
}
await new Promise((res) => out.end(res));
console.log(`Scan complete: ${scannedFiles} files, ${scannedLines} B records read, ${writtenRows} rows written`);
if (writtenRows === 0) fail("no records written — something is wrong with the extracted files");

// ── 4. DuckDB load + classification + price flagging (same rules as pilot) ─

if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(DB_PATH + ".wal", { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`create table nsw_sales_transactions_staged as
  select district_code, property_id, sale_counter, unit_number, house_number, street_name,
         suburb_raw, postcode, try_cast(area_value as double) area_value, area_unit,
         try_strptime(contract_date, '%Y%m%d')::date as contract_date,
         try_strptime(settlement_date, '%Y%m%d')::date as settlement_date,
         try_cast(sale_price as double) as sale_price,
         zone_code, nature_of_property, strata_lot, reference_number, source_file,
         try_strptime(regexp_extract(source_file, '(\\d{8})\\.DAT$', 1), '%d%m%Y')::date as source_file_date
  -- Explicit quote/escape: DuckDB's CSV auto-detection samples only the
  -- first ~20k rows and can wrongly conclude "no quote character in use"
  -- when that sample happens to contain no quoted fields, then chokes on a
  -- later row whose property name contains an embedded comma (e.g.
  -- "WILANGEE, "). Force quoting behaviour instead of guessing it.
  from read_csv('${posix(OUT_CSV)}', header=true, all_varchar=true, quote='"', escape='"')`);
fs.rmSync(OUT_CSV, { force: true });

const [stagedN] = await one("select count(*) from nsw_sales_transactions_staged");
console.log(`\nLoaded ${stagedN} raw full-state sale records into DuckDB (pre-dedup)`);

// Natural key includes contract_date (Sprint 5 lesson: sale_counter alone
// does not disambiguate separate sale events of the same property over
// time); latest-published version wins for genuine republish/corrections.
await run(`
  create table nsw_sales_transactions_raw as
  select * exclude (rn) from (
    select *, row_number() over (
      partition by district_code, property_id, sale_counter, contract_date
      order by source_file_date desc nulls last
    ) as rn
    from nsw_sales_transactions_staged
  ) where rn = 1`);
await run("drop table nsw_sales_transactions_staged");

const [dedupCount] = await one("select count(*) from nsw_sales_transactions_raw");
const dedupN = Number(dedupCount);
console.log(`After natural-key dedup: ${dedupN} rows (${Number(stagedN) - dedupN} duplicate/republished rows resolved)`);

// Classification: identical rules to the Sprint 5 pilot (see that script's
// header comment for the full rationale — unchanged here).
await run(`
  alter table nsw_sales_transactions_raw add column dwelling_type varchar;
  alter table nsw_sales_transactions_raw add column dwelling_type_confidence varchar;
  alter table nsw_sales_transactions_raw add column is_residential boolean;

  update nsw_sales_transactions_raw set
    is_residential = (upper(nature_of_property) similar to '%(RESIDENCE|VACANT LAND|DWELLING|UNIT|VILLA|TOWNHOUSE|FLAT|HOME UNIT)%')
                      or upper(zone_code) in ('R','V');

  update nsw_sales_transactions_raw set
    dwelling_type = case
      when upper(nature_of_property) = 'VACANT LAND' or upper(zone_code) = 'V' then 'residential_land'
      when upper(nature_of_property) similar to '%(UNIT|FLAT|VILLA|TOWNHOUSE|HOME UNIT)%' then 'townhouse_villa_semidetached'
      when upper(nature_of_property) = 'RESIDENCE' and (strata_lot is not null and strata_lot <> '') then 'apartment_unit'
      when upper(nature_of_property) = 'RESIDENCE' then 'detached_house'
      when is_residential then 'other_residential'
      else null
    end,
    dwelling_type_confidence = case
      when upper(nature_of_property) = 'VACANT LAND' or upper(zone_code) = 'V' then 'high'
      when upper(nature_of_property) similar to '%(UNIT|FLAT|VILLA|TOWNHOUSE|HOME UNIT)%' then 'medium'
      when upper(nature_of_property) = 'RESIDENCE' and (strata_lot is not null and strata_lot <> '') then 'medium'
      when upper(nature_of_property) = 'RESIDENCE' then 'medium'
      when is_residential then 'low'
      else null
    end;

  update nsw_sales_transactions_raw set dwelling_type = 'unknown_residential', dwelling_type_confidence = 'low'
    where is_residential and dwelling_type is null;
`);

const [classified, unresidential] = await one(
  "select count(*) filter (is_residential), count(*) filter (not is_residential) from nsw_sales_transactions_raw"
);
console.log(`  classified as residential: ${classified} (excluded as non-residential: ${unresidential})`);

// Price flagging — identical rules to the pilot.
await run(`
  alter table nsw_sales_transactions_raw add column price_flag varchar;
  update nsw_sales_transactions_raw set price_flag = case
    when sale_price is null or sale_price <= 0 then 'missing_or_invalid'
    when sale_price < 10000 then 'likely_nominal_transfer'
    else 'candidate'
  end
  where is_residential;

  create temp table iqr_bounds as
  select dwelling_type,
         quantile_cont(sale_price, 0.25) as q1,
         quantile_cont(sale_price, 0.75) as q3
  from nsw_sales_transactions_raw
  where price_flag = 'candidate'
  group by 1;

  update nsw_sales_transactions_raw t set price_flag = 'outlier'
  from iqr_bounds b
  where t.dwelling_type = b.dwelling_type and t.price_flag = 'candidate'
    and (t.sale_price < b.q1 - 3.0 * (b.q3 - b.q1) or t.sale_price > b.q3 + 3.0 * (b.q3 - b.q1));

  update nsw_sales_transactions_raw set price_flag = 'ok' where price_flag = 'candidate';
`);
const flagCounts = await db.runAndReadAll(
  "select price_flag, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1 order by 1"
);
console.log("  price flags:", flagCounts.getRowObjects().map((r) => `${r.price_flag}=${r.n}`).join(", "));

// ── 5. Geography join — FULL NSW (4,542 SAL / 2,641 POA) ─────────────────

await run(`
  alter table nsw_sales_transactions_raw add column sal_geography_id varchar;
  alter table nsw_sales_transactions_raw add column sal_geography_code varchar;
  alter table nsw_sales_transactions_raw add column poa_geography_id varchar;
  alter table nsw_sales_transactions_raw add column poa_geography_code varchar;
  alter table nsw_sales_transactions_raw add column geo_match_method varchar;
`);
{
  const salParams = [];
  for (const [name, r] of salByName) salParams.push(`('${name.replaceAll("'", "''")}', 'SAL_${r.geography_code}_ASGS3_2021', '${r.geography_code}')`);
  const poaParams = [];
  for (const [code, r] of poaByCode) poaParams.push(`('${code}', 'POA_${r.geography_code}_ASGS3_2021', '${r.geography_code}')`);
  await run(`create temp table sal_lookup(name varchar, gid varchar, code varchar); insert into sal_lookup values ${salParams.join(",")};`);
  await run(`create temp table poa_lookup(code varchar, gid varchar, geocode varchar); insert into poa_lookup values ${poaParams.join(",")};`);
  await run(`
    update nsw_sales_transactions_raw t set
      sal_geography_id = s.gid, sal_geography_code = s.code
    from sal_lookup s
    where regexp_replace(upper(t.suburb_raw), '\\s*\\([^)]*\\)\\s*$', '') = s.name;

    update nsw_sales_transactions_raw t set
      poa_geography_id = p.gid, poa_geography_code = p.geocode
    from poa_lookup p
    where t.postcode = p.code;

    update nsw_sales_transactions_raw set geo_match_method = case
      when sal_geography_id is not null and poa_geography_id is not null then 'suburb_and_postcode'
      when sal_geography_id is not null then 'suburb_name_only'
      when poa_geography_id is not null then 'postcode_only'
      else 'unmatched'
    end;
  `);
}
const geoCounts = await db.runAndReadAll(
  "select geo_match_method, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1 order by 1"
);
console.log("  geography match:", geoCounts.getRowObjects().map((r) => `${r.geo_match_method}=${r.n}`).join(", "));

// ── 6. Monthly + annual summaries (full history, local only) ─────────────

await run(`
  create table nsw_sales_summary as
  with base as (
    select *,
           date_trunc('month', settlement_date)::date as month_start,
           date_trunc('year', settlement_date)::date as year_start
    from nsw_sales_transactions_raw
    where is_residential and price_flag = 'ok' and settlement_date is not null
  ),
  monthly_sal as (
    select sal_geography_id as geography_id, 'SAL' geography_type, sal_geography_code as geography_code,
           month_start as reference_period, 'month' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where sal_geography_id is not null group by 1,2,3,4,5,6
  ),
  annual_sal as (
    select sal_geography_id as geography_id, 'SAL' geography_type, sal_geography_code as geography_code,
           year_start as reference_period, 'year' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where sal_geography_id is not null group by 1,2,3,4,5,6
  ),
  monthly_poa as (
    select poa_geography_id as geography_id, 'POA' geography_type, poa_geography_code as geography_code,
           month_start as reference_period, 'month' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where poa_geography_id is not null group by 1,2,3,4,5,6
  ),
  annual_poa as (
    select poa_geography_id as geography_id, 'POA' geography_type, poa_geography_code as geography_code,
           year_start as reference_period, 'year' as period_type, dwelling_type,
           count(*)::int as transaction_count,
           median(sale_price) as median_sale_price, avg(sale_price) as mean_sale_price,
           quantile_cont(sale_price,0.25) as lower_quartile_sale_price,
           quantile_cont(sale_price,0.75) as upper_quartile_sale_price,
           min(sale_price) as min_sale_price, max(sale_price) as max_sale_price
    from base where poa_geography_id is not null group by 1,2,3,4,5,6
  ),
  unioned as (
    select * from monthly_sal union all select * from annual_sal
    union all select * from monthly_poa union all select * from annual_poa
  )
  select *,
         case when transaction_count >= 30 then 'high'
              when transaction_count >= 10 then 'medium'
              when transaction_count >= 5 then 'low'
              else 'insufficient' end as sample_size_confidence
  from unioned`);

const [summaryN] = await one("select count(*) from nsw_sales_summary");
console.log(`\nSummary rows built (full history, local only): ${summaryN}`);

// ── 7. Parquet exports ────────────────────────────────────────────────────

await run(`copy nsw_sales_transactions_raw to '${posix(path.join(LOCAL_DIR, "nsw_sales_transactions.parquet"))}' (format parquet, compression zstd)`);
await run(`copy nsw_sales_summary to '${posix(path.join(LOCAL_DIR, "nsw_sales_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal NSW sales store built, FULL STATE (all gitignored):");
console.log(`  warehouse/data/local/nsw_sales.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/nsw_sales_transactions.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_sales_transactions.parquet"))} MB`);
console.log(`  warehouse/data/local/nsw_sales_summary.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_sales_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_nsw_sales_full_state_local_store.mjs.");
