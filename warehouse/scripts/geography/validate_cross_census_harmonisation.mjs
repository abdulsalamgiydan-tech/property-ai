#!/usr/bin/env node
/**
 * Cross-Census harmonisation validator (Sprint 11, Workstream 4).
 * Joins the local converted-2016-population store against the branch's
 * LIVE 2021 population (read-only query) to compute a real, validated
 * 2016->2021 population growth figure per geography — the gap left NULL
 * since Sprint 9. Read-only against the branch; writes no data.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

process.loadEnvFile(".env.local");
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

const DB_PATH = rel("warehouse", "data", "local", "cross_census_harmonisation.duckdb");
const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
async function all(sql) {
  const reader = await db.runAndReadAll(sql);
  return reader.getRowObjects();
}
function bigintsToNumbers(rows) {
  return rows.map((r) => {
    const out = {};
    for (const [k, v] of Object.entries(r)) out[k] = typeof v === "bigint" ? Number(v) : v;
    return out;
  });
}

const salConverted = bigintsToNumbers(await all(`select sal_code_2021, sal_name_2021, converted_population_2016, contributing_rows from sal_population_2016_converted`));
const poaConverted = bigintsToNumbers(await all(`select poa_code_2021, poa_name_2021, converted_population_2016, contributing_rows from poa_population_2016_converted`));
db.closeSync();
console.log(`Loaded ${salConverted.length} SAL + ${poaConverted.length} POA converted 2016 population rows from local store.`);

const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const salLive = await client.query(`select geography_id, geography_code, total_population from mart.suburb_demographic_profile_2021 where total_population is not null`);
const poaLive = await client.query(`select geography_id, geography_code, total_population from mart.postcode_demographic_profile_2021 where total_population is not null`);
await client.end();
console.log(`Fetched ${salLive.rows.length} SAL + ${poaLive.rows.length} POA live 2021 population rows from branch (read-only).`);

function stripPrefix(code, prefix) {
  return code.startsWith(prefix) ? code.slice(prefix.length) : code;
}

const salLiveByCode = new Map(salLive.rows.map((r) => [stripPrefix(r.geography_code, "SAL"), r]));
const poaLiveByCode = new Map(poaLive.rows.map((r) => [stripPrefix(r.geography_code, "POA"), r]));

const salResults = [];
for (const row of salConverted) {
  const live = salLiveByCode.get(String(row.sal_code_2021));
  if (!live) continue;
  const pop2016 = row.converted_population_2016;
  const pop2021 = live.total_population;
  const growthPct = pop2016 > 0 ? ((pop2021 - pop2016) / pop2016) * 100 : null;
  // Confidence: low population bases produce unstable percentages —
  // require at least 50 people in 2016 to publish a growth rate,
  // matching this project's established small-cell caution (Sprint 9).
  const confidence = pop2016 >= 50 ? "medium" : "insufficient";
  salResults.push({
    geography_id: live.geography_id,
    geography_code: live.geography_code,
    population_2016_converted: Math.round(pop2016),
    population_2021: pop2021,
    growth_pct: growthPct !== null && pop2016 >= 50 ? Number(growthPct.toFixed(2)) : null,
    confidence,
    contributing_correspondence_rows: row.contributing_rows,
  });
}

const poaResults = [];
for (const row of poaConverted) {
  const live = poaLiveByCode.get(String(row.poa_code_2021));
  if (!live) continue;
  const pop2016 = row.converted_population_2016;
  const pop2021 = live.total_population;
  const growthPct = pop2016 > 0 ? ((pop2021 - pop2016) / pop2016) * 100 : null;
  const confidence = pop2016 >= 50 ? "medium" : "insufficient";
  poaResults.push({
    geography_id: live.geography_id,
    geography_code: live.geography_code,
    population_2016_converted: Math.round(pop2016),
    population_2021: pop2021,
    growth_pct: growthPct !== null && pop2016 >= 50 ? Number(growthPct.toFixed(2)) : null,
    confidence,
    contributing_correspondence_rows: row.contributing_rows,
  });
}

const salWithGrowth = salResults.filter((r) => r.growth_pct !== null).length;
const poaWithGrowth = poaResults.filter((r) => r.growth_pct !== null).length;
const salSuppressed = salResults.length - salWithGrowth;
const poaSuppressed = poaResults.length - poaWithGrowth;

console.log(`SAL: ${salResults.length} geographies matched, ${salWithGrowth} have a publishable growth rate, ${salSuppressed} suppressed (population_2016 < 50, insufficient confidence).`);
console.log(`POA: ${poaResults.length} geographies matched, ${poaWithGrowth} have a publishable growth rate, ${poaSuppressed} suppressed.`);

// Spot-check proof: a handful of real, named geographies.
const spotCheck = salResults
  .filter((r) => r.population_2021 > 5000)
  .sort((a, b) => b.population_2021 - a.population_2021)
  .slice(0, 5);
console.log("Spot check (5 largest SAL geographies):", JSON.stringify(spotCheck, null, 2));

const report = {
  generated_at: new Date().toISOString(),
  method: "warehouse/docs/CROSS_CENSUS_HARMONISATION_METHOD.md",
  sal: {
    total_matched: salResults.length,
    with_publishable_growth_rate: salWithGrowth,
    suppressed_insufficient_population_base: salSuppressed,
  },
  poa: {
    total_matched: poaResults.length,
    with_publishable_growth_rate: poaWithGrowth,
    suppressed_insufficient_population_base: poaSuppressed,
  },
  spot_check_5_largest_sal: spotCheck,
  validation_gates: {
    source_target_reconciliation_pct_sal: "see cross_census_harmonisation_local_build.json (100.00%)",
    source_target_reconciliation_pct_poa: "see cross_census_harmonisation_local_build.json (100.00%)",
    low_confidence_growth_suppressed_to_null: true,
    no_duplicate_final_grain: "one row per geography_id, enforced by GROUP BY in the build script",
  },
};
fs.writeFileSync(rel("warehouse", "reports", "cross_census_harmonisation_report.json"), JSON.stringify(report, null, 2));

const md = `# Cross-Census Harmonisation Report (Sprint 11, Workstream 4)

Generated: ${report.generated_at}

## Method

Population-weighted ABS official correspondence (\`RATIO_FROM_TO\`),
restricted to \`Good\`/\`Acceptable\` quality rows (\`Poor\` excluded).
Growth rates are only published where the converted 2016 population base
is at least 50 people — below that, small-number volatility makes a
percentage misleading, so it stays NULL (matches this project's
established small-cell caution from Sprint 9).

Full methodology: \`warehouse/docs/CROSS_CENSUS_HARMONISATION_METHOD.md\`.

## Results

| geography | matched | publishable growth rate | suppressed (low base) |
|---|---|---|---|
| SAL (suburb) | ${salResults.length} | ${salWithGrowth} | ${salSuppressed} |
| POA (postcode) | ${poaResults.length} | ${poaWithGrowth} | ${poaSuppressed} |

## Reconciliation (from the local build step)

Both SAL and POA conversions reconcile to **100.00%** of the true national
2016 Census population (23,401,518 / 23,401,861 respectively) — see
\`cross_census_harmonisation_local_build.json\`.

## Spot check (5 largest SAL geographies by 2021 population)

${spotCheck.map((r) => `- **${r.geography_code}**: 2016 (converted) ${r.population_2016_converted.toLocaleString()} -> 2021 ${r.population_2021.toLocaleString()} (${r.growth_pct}%, confidence: ${r.confidence})`).join("\n")}

## Status

Computed and validated locally, read-only against the branch. **Not yet
promoted** to \`mart.suburb_demographic_profile_2021\` /
\`mart.postcode_demographic_profile_2021\`'s existing (currently all-NULL)
\`population_2016\` / \`population_growth_2016_2021_pct\` columns — that
promotion is a follow-up branch-load step, applying the exact same
UPSERT-only, no-DELETE pattern established throughout this project.
`;
fs.writeFileSync(rel("warehouse", "reports", "cross_census_harmonisation_report.md"), md);
console.log("\nReports written. No Supabase write made — read-only validation only.");
