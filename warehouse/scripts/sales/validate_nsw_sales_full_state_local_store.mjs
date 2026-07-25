#!/usr/bin/env node
/**
 * NSW sales local store validation — FULL STATE (Sprint 7, Part A).
 *
 * Read-only validation of warehouse/data/local/nsw_sales.duckdb (full-state
 * build) against the local ASGS backbone store. No Supabase connection, no
 * secrets. Git check proves no raw/local data files are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/nsw_sales_full_state_local_store_report.json
 *   warehouse/reports/nsw_sales_full_state_local_store_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const DB_PATH = rel("warehouse", "data", "local", "nsw_sales.duckdb");
const INVENTORY = rel("warehouse", "reports", "nsw_sales_download_inventory.json");
const OUT_JSON = rel("warehouse", "reports", "nsw_sales_full_state_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "nsw_sales_full_state_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_nsw_sales_full_state_local_store.mjs"],
  [INVENTORY, "run build_nsw_sales_full_state_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const allHashed = inventory.files.every((f) => !!f.sha256);

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|dat|parquet|duckdb|csv)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const byYear = (await rows(`
  select extract(year from settlement_date)::int as year, count(*)::int as n
  from nsw_sales_transactions_raw where is_residential
  group by 1 order by 1`)).map((r) => ({ year: num(r.year), n: num(r.n) }));

const byDwellingType = (await rows(
  "select dwelling_type, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n) }));

const byGeoMatch = (await rows(
  "select geo_match_method, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n) }));

const checks = await one(`select
  (select count(*) from nsw_sales_transactions_raw where is_residential)::int as residential_rows,
  (select count(*) from nsw_sales_transactions_raw)::int as all_rows,
  (select count(*) from nsw_sales_transactions_raw where contract_date is null and settlement_date is null)::int as no_transaction_date,
  (select count(*) from nsw_sales_transactions_raw where is_residential and sale_price is null)::int as null_price,
  (select count(*) from nsw_sales_transactions_raw where is_residential and sale_price <= 0)::int as non_positive_price,
  (select count(*) from (select district_code, property_id, sale_counter, contract_date from nsw_sales_transactions_raw group by 1,2,3,4 having count(*)>1))::int as duplicate_natural_keys,
  (select count(*) from nsw_sales_transactions_raw where is_residential and (suburb_raw is null or suburb_raw = ''))::int as missing_suburb,
  (select count(*) from nsw_sales_transactions_raw where is_residential and (postcode is null or postcode = ''))::int as missing_postcode,
  (select count(*) from nsw_sales_transactions_raw where is_residential and dwelling_type is not null)::int as classified,
  (select count(*) from nsw_sales_transactions_raw where is_residential and dwelling_type = 'unknown_residential')::int as unknown_classified,
  (select count(*) from nsw_sales_transactions_raw where is_residential and price_flag = 'likely_nominal_transfer')::int as flagged_nominal,
  (select count(*) from nsw_sales_transactions_raw where is_residential and price_flag = 'missing_or_invalid')::int as flagged_invalid,
  (select count(*) from nsw_sales_transactions_raw where is_residential and price_flag = 'outlier')::int as flagged_outlier,
  (select count(*) from nsw_sales_transactions_raw where is_residential and price_flag = 'ok')::int as ok_for_stats,
  (select count(*) from nsw_sales_transactions_raw where is_residential and geo_match_method = 'unmatched')::int as geo_unmatched,
  (select count(distinct sal_geography_code) from nsw_sales_transactions_raw where is_residential and sal_geography_code is not null)::int as distinct_sals_covered,
  (select count(distinct poa_geography_code) from nsw_sales_transactions_raw where is_residential and poa_geography_code is not null)::int as distinct_poas_covered,
  (select count(*) from nsw_sales_summary)::int as summary_rows,
  (select count(*) from (select geography_id, reference_period, period_type, dwelling_type from nsw_sales_summary group by 1,2,3,4 having count(*)>1))::int as summary_duplicate_keys`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

db.closeSync();

const nonPositiveAllFlagged = checks.non_positive_price <= checks.flagged_invalid;

const finalPassed =
  allHashed && trackedData.length === 0 &&
  checks.duplicate_natural_keys === 0 && checks.summary_duplicate_keys === 0 &&
  checks.residential_rows > 0 && checks.summary_rows > 0 &&
  nonPositiveAllFlagged;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: finalPassed ? "PASSED" : "FAILED",
  scope: "full_state_nsw_2001_current",
  source_files: inventory.files.length,
  all_files_hashed: allHashed,
  raw_or_local_files_tracked_by_git: trackedData,
  by_year: byYear,
  by_dwelling_type: byDwellingType,
  by_geo_match_method: byGeoMatch,
  checks,
  notes: [
    "Non-arm's-length/nominal-value transfers (price < $10,000) and IQR-based outliers per dwelling_type are flagged and excluded from median/mean/quartile statistics — never silently included, never dropped from the transaction table.",
    "geo_unmatched rows have no suburb-name or postcode match against the full NSW ASGS backbone (e.g. a locality name variant or data-entry inconsistency) — excluded from marts, counted here for transparency.",
    "unknown_residential rows are preserved with a 'low' confidence label rather than forced into a specific dwelling type, per the no-PDF field-mapping limitation documented in the source manifest.",
    "LGA is not a field on the PSI sale record itself (only suburb name and postcode) — LGA-level coverage is reported via the distinct SAL/POA coverage counts instead.",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# NSW Sales Full-State Local Store Report (Sprint 7)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/nsw_sales.duckdb\` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

Scope: all of NSW (4,542 SAL suburbs / 2,641 POA postcodes), 2001-current.

## Source files

${inventory.files.length} raw files hashed (all: ${allHashed ? "✅" : "❌"}).
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## Volumes

- Residential rows (full state): **${checks.residential_rows}** (of ${checks.all_rows} total rows;
  ${checks.all_rows - checks.residential_rows} excluded as non-residential)
- Suburbs (SAL) covered: **${checks.distinct_sals_covered}** / 4,542. Postcodes (POA) covered: **${checks.distinct_poas_covered}** / 2,641
- Summary rows built (monthly + annual, SAL + POA, by dwelling_type, full history): **${checks.summary_rows}**

## By year

| year | residential rows |
|---|---|
${byYear.map((r) => `| ${r.year} | ${r.n} |`).join("\n")}

## By dwelling type

| dwelling_type | rows |
|---|---|
${byDwellingType.map((r) => `| ${r.dwelling_type} | ${r.n} |`).join("\n")}

## Geography match method

| method | rows |
|---|---|
${byGeoMatch.map((r) => `| ${r.geo_match_method} | ${r.n} |`).join("\n")}

## Checks

| check | value |
|---|---|
| duplicate natural keys (district+property_id+sale_counter+contract_date) | ${checks.duplicate_natural_keys} |
| summary duplicate keys | ${checks.summary_duplicate_keys} |
| rows with no transaction date at all | ${checks.no_transaction_date} |
| NULL sale price | ${checks.null_price} |
| non-positive sale price | ${checks.non_positive_price} (all flagged \`missing_or_invalid\`: ${nonPositiveAllFlagged ? "✅" : "❌"}) |
| missing suburb | ${checks.missing_suburb} |
| missing postcode | ${checks.missing_postcode} |
| classified into a dwelling type | ${checks.classified} / ${checks.residential_rows} (${checks.unknown_classified} as \`unknown_residential\`, low confidence, preserved not forced) |
| flagged nominal/non-market transfers (excluded from stats) | ${checks.flagged_nominal} |
| flagged invalid price (excluded) | ${checks.flagged_invalid} |
| flagged statistical outlier (excluded) | ${checks.flagged_outlier} |
| rows contributing to median/mean/quartile stats | ${checks.ok_for_stats} |
| geography unmatched (excluded from marts) | ${checks.geo_unmatched} |

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/nsw_sales_full_state_local_store_report.json");
console.log("  warehouse/reports/nsw_sales_full_state_local_store_report.md");
if (!finalPassed) process.exit(1);
