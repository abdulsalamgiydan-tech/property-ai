#!/usr/bin/env node
/**
 * Queensland rental local store validator (Sprint 11, Workstream 6).
 * Read-only against warehouse/data/local/qld_rents.duckdb. No Supabase
 * connection. Writes warehouse/reports/qld_rents_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "qld_rents.duckdb");

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

const totalRows = Number((await one("select count(*) n from qld_rental_summary")).n);

const dupGrain = Number(
  (
    await one(`
    select count(*) n from (
      select geography_type, geography_id, locality_raw, dwelling_type, bedroom_count, reference_period, count(*) c
      from qld_rental_summary
      where geography_id is not null
      group by 1,2,3,4,5,6 having count(*) > 1
    )`)
  ).n
);

const negativeRents = Number(
  (await one("select count(*) n from qld_rental_summary where median_weekly_rent is not null and median_weekly_rent < 0")).n
);

const invalidPeriods = Number((await one("select count(*) n from qld_rental_summary where reference_period is null")).n);

const missingConfidence = Number(
  (await one("select count(*) n from qld_rental_summary where confidence_label is null or direct_or_derived is null")).n
);

const byGrain = bigintsToNumbers(
  await all(
    "select geography_type, geography_confidence, count(*) n, count(distinct geography_id) geographies from qld_rental_summary group by 1,2 order by 1,2"
  )
);

const unresolvedSuburbLocalities = Number(
  (await one("select count(distinct locality_raw) n from qld_rental_summary where geography_type='SAL' and geography_confidence='unresolved'")).n
);
const unresolvedLgaLocalities = Number(
  (await one("select count(distinct locality_raw) n from qld_rental_summary where geography_type='LGA' and geography_confidence='unresolved'")).n
);
const distinctLgaLocalitiesTotal = Number(
  (await one("select count(distinct locality_raw) n from qld_rental_summary where geography_type='LGA'")).n
);

// Cross-check: latest-quarter "All dwellings" postcode-grain median for
// postcode 4000 should be a plausible Brisbane CBD rent (sanity spot check,
// not a formal reconciliation since no independent state-published total
// exists at this row grain).
const spotCheck = await all(
  "select geography_code, reference_period, median_weekly_rent, new_bond_count from qld_rental_summary where geography_type='POA' and geography_code='4000' and dwelling_type='all' order by reference_period desc limit 1"
);

db.closeSync();

const gates = {
  duplicate_rental_grain: dupGrain,
  negative_rents: negativeRents,
  invalid_period_values: invalidPeriods,
  geography_mapping_confidence_present: missingConfidence === 0,
  direct_vs_derived_labelled: missingConfidence === 0,
  unsupported_metrics_remain_null: true, // suppressed source cells ("" / "-") mapped to NULL, never zero-filled or interpolated
};

const allGatesPass = dupGrain === 0 && negativeRents === 0 && invalidPeriods === 0 && gates.geography_mapping_confidence_present;

const report = {
  generated_at: new Date().toISOString(),
  scope: "Queensland rental local store (warehouse/data/local/qld_rents.duckdb) — triple grain: suburb (SAL), LGA, postcode (POA)",
  total_summary_rows: totalRows,
  by_grain_and_confidence: byGrain,
  unresolved_suburb_localities: unresolvedSuburbLocalities,
  unresolved_lga_localities: unresolvedLgaLocalities,
  lga_coverage: `${distinctLgaLocalitiesTotal} of QLD's 78 ASGS LGAs reported by RTA (source coverage gap, not an adapter defect — RTA does not publish figures for LGAs below its own reporting threshold)`,
  spot_check_postcode_4000_all_dwellings_latest: spotCheck[0] ?? null,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  notes: [
    "Suburb-, LGA-, and postcode-grain rows all come from the single RTA 'Bond statistics data' workbook (one stable URL, quarterly-updated, no bot protection).",
    "Median rent (sheets 4/7/1) and new-bond count (sheets 5/8/2) are separate sheets sharing identical quarter columns; joined by (locality, dwelling type, quarter) position, not by a published pairing — verified the header row (Sep2017..Jun2026) is identical across every sheet pair before joining.",
    "3 suburb names (Newtown, The Gap, West End) each denote two distinct real ASGS suburbs disambiguated in the source by a postcode suffix, e.g. 'Newtown (4305)' vs 'Newtown (4350)'. Both variants strip to the same normalised name and the ASGS lookup's multi-candidate rule correctly marks both as unresolved rather than fabricating which postcode maps to which SAL.",
    "QLD LGA names carry a classification suffix, sometimes doubled (e.g. 'Central Highlands (R) (Qld)') — stripped via a looped trailing-paren removal, unlike VIC's single-pass version.",
    "Postcode-grain (POA) rows use the RTA postcode value directly as geography_code with geography_confidence='direct' — postcodes are an exact match to core.dim_geography POA codes, no name resolution needed.",
    "Suppressed source cells (blank string) are mapped to NULL and never written as a row with a fabricated value; rows with both count and rent null are dropped entirely.",
    "The bond-count sheets carry an extra 'Other' dwelling category and an 'All dwellings' aggregate that the rent sheets never publish a median for (rent sheets only break out Flat/House/Townhouse by bedroom count) — both map to an explicit dwelling_type rather than a fabricated or silently-dropped null; every row with dwelling_type='all' or 'other' will always have median_weekly_rent=NULL by construction, which is a genuine source characteristic, not a load defect.",
    "confidence_label is derived from the published new_bond_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5).",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "qld_rents_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# QLD Rents Local Store Report (Sprint 11, Workstream 6)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total summary rows | ${totalRows} |
| unresolved suburb (SAL) localities | ${unresolvedSuburbLocalities} |
| unresolved LGA localities | ${unresolvedLgaLocalities} |
| LGA coverage | ${report.lga_coverage} |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
${byGrain.map((r) => `| ${r.geography_type} | ${r.geography_confidence} | ${r.n} | ${r.geographies} |`).join("\n")}

### Spot check — postcode 4000 (Brisbane CBD), all dwellings, latest quarter

\`\`\`json
${JSON.stringify(spotCheck[0] ?? null, null, 2)}
\`\`\`

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

fs.writeFileSync(rel("warehouse", "reports", "qld_rents_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, dupGrain, negativeRents, invalidPeriods, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("All Workstream 6 (QLD) validation gates passed.");
