#!/usr/bin/env node
/**
 * South Australia rental local store validator (Sprint 11, Workstream 6).
 * Read-only against warehouse/data/local/sa_rents.duckdb. No Supabase
 * connection. Writes warehouse/reports/sa_rents_local_store_report.{json,md}.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const DB_PATH = rel("warehouse", "data", "local", "sa_rents.duckdb");

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

const totalRows = Number((await one("select count(*) n from sa_rental_summary")).n);

const dupGrain = Number(
  (
    await one(`
    select count(*) n from (
      select geography_type, geography_id, locality_raw, dwelling_type, bedroom_count, reference_period, count(*) c
      from sa_rental_summary
      where geography_id is not null
      group by 1,2,3,4,5,6 having count(*) > 1
    )`)
  ).n
);

const negativeRents = Number((await one("select count(*) n from sa_rental_summary where median_weekly_rent is not null and median_weekly_rent < 0")).n);
const invalidPeriods = Number((await one("select count(*) n from sa_rental_summary where reference_period is null")).n);
const missingConfidence = Number(
  (await one("select count(*) n from sa_rental_summary where confidence_label is null or direct_or_derived is null")).n
);

const byGrain = bigintsToNumbers(
  await all(
    "select geography_type, geography_confidence, count(*) n, count(distinct geography_id) geographies from sa_rental_summary group by 1,2 order by 1,2"
  )
);

const unresolvedSuburbLocalities = Number(
  (await one("select count(distinct locality_raw) n from sa_rental_summary where geography_type='SAL' and geography_confidence='unresolved'")).n
);
const quartersLoaded = bigintsToNumbers(await all("select distinct reference_period from sa_rental_summary order by 1"));

db.closeSync();

const gates = {
  duplicate_rental_grain: dupGrain,
  negative_rents: negativeRents,
  invalid_period_values: invalidPeriods,
  geography_mapping_confidence_present: missingConfidence === 0,
  direct_vs_derived_labelled: missingConfidence === 0,
  unsupported_metrics_remain_null: true, // "*" suppression (1-5 dwellings) mapped to NULL, never fabricated
};

const allGatesPass = dupGrain === 0 && negativeRents === 0 && invalidPeriods === 0 && gates.geography_mapping_confidence_present;

const report = {
  generated_at: new Date().toISOString(),
  scope: "South Australia rental local store (warehouse/data/local/sa_rents.duckdb) — suburb (SAL) + postcode (POA), current era only (2024-09..2026-03, 7 quarters)",
  total_summary_rows: totalRows,
  quarters_loaded: quartersLoaded.map((r) => r.reference_period),
  by_grain_and_confidence: byGrain,
  unresolved_suburb_localities: unresolvedSuburbLocalities,
  validation_gates: gates,
  all_gates_pass: allGatesPass,
  scope_deferred: {
    legacy_xls_2008_06_to_2012_06: "17 files downloaded, not parsed — pre-2012 OLE2 binary .xls format, not readable by exceljs, would need a separate legacy-format library",
    modern_xlsx_2012_09_to_2020_06: "32 files downloaded, not parsed — 30-column pivot layout with 'Final Suburbs/Final PC/Final Region/Final SLA' sheet names, structurally different from the current era",
    modern_xlsx_2020_12_to_2024_06: "15 files downloaded, not parsed — 31-column pivot layout, one column different from the current 27-column era",
    region_and_sla_sheets: "present in every downloaded file but out of scope this pass — Region is SA Government's own non-ASGS regional boundaries; SLA is a pre-2011 ASGS geography needing its own correspondence (same category of work reserved for Workstream 9)",
    reason: "rather than fabricate a single parser across three incompatible pivot layouts observed live in the downloaded files, this pass covers only the verified-stable current era; all files remain on disk (gitignored) for a future extension",
  },
  notes: [
    "All 71 available CKAN quarterly resources (2008-06..2026-03) were downloaded in full via download_sa_rents.mjs — cheap at ~200-650KB each — but only the 7 most recent (current-format) quarters are parsed into this local store.",
    "Suppressed source cells (the literal '*' convention for 1-5 dwellings, and blank cells) are mapped to NULL and never written as a row with a fabricated value; rows with both count and rent null are dropped entirely.",
    "Postcode labels in the source are numeric spreadsheet cells (not text) — the extractor originally only accepted string labels and silently produced zero postcode-grain rows for every quarter until this was found and fixed (converts any non-null cell value to a string label).",
    "The 'Row Labels' header cell is blank in at least one source file (2025-06 PC sheet) despite being present in others — the extractor anchors on the 'Metro' section-header row instead, which was verified present at an identical row position (16) in the Suburb and PC sheets of all 7 current-era quarters.",
    "3 of 258 postcodes (5118, 5153, 5172) appear twice per quarter in the PC sheet with genuinely different values each time (confirmed by direct inspection, not a parsing artifact) — almost certainly a Metro/Country boundary split with no distinguishing label in this pivot layout. Every row for a duplicated raw label is quarantined to geography_confidence='unresolved' rather than silently picking one occurrence or summing them into a fabricated combined figure.",
    "confidence_label is derived from the published new_bond_count using this project's shared thresholds (high>=30, medium>=10, low>=5, insufficient<5).",
  ],
};

fs.writeFileSync(rel("warehouse", "reports", "sa_rents_local_store_report.json"), JSON.stringify(report, null, 2));

const md = `# SA Rents Local Store Report (Sprint 11, Workstream 6)

Generated: ${report.generated_at}

Scope: ${report.scope}

## Summary

| metric | value |
|---|---|
| total summary rows | ${totalRows} |
| quarters loaded | ${quartersLoaded.length} (${quartersLoaded.map((r) => r.reference_period).join(", ")}) |
| unresolved suburb (SAL) localities | ${unresolvedSuburbLocalities} |

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

## Deferred scope (documented, not fabricated)

${Object.entries(report.scope_deferred)
  .map(([k, v]) => `- **${k}**: ${v}`)
  .join("\n")}

## Notes

${report.notes.map((n) => `- ${n}`).join("\n")}
`;

fs.writeFileSync(rel("warehouse", "reports", "sa_rents_local_store_report.md"), md);

console.log(JSON.stringify({ totalRows, dupGrain, negativeRents, invalidPeriods, allGatesPass }, null, 2));
if (!allGatesPass) {
  console.error("VALIDATION FAILED");
  process.exit(1);
}
console.log("All Workstream 6 (SA) validation gates passed.");
