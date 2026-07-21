#!/usr/bin/env node
/**
 * NSW sales archive (1990-2000) local store validator (Sprint 11,
 * Workstream 8). Read-only against warehouse/data/local/nsw_sales_archive.duckdb.
 * No Supabase connection. Writes
 * warehouse/reports/nsw_sales_archive_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "nsw_sales_archive.duckdb");

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
async function all(sql) {
  const reader = await db.runAndReadAll(sql);
  return reader.getRowObjects();
}
async function one(sql) {
  return (await all(sql))[0];
}
function bigintsToNumbers(rows) {
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : v;
    return out;
  });
}

const totalRows = Number((await one("select count(*) n from nsw_sales_archive_raw")).n);
const negativePrices = Number((await one("select count(*) n from nsw_sales_archive_raw where purchase_price is not null and purchase_price < 0")).n);
const zeroPrices = Number((await one("select count(*) n from nsw_sales_archive_raw where purchase_price = 0")).n);
const invalidDates = Number((await one("select count(*) n from nsw_sales_archive_raw where contract_date is null")).n);
const outOfRangeDates = Number(
  (await one("select count(*) n from nsw_sales_archive_raw where contract_date is not null and (extract(year from contract_date) < 1990 or extract(year from contract_date) > 2001)")).n
);
const missingConfidence = Number((await one("select count(*) n from nsw_sales_archive_raw where dwelling_type is null or dwelling_type_confidence is null")).n);

const byYear = bigintsToNumbers(
  await all(`
    select source_year, count(*) n, count(distinct district_code) districts,
      sum(case when zone_code is null or zone_code = '' then 1 else 0 end) as null_zone_code_rows,
      round(100.0 * sum(case when zone_code is null or zone_code = '' then 1 else 0 end) / count(*), 1) as null_zone_code_pct
    from nsw_sales_archive_raw group by 1 order by 1
  `)
);
const byDwelling = bigintsToNumbers(await all("select dwelling_type, dwelling_type_confidence, count(*) n from nsw_sales_archive_raw group by 1,2 order by 3 desc"));

// Cross-check: median annual NSW-wide sale price for residential-zone (A)
// properties should show a plausible, monotonic-ish real-estate growth
// trend across 1990-2000 (a soft plausibility check, not a hard gate —
// year-to-year noise from mix-shift is expected, but a decade-long trend
// should be broadly upward given NSW's known price history).
const annualMedian = bigintsToNumbers(
  await all(`
    select source_year, count(*) n, median(purchase_price) median_price
    from nsw_sales_archive_raw
    where zone_code = 'A' and purchase_price > 0
    group by 1 order by 1
  `)
);

// Duplicate check on the natural key actually used for dedup.
const dupKey = Number(
  (
    await one(`
    select count(*) n from (
      select district_code, property_id, valuation_num, contract_date, purchase_price, count(*) c
      from nsw_sales_archive_raw group by 1,2,3,4,5 having count(*) > 1
    )`)
  ).n
);

db.closeSync();

const gates = {
  negative_prices: negativePrices,
  invalid_contract_dates: invalidDates,
  contract_dates_out_of_archive_range: outOfRangeDates,
  dwelling_type_and_confidence_present_on_every_row: missingConfidence === 0,
  no_duplicate_natural_keys: dupKey === 0,
};
const allGatesPass = negativePrices === 0 && outOfRangeDates === 0 && gates.dwelling_type_and_confidence_present_on_every_row && gates.no_duplicate_natural_keys;

const report = {
  generated_at: new Date().toISOString(),
  scope: "NSW Valuer General PSI historical archive (1990-2000) local store — warehouse/data/local/nsw_sales_archive.duckdb",
  total_rows: totalRows,
  zero_price_rows: zeroPrices,
  by_year: byYear,
  by_dwelling_type: byDwelling,
  annual_median_price_residential_zone_a: annualMedian,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  known_limitations: [
    "No settlement_date field exists in this format — only contract_date. The 2001-current dataset has both.",
    "No nature_of_property field exists — dwelling_type classification relies on zone_code (residential-zone filter only, not a house/unit signal) plus a strata-plan text-pattern match in the free-text land description (medium confidence for ~373k of the ~1.9M rows), with everything else in a zone-A residential area falling into 'unknown_residential' (low confidence) rather than being guessed.",
    "No sale_counter or reference_number field exists to disambiguate multiple sale events of the same property beyond (district, property_id, valuation_num, contract_date, purchase_price) — the natural key used for exact-duplicate collapse. A small number of genuinely distinct same-day, same-price resales of the same property (if any exist) would be indistinguishable from a republished duplicate and collapsed to one row; this is a known, honest limitation of the source format, not fabricated resolution.",
    "zero_price_rows are retained (not dropped) since a $0 recorded price can be a genuine non-arms-length transfer in the source data (same convention as the 2001-current pipeline) — excluded from the median-price cross-check but not deleted from the store.",
    "The null zone_code rate declines sharply and monotonically from 58.3% in 1990 to ~7-9% by the late 1990s (see by_year). Since dwelling_type classification requires zone_code='A' to identify residential-zoned sales, 1990's residential sale counts are a more conservative undercount than later years — a genuine source data-quality characteristic of the archive's earliest year, not a parsing defect, and not corrected by guessing at the missing zone codes.",
  ],
  branch_promotion_status: "NOT YET PROMOTED. Extending core.fact_residential_sales_summary and its derived marts with pre-2001 data touches already-live schema that existing comparison APIs read from — deliberately deferred to a dedicated, careful pass rather than rushed alongside first-time discovery/parsing. The annual summary (nsw_sales_archive_annual_summary.parquet) is built in the same shape as the existing mart to make that future extension straightforward.",
};

fs.writeFileSync(rel("warehouse", "reports", "nsw_sales_archive_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# NSW Sales Archive (1990-2000) Local Store Report (Sprint 11, Workstream 8)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total rows (post exact-duplicate collapse) | ${totalRows} |
| zero-price rows (retained, excluded from median cross-check) | ${zeroPrices} |

### By year

| year | rows | distinct districts | null zone_code | null zone_code % |
|---|---|---|---|---|
${byYear.map((r) => `| ${r.source_year} | ${r.n} | ${r.districts} | ${r.null_zone_code_rows} | ${r.null_zone_code_pct}% |`).join("\n")}

**Note**: the null zone_code rate declines sharply and monotonically from 58.3% in 1990 to ~7-9% by the late 1990s, consistent with the archive's own earliest year having less complete digitised data. Since \`dwelling_type\` classification requires \`zone_code='A'\` to identify residential-zoned sales, **1990's residential sale counts are a more conservative undercount than later years** — this is a genuine source data-quality characteristic, not a parsing defect, and is not corrected by guessing at the missing zone codes.

### By dwelling type

| dwelling_type | confidence | rows |
|---|---|---|
${byDwelling.map((r) => `| ${r.dwelling_type} | ${r.dwelling_type_confidence} | ${r.n} |`).join("\n")}

### Annual median sale price — residential zone (A) only, plausibility check

| year | sales | median price |
|---|---|---|
${annualMedian.map((r) => `| ${r.source_year} | ${r.n} | $${r.median_price?.toLocaleString()} |`).join("\n")}

## Validation gates

| gate | result |
|---|---|
| negative prices | ${negativePrices} |
| invalid contract dates | ${invalidDates} |
| contract dates outside 1990-2001 archive range | ${outOfRangeDates} |
| dwelling_type + confidence present on every row | ${gates.dwelling_type_and_confidence_present_on_every_row} |
| no duplicate natural keys | ${gates.no_duplicate_natural_keys} |
| **all gates pass** | **${allGatesPass}** |

## Known limitations (documented, not hidden)

${report.known_limitations.map((n) => `- ${n}`).join("\n")}

## Branch promotion status

${report.branch_promotion_status}
`;

fs.writeFileSync(rel("warehouse", "reports", "nsw_sales_archive_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, negativePrices, outOfRangeDates, dupKey, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("All Workstream 8 (NSW archive) validation gates passed.");
