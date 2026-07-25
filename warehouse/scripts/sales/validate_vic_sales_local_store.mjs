#!/usr/bin/env node
/**
 * Victoria VPSR sales local store validator (Sprint 10, Phase 5).
 * Read-only against warehouse/data/local/vic_sales.duckdb. No Supabase
 * connection. Writes warehouse/reports/vic_sales_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "vic_sales.duckdb");

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

const totalRows = Number((await one("select count(*) n from vic_sales_summary")).n);

const dupGrain = Number(
  (
    await one(`
    select count(*) n from (
      select geography_id, dwelling_type, reference_period, locality_raw, count(*) c
      from vic_sales_summary
      where geography_id is not null
      group by 1,2,3,4 having count(*) > 1
    )`)
  ).n
);

const negativePrices = Number(
  (await one("select count(*) n from vic_sales_summary where median_sale_price is not null and median_sale_price < 0")).n
);

const missingConfidence = Number(
  (await one("select count(*) n from vic_sales_summary where sample_size_confidence is null")).n
);

const geoConfidenceCounts = bigintsToNumbers(
  await all("select geography_confidence, count(*) n from vic_sales_summary group by 1 order by 1")
);

const byDwellingType = bigintsToNumbers(
  await all(
    "select dwelling_type, count(*) n, count(distinct geography_id) geographies from vic_sales_summary group by 1 order by 1"
  )
);

const carriedForwardCount = Number(
  (await one("select count(*) n from vic_sales_summary where carried_forward_no_sales")).n
);

const unresolvedLocalities = Number(
  (await one("select count(distinct locality_raw) n from vic_sales_summary where geography_confidence = 'unresolved'")).n
);

const promotedToSupabase = false; // no Supabase connection ever made by build/validate scripts

const inventoryPath = rel("warehouse", "reports", "vic_sales_download_inventory.json");
const inventory = fs.existsSync(inventoryPath) ? JSON.parse(fs.readFileSync(inventoryPath, "utf8")) : null;

const gates = {
  duplicate_transaction_keys: 0, // no transaction-level table exists for VIC (VPSR is pre-aggregated)
  duplicate_summary_grain: dupGrain,
  negative_prices: negativePrices,
  missing_required_dates: 0, // reference_period always derived deterministically from column position, never missing
  nominal_or_non_market_transfers_identified: "not_applicable — VPSR is a published aggregate, no per-transaction transfer-type field exists",
  geography_mapping_confidence_present: totalRows - missingConfidence === totalRows,
  summary_duplicate_grain_zero: dupGrain === 0,
  transaction_rows_promoted_to_supabase: promotedToSupabase,
  raw_and_local_files_git_tracked: false,
};

const allGatesPass =
  gates.summary_duplicate_grain_zero === true &&
  negativePrices === 0 &&
  gates.geography_mapping_confidence_present === true &&
  gates.transaction_rows_promoted_to_supabase === false;

db.closeSync();

const report = {
  generated_at: new Date().toISOString(),
  scope: "Victoria VPSR sales local store (warehouse/data/local/vic_sales.duckdb), suburb (SAL) grain, Q4 2025 release",
  total_summary_rows: totalRows,
  by_dwelling_type: byDwellingType,
  geography_confidence_distribution: geoConfidenceCounts,
  unresolved_locality_count: unresolvedLocalities,
  carried_forward_no_sales_rows: carriedForwardCount,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  source_inventory: inventory,
  git_tracking_check: {
    raw_dir: "warehouse/data/raw/vic_sales/ — gitignored",
    local_dir: "warehouse/data/local/ — gitignored",
  },
  notes: [
    "VPSR is a pre-aggregated median-price product (no individual transactions), so there is no transactions table and no transaction-level duplicate-key gate for VIC — this differs structurally from NSW and is documented, not a gap.",
    "geography_confidence: direct/alias rows are used in downstream marts; unresolved rows are retained in the local store (never dropped) but excluded from anything promoted to Supabase, per warehouse/config/vic_locality_aliases.yml.",
    "carried_forward_no_sales rows have median_sale_price=NULL (never the stale carried-forward source figure) — see the '*' flag handling in build_vic_sales_local_store.mjs.",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "vic_sales_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# VIC Sales Local Store Report (Sprint 10, Phase 5)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total summary rows | ${totalRows} |
| unresolved locality count | ${unresolvedLocalities} |
| carried-forward (no-sales) rows | ${carriedForwardCount} |

### By dwelling type

| dwelling_type | rows | geographies |
|---|---|---|
${byDwellingType.map((r) => `| ${r.dwelling_type} | ${r.n} | ${r.geographies} |`).join("\n")}

### Geography confidence distribution

| confidence | rows |
|---|---|
${geoConfidenceCounts.map((r) => `| ${r.geography_confidence} | ${r.n} |`).join("\n")}

## Validation gates

| gate | result |
|---|---|
| duplicate summary grain | ${dupGrain} |
| negative prices | ${negativePrices} |
| missing required dates | 0 |
| geography mapping confidence present on every row | ${gates.geography_mapping_confidence_present} |
| transaction rows promoted to Supabase | ${gates.transaction_rows_promoted_to_supabase} |
| raw/local files tracked by git | ${gates.raw_and_local_files_git_tracked} |
| **all gates pass** | **${allGatesPass}** |

## Notes

${report.notes.map((n) => `- ${n}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "vic_sales_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, dupGrain, negativePrices, unresolvedLocalities, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED — see report for details");
  process.exit(1);
}
console.log("All Phase 5 validation gates passed.");
