#!/usr/bin/env node
/**
 * NSW sales local store validation — pilot (Sprint 5, Part C).
 *
 * Read-only validation of warehouse/data/local/nsw_sales.duckdb against the
 * local ASGS backbone store. No Supabase connection, no secrets. Git check
 * proves no raw/local data files are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/nsw_sales_local_store_report.json
 *   warehouse/reports/nsw_sales_local_store_report.md
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
const OUT_JSON = rel("warehouse", "reports", "nsw_sales_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "nsw_sales_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_nsw_sales_local_store.mjs"],
  [INVENTORY, "run build_nsw_sales_local_store.mjs"],
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

const byYearLga = await rows(`
  select extract(year from settlement_date)::int as year,
         coalesce(sal_geography_code, poa_geography_code, 'unmatched') as area,
         count(*)::int as n
  from nsw_sales_transactions_raw where is_residential
  group by 1,2 order by 1,2`);

const byDwellingType = (await rows(
  "select dwelling_type, count(*)::int n from nsw_sales_transactions_raw where is_residential group by 1 order by 1"
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
  (select count(*) from nsw_sales_summary)::int as summary_rows,
  (select count(*) from (select geography_id, reference_period, period_type, dwelling_type from nsw_sales_summary group by 1,2,3,4 having count(*)>1))::int as summary_duplicate_keys`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

db.closeSync();

// Every non-positive-priced residential row must be flagged, never silently
// used in stats.
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
  source_files: inventory.files.length,
  all_files_hashed: allHashed,
  raw_or_local_files_tracked_by_git: trackedData,
  pilot_lgas: ["Blacktown", "Parramatta", "Camden", "Wollongong", "Newcastle", "Shellharbour"],
  by_year_area_sample: byYearLga.slice(0, 30),
  by_year_area_full_row_count: byYearLga.length,
  by_dwelling_type: byDwellingType,
  checks,
  notes: [
    "Non-arm's-length/nominal-value transfers (price < $10,000) and IQR-based outliers per dwelling_type are flagged and excluded from median/mean/quartile statistics — never silently included, never dropped from the transaction table.",
    "geo_unmatched rows have neither a pilot suburb-name match nor a pilot postcode match despite being in the scanned files (e.g. a locality name variant) — excluded from marts, counted here for transparency.",
    "unknown_residential rows are preserved with a 'low' confidence label rather than forced into a specific dwelling type, per the no-PDF field-mapping limitation documented in the source manifest.",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# NSW Sales Local Store Report (Sprint 5 Pilot)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/nsw_sales.duckdb\` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

Pilot LGAs: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour
(suburb/postcode allow-list derived spatially from the local ASGS backbone —
see \`warehouse/metadata/nsw_sales_pilot_sals.json\` / \`_pilot_poas.json\`).

## Source files

${inventory.files.length} raw files hashed (all: ${allHashed ? "✅" : "❌"}).
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## Volumes

- Residential rows (pilot area): **${checks.residential_rows}** (of ${checks.all_rows} total matched rows;
  ${checks.all_rows - checks.residential_rows} excluded as non-residential)
- Summary rows built (monthly + annual, SAL + POA, by dwelling_type): **${checks.summary_rows}**

## By dwelling type

| dwelling_type | rows |
|---|---|
${byDwellingType.map((r) => `| ${r.dwelling_type} | ${r.n} |`).join("\n")}

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
console.log("  warehouse/reports/nsw_sales_local_store_report.json");
console.log("  warehouse/reports/nsw_sales_local_store_report.md");
if (!finalPassed) process.exit(1);
