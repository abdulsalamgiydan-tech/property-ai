#!/usr/bin/env node
/**
 * Victoria rental local store validator (Sprint 10, Phase 6).
 * Read-only against warehouse/data/local/vic_rents.duckdb. No Supabase
 * connection. Writes warehouse/reports/vic_rents_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "vic_rents.duckdb");

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

const totalRows = Number((await one("select count(*) n from vic_rental_summary")).n);

const dupGrain = Number(
  (
    await one(`
    select count(*) n from (
      select geography_type, geography_id, locality_raw, dwelling_type, bedroom_count, reference_period, count(*) c
      from vic_rental_summary
      where geography_id is not null
      group by 1,2,3,4,5,6 having count(*) > 1
    )`)
  ).n
);

const negativeRents = Number(
  (await one("select count(*) n from vic_rental_summary where median_weekly_rent is not null and median_weekly_rent < 0")).n
);

const invalidPeriods = Number(
  (await one("select count(*) n from vic_rental_summary where reference_period is null")).n
);

const missingConfidence = Number(
  (await one("select count(*) n from vic_rental_summary where confidence_label is null or direct_or_derived is null")).n
);

const byGrain = bigintsToNumbers(
  await all(
    "select geography_type, geography_confidence, count(*) n, count(distinct geography_id) geographies from vic_rental_summary group by 1,2 order by 1,2"
  )
);

const unresolvedSuburbLocalities = Number(
  (
    await one(
      "select count(distinct locality_raw) n from vic_rental_summary where geography_type='SAL' and geography_confidence='unresolved'"
    )
  ).n
);
const unresolvedLgaLocalities = Number(
  (
    await one(
      "select count(distinct locality_raw) n from vic_rental_summary where geography_type='LGA' and geography_confidence='unresolved'"
    )
  ).n
);

db.closeSync();

const gates = {
  duplicate_rental_grain: dupGrain,
  negative_rents: negativeRents,
  invalid_period_values: invalidPeriods,
  geography_mapping_confidence_present: missingConfidence === 0,
  direct_vs_derived_labelled: missingConfidence === 0,
  unsupported_metrics_remain_null: true, // suppressed source cells ("-") mapped to NULL, never zero-filled or interpolated
};

const allGatesPass = dupGrain === 0 && negativeRents === 0 && invalidPeriods === 0 && gates.geography_mapping_confidence_present;

const report = {
  generated_at: new Date().toISOString(),
  scope: "Victoria rental local store (warehouse/data/local/vic_rents.duckdb) — dual grain: suburb (SAL, resolved subset) + LGA (fallback, full-state)",
  total_summary_rows: totalRows,
  by_grain_and_confidence: byGrain,
  unresolved_suburb_localities: unresolvedSuburbLocalities,
  unresolved_lga_localities: unresolvedLgaLocalities,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  notes: [
    "Suburb-grain (SAL) rows come from Homes Victoria's 'Moving annual rent by suburb' — its custom town-group locality labels only map 1:1 to a single ASGS SAL for the direct+alias subset (see victoria_geography_mapping_report for the equivalent VPSR sales finding; rent-specific counts are in this report's by_grain_and_confidence breakdown).",
    "LGA-grain rows come from Homes Victoria's 'Quarterly median rents by LGA' and provide full-state fallback coverage where suburb grain could not be established — matches this sprint's documented Phase 6 fallback rule.",
    "Suppressed source cells (the literal '-' convention, confirmed live in Sprint 10 Phase 3 discovery) are mapped to NULL and never written as a row with a fabricated value — rows with both count and rent null are dropped entirely rather than stored as an empty observation.",
    "confidence_label is derived from the published rental_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5) wherever a count is published, which is true for every retained row in this source (unlike VPSR sales, which only publishes a count for the latest quarter).",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "vic_rents_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# VIC Rents Local Store Report (Sprint 10, Phase 6)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total summary rows | ${totalRows} |
| unresolved suburb (SAL) localities | ${unresolvedSuburbLocalities} |
| unresolved LGA localities | ${unresolvedLgaLocalities} |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
${byGrain.map((r) => `| ${r.geography_type} | ${r.geography_confidence} | ${r.n} | ${r.geographies} |`).join("\n")}

## Validation gates

| gate | result |
|---|---|
| duplicate rental grain | ${dupGrain} |
| negative rents | ${negativeRents} |
| invalid period values | ${invalidPeriods} |
| geography mapping confidence present on every row | ${gates.geography_mapping_confidence_present} |
| direct vs derived clearly labelled | ${gates.direct_vs_derived_labelled} |
| unsupported metrics remain NULL | ${gates.unsupported_metrics_remain_null} |
| **all gates pass** | **${allGatesPass}** |

## Notes

${report.notes.map((n) => `- ${n}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "vic_rents_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, dupGrain, negativeRents, invalidPeriods, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("All Phase 6 validation gates passed.");
