#!/usr/bin/env node
/**
 * NSW Valuer General sales local store builder — pilot (Sprint 5, Part C-E).
 *
 * Reads the already-downloaded official NSW VG PSI bulk files (annual
 * zip-of-zips for 2021-2025 + current-year weekly zips), extracts them,
 * streams every district's .DAT text file, and keeps only the B (sale)
 * records whose suburb name or postcode falls inside the pilot LGA
 * footprint (Blacktown, Parramatta, Camden, Wollongong, Newcastle,
 * Shellharbour — derived spatially from the local ASGS backbone; see
 * warehouse/metadata/nsw_sales_pilot_sals.json / _pilot_poas.json).
 *
 * PSI record format (validated directly against real downloaded sample
 * records — the official field-position PDFs are also Cloudflare-protected
 * and were not retrievable this session; see the source manifest notes):
 *   A;<district>;<generated_at>;VALNET;                                    (header)
 *   B;<district>;<property_id>;<sale_counter>;<ts>;<property_name>;
 *     <unit_no>;<house_no>;<street>;<suburb>;<postcode>;<area>;<area_unit>;
 *     <contract_date:YYYYMMDD>;<settlement_date:YYYYMMDD>;<price>;<blank>;
 *     <zone_code>;<nature_of_property>;<strata_lot>;...;<reference_no>;    (sale)
 *   C;...;<legal_description>;                                             (legal desc)
 *   D;...                                                                  (linked record)
 *   Z;...                                                                  (trailer)
 *
 * Local-first: raw files + this full store stay under warehouse/data/
 * (gitignored) and are NEVER promoted to Supabase in full — only curated
 * monthly/annual summaries leave the local store (Part F).
 *
 * Classification and price-flagging rules are conservative and documented
 * (see classifyDwelling / flagPrice below) because the authoritative NSW VG
 * code-list PDF could not be retrieved; ambiguous records get
 * 'unknown_residential' / a 'low' or 'medium' confidence label rather than
 * being forced into a specific category.
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

const PILOT_SALS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_sales_pilot_sals.json"), "utf8"));
const PILOT_POAS = JSON.parse(fs.readFileSync(rel("warehouse", "metadata", "nsw_sales_pilot_poas.json"), "utf8"));

// PSI suburb text is plain uppercase with no ABS "(NSW)" disambiguator suffix
// and often no parenthetical qualifier at all — normalise both sides the
// same way so e.g. "KARUAH" matches ABS SAL "Karuah".
const normName = (s) => s.toUpperCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
const salByName = new Map(PILOT_SALS.map((r) => [normName(r.geography_name), r]));
const poaByCode = new Map(PILOT_POAS.map((r) => [r.geography_code, r]));
const poaCodeSet = new Set(PILOT_POAS.map((r) => r.geography_code));

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

console.log("build_nsw_sales_local_store — NSW VG PSI pilot (local-first, no Supabase, no secrets)");
console.log(`  pilot suburbs (SAL): ${PILOT_SALS.length}, pilot postcodes (POA): ${PILOT_POAS.length}`);

// ── 1. Inventory (hash) every raw file already on disk ────────────────────

function sha256File(p) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

if (!fs.existsSync(RAW_ROOT)) fail("no raw NSW sales files on disk — download the PSI zips first (see nsw_sales_source_manifest.md)");
const annualFiles = fs.readdirSync(RAW_ROOT).filter((f) => /^\d{4}\.zip$/.test(f)).sort();
const weeklyDir = path.join(RAW_ROOT, "weekly");
const weeklyFiles = fs.existsSync(weeklyDir) ? fs.readdirSync(weeklyDir).filter((f) => /^\d{8}\.zip$/.test(f)).sort() : [];
if (annualFiles.length === 0) fail("no annual PSI bundles on disk");

const inventory = {
  generated_at: new Date().toISOString(),
  raw_root: "warehouse/data/raw/nsw_sales (gitignored)",
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

// ── 2. Extract (idempotent: skip a target dir that already has content) ──

function extractZip(zipPath, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync(BSDTAR, ["-xf", zipPath, "-C", destDir], { stdio: "pipe" });
}

console.log("\nExtracting (nested zip-of-zips: annual -> weekly -> per-district .DAT)...");
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
  for (const iz of innerZips) {
    const weekLabel = iz.replace(".zip", "");
    extractZip(path.join(tmpWeeklyDir, iz), path.join(yearDir, weekLabel));
  }
  fs.rmSync(tmpWeeklyDir, { recursive: true, force: true });
  console.log(`  ${year}: extracted ${innerZips.length} weeks`);
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

// ── 3. Stream-parse every .DAT file, keep only pilot-area B records ──────
//
// .DAT files mix five record types with different column counts on one
// line each (';'-delimited) — DuckDB's CSV reader can't parse that
// directly, so this pass filters and reshapes into one fixed-schema CSV.

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
console.log(`\nFound ${datFiles.length} district .DAT files across all years/weeks. Filtering to pilot area...`);

const OUT_CSV = path.join(LOCAL_DIR, "_nsw_sales_pilot.tmp.csv");
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
let matchedRows = 0;
for (const file of datFiles) {
  scannedFiles++;
  const districtFromName = path.basename(file).split("_")[0];
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("B;")) continue;
    scannedLines++;
    const f = line.split(";");
    // f[0]=B f[1]=district f[2]=property_id f[3]=sale_counter f[4]=ts f[5]=property_name
    // f[6]=unit_no f[7]=house_no f[8]=street f[9]=suburb f[10]=postcode f[11]=area
    // f[12]=area_unit f[13]=contract_date f[14]=settlement_date f[15]=price f[16]=blank
    // f[17]=zone_code f[18]=nature_of_property f[19]=strata_lot f[23]=reference_number
    const suburbRaw = (f[9] ?? "").trim();
    const postcode = (f[10] ?? "").trim();
    const inPilot = salByName.has(normName(suburbRaw)) || poaCodeSet.has(postcode);
    if (!inPilot) continue;
    matchedRows++;
    out.write(
      [
        f[1] ?? districtFromName, f[2], f[3], f[6], f[7], f[8],
        suburbRaw, postcode, f[11], f[12], f[13], f[14],
        f[15], f[17], f[18], f[19], f[23], path.basename(file),
      ].map(csvCell).join(",") + "\n"
    );
  }
  if (scannedFiles % 500 === 0) console.log(`  ...${scannedFiles}/${datFiles.length} files scanned, ${matchedRows} pilot-area rows so far`);
}
await new Promise((res) => out.end(res));
console.log(`Scan complete: ${scannedFiles} files, ${scannedLines} B records read, ${matchedRows} matched the pilot area`);
if (matchedRows === 0) fail("no pilot-area records matched — check the pilot allow-lists / suburb-name normalisation");

// ── 4. DuckDB load + classification + price flagging ─────────────────────

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
         -- filename suffix DDMMYYYY = the week this record was generated/published;
         -- the same real-world sale can be (re)transmitted across several weekly
         -- files (correction or verbatim repeat) — the latest publication wins.
         try_strptime(regexp_extract(source_file, '(\\d{8})\\.DAT$', 1), '%d%m%Y')::date as source_file_date
  -- Explicit quote/escape (Sprint 7 fix): DuckDB's CSV auto-detection can
  -- wrongly conclude "no quote character in use" from its sample and choke
  -- on a later row whose property name contains an embedded comma.
  from read_csv('${posix(OUT_CSV)}', header=true, all_varchar=true, quote='"', escape='"')`);
fs.rmSync(OUT_CSV, { force: true });

const [stagedN] = await one("select count(*) from nsw_sales_transactions_staged");
console.log(`\nLoaded ${stagedN} raw pilot-area sale records into DuckDB (pre-dedup)`);

// Natural key is (district, property_id, sale_counter, contract_date): the
// same property can legitimately be sold multiple times over the 5-year
// window, each with its own contract_date — sale_counter alone does not
// disambiguate separate sale events. Within that key, keep only the most
// recently PUBLISHED version (by source_file_date) — resolves both genuine
// corrections (price/date amended in a later week) and verbatim repeats.
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
console.log(`After natural-key dedup (district+property+sale_counter+contract_date, latest publication wins): ${dedupN} rows (${Number(stagedN) - dedupN} duplicate/republished rows resolved)`);

// Classification: conservative, documented, source-preserving (see header
// comment). VACANT LAND is exact-matched from the source's own nature text;
// RESIDENCE + unit/strata marker -> apartment_unit (medium confidence, the
// finer villa/townhouse-vs-flat distinction isn't recoverable from the
// fields available without the code-list PDF); RESIDENCE + no unit/strata
// marker -> detached_house (medium — inferred, not an explicit source flag);
// anything else residential-shaped -> unknown_residential (low). Records
// whose nature_of_property doesn't look residential at all (commercial,
// industrial, rural, etc.) are excluded entirely — this pilot is
// residential-only per its scope.
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

// Price flagging: never silently include non-market prices in stats.
//   null/<=0            -> missing_or_invalid (excluded)
//   0 < price < $10,000  -> likely_nominal_transfer (excluded from stats, kept in record)
//   IQR outlier per (dwelling_type) among otherwise-valid prices -> outlier (excluded from stats)
//   else                 -> ok (counted in aggregation)
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

// ── 5. Geography join (name -> SAL, postcode -> POA) ─────────────────────

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

// ── 6. Monthly + annual summaries (only price_flag='ok' rows count) ──────

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
console.log(`\nSummary rows built: ${summaryN} (monthly + annual, SAL + POA, by dwelling_type)`);

// ── 7. Parquet exports ────────────────────────────────────────────────────

await run(`copy nsw_sales_transactions_raw to '${posix(path.join(LOCAL_DIR, "nsw_sales_transactions.parquet"))}' (format parquet, compression zstd)`);
await run(`copy nsw_sales_summary to '${posix(path.join(LOCAL_DIR, "nsw_sales_summary.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb1 = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(1);
console.log("\nLocal NSW sales store built (all gitignored):");
console.log(`  warehouse/data/local/nsw_sales.duckdb  ${mb1(DB_PATH)} MB`);
console.log(`  warehouse/data/local/nsw_sales_transactions.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_sales_transactions.parquet"))} MB`);
console.log(`  warehouse/data/local/nsw_sales_summary.parquet  ${mb1(path.join(LOCAL_DIR, "nsw_sales_summary.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_nsw_sales_local_store.mjs.");
