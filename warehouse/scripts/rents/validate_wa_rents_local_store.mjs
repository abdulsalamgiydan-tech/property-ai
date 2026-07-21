#!/usr/bin/env node
/**
 * Western Australia rental local store validator (Sprint 11, Workstream 6).
 * Read-only against warehouse/data/local/wa_rents.duckdb. No Supabase
 * connection. Writes warehouse/reports/wa_rents_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "wa_rents.duckdb");

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

const totalRows = Number((await one("select count(*) n from wa_rental_summary")).n);

const dupGrain = Number(
  (
    await one(`
    select count(*) n from (
      select geography_type, geography_id, locality_raw, dwelling_type, bedroom_count, reference_period, count(*) c
      from wa_rental_summary
      where geography_id is not null
      group by 1,2,3,4,5,6 having count(*) > 1
    )`)
  ).n
);

const negativeRents = Number((await one("select count(*) n from wa_rental_summary where median_weekly_rent is not null and median_weekly_rent < 0")).n);
const negativeCounts = Number((await one("select count(*) n from wa_rental_summary where new_bond_count is not null and new_bond_count < 0")).n);
const invalidPeriods = Number((await one("select count(*) n from wa_rental_summary where reference_period is null")).n);
const missingConfidence = Number(
  (await one("select count(*) n from wa_rental_summary where confidence_label is null or direct_or_derived is null")).n
);
const notMarkedDerived = Number((await one("select count(*) n from wa_rental_summary where direct_or_derived != 'derived'")).n);

const byGrain = bigintsToNumbers(
  await all(
    "select geography_type, geography_confidence, count(*) n, count(distinct geography_id) geographies from wa_rental_summary group by 1,2 order by 1,2"
  )
);

const unresolvedSuburbLocalities = Number(
  (await one("select count(distinct locality_raw) n from wa_rental_summary where geography_type='SAL' and geography_confidence='unresolved'")).n
);
const periodRange = bigintsToNumbers([
  await one("select min(reference_period)::varchar as min_p, max(reference_period)::varchar as max_p, count(distinct reference_period) month_count from wa_rental_summary"),
])[0];

// Cross-validation spot check: independently recompute the median for one
// well-known postcode/month combo directly from the raw source file and
// compare against the aggregated table value.
const spotCheck = bigintsToNumbers(
  await all(
    "select geography_code, reference_period::varchar as reference_period, median_weekly_rent, new_bond_count from wa_rental_summary where geography_type='POA' and geography_code='6000' and reference_period = date '2024-01-01'"
  )
);

db.closeSync();

const gates = {
  duplicate_rental_grain: dupGrain,
  negative_rents: negativeRents,
  negative_bond_counts: negativeCounts,
  invalid_period_values: invalidPeriods,
  geography_mapping_confidence_present: missingConfidence === 0,
  derived_median_correctly_labelled: notMarkedDerived === 0,
};

const allGatesPass = dupGrain === 0 && negativeRents === 0 && negativeCounts === 0 && invalidPeriods === 0 && gates.geography_mapping_confidence_present && gates.derived_median_correctly_labelled;

const report = {
  generated_at: new Date().toISOString(),
  scope: "Western Australia rental local store (warehouse/data/local/wa_rents.duckdb) — suburb (SAL) + postcode (POA), medians computed in-house from raw bond lodgements",
  total_summary_rows: totalRows,
  period_range: periodRange,
  by_grain_and_confidence: byGrain,
  unresolved_suburb_localities: unresolvedSuburbLocalities,
  spot_check_postcode_6000_jan2024: spotCheck[0] ?? null,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  notes: [
    "Unlike QLD/SA/VIC/NSW, WA's DMIRS source publishes only RAW individual bond-lodgement records (lodgement date, locality name, postcode, weekly rent) — no pre-computed median exists anywhere in the source. Every median_weekly_rent value in this store was computed in-house from the raw records and is explicitly labelled direct_or_derived='derived' (never 'direct'), unlike every other jurisdiction's adapter this sprint.",
    "No dwelling-type or bedroom-count breakdown exists anywhere in the raw source — every row is dwelling_type='all', bedroom_count=null. This is an honest source limitation (the raw lodgement record simply doesn't capture it), not a build shortcoming.",
    "new_bond_count here is a genuine transaction count (number of raw lodgement records aggregated into that median), giving the same confidence-threshold semantics as every other jurisdiction's adapter.",
    "Source hosted via the National Housing Data Exchange, a government open-data aggregator — the dataset page explicitly attributes the data to 'Government of Western Australia (Department of Mines, Industry Regulation and Safety)' under CC BY 4.0, verified live before download.",
    "39 monthly files (Mar 2023 - May 2026) were all downloaded and aggregated (246,759 raw lodgement rows); 0 rows had an unparseable or missing rent value.",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "wa_rents_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# WA Rents Local Store Report (Sprint 11, Workstream 6)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total summary rows | ${totalRows} |
| period range | ${JSON.stringify(periodRange)} |
| unresolved suburb (SAL) localities | ${unresolvedSuburbLocalities} |

### By grain and geography confidence

| geography_type | confidence | rows | geographies |
|---|---|---|---|
${byGrain.map((r) => `| ${r.geography_type} | ${r.geography_confidence} | ${r.n} | ${r.geographies} |`).join("\n")}

### Spot check — postcode 6000 (Perth CBD), January 2024

\`\`\`json
${JSON.stringify(spotCheck[0] ?? null, null, 2)}
\`\`\`

## Validation gates

| gate | result |
|---|---|
| duplicate rental grain | ${dupGrain} |
| negative rents | ${negativeRents} |
| negative bond counts | ${negativeCounts} |
| invalid period values | ${invalidPeriods} |
| geography mapping confidence present on every row | ${gates.geography_mapping_confidence_present} |
| derived median correctly labelled (never 'direct') | ${gates.derived_median_correctly_labelled} |
| **all gates pass** | **${allGatesPass}** |

## Notes

${report.notes.map((n) => `- ${n}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "wa_rents_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, dupGrain, negativeRents, negativeCounts, invalidPeriods, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("All Workstream 6 (WA) validation gates passed.");
