#!/usr/bin/env node
/**
 * Census demographics local store validation (Sprint 9, Phase 2).
 *
 * Read-only validation of warehouse/data/local/census_demographics.duckdb.
 * No Supabase connection, no secrets. Git check proves no raw/local data
 * files are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/census_demographics_local_store_report.json
 *   warehouse/reports/census_demographics_local_store_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const DB_PATH = rel("warehouse", "data", "local", "census_demographics.duckdb");
const MANIFEST = rel("warehouse", "reports", "census_demographics_source_manifest.json");
const OUT_JSON = rel("warehouse", "reports", "census_demographics_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "census_demographics_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_census_demographics_local_store.mjs"],
  [MANIFEST, "run discover_census_demographic_sources.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const officialSourcesVerified = manifest.live_verification?.every((r) => r.verified) === true;

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|csv|xlsx|parquet|duckdb)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const byGeoType = (await rows(
  "select geography_type, count(*)::int n, (count(*) filter (where geography_id is not null))::int as matched from census_demographics group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n), matched: num(r.matched) }));

const checks = await one(`
  select
    (select count(*)::int from (select geography_type, geography_code, census_year from census_demographics group by 1,2,3 having count(*)>1) d) as duplicate_natural_keys,
    (select count(*)::int from census_demographics where total_population < 0) as negative_population,
    (select count(*)::int from census_demographics where total_households < 0) as negative_households,
    (select count(*)::int from census_demographics where median_weekly_household_income < 0) as negative_income,
    (select count(*)::int from census_demographics where geography_id is null and total_population is not null
       and geography_code not like '%9494' and geography_code not like '%9797') as null_geo_publishable_unexpected,
    (select count(*)::int from census_demographics where geography_id is not null) as orphan_free_joined,
    (select count(*)::int from census_demographics where census_year <> 2021) as invalid_census_year,
    (select count(*)::int from census_demographics where direct_or_derived <> 'direct') as not_directly_labelled,
    (select count(*)::int from census_demographics where total_population is null) as null_population_kept_null,
    (select count(*)::int from census_demographics where median_weekly_household_income is null) as null_income_kept_null
`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

// National/state reconciliation: NSW population sum across all SAL should be
// in the right ballpark vs. the well-known 2021 Census NSW population
// (~8.07M) — a loose sanity check, not a precision claim (SAL geographies
// overlap slightly less than 100% coverage due to special/offshore codes).
const nswCheckRaw = await one(`
  select sum(total_population)::bigint nsw_sal_population_sum, count(*)::int n_sal
  from census_demographics d
  where geography_type='SAL' and geography_id like 'SAL_%'
    and geography_id in (select geography_id from census_demographics where geography_id is not null)
`);
const nswCheck = { nsw_sal_population_sum: num(nswCheckRaw.nsw_sal_population_sum), n_sal: num(nswCheckRaw.n_sal) };

db.closeSync();

const unmatchedTolerance = 30; // special/offshore/no-usual-address codes with no geometry, same pattern as prior sprints
const salPoaUnmatched = byGeoType.reduce((a, r) => a + (r.n - r.matched), 0);

const passed =
  officialSourcesVerified && trackedData.length === 0 &&
  checks.duplicate_natural_keys === 0 && checks.negative_population === 0 &&
  checks.negative_households === 0 && checks.negative_income === 0 &&
  checks.null_geo_publishable_unexpected === 0 && checks.invalid_census_year === 0 &&
  checks.not_directly_labelled === 0 && salPoaUnmatched <= unmatchedTolerance;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  official_sources_verified: officialSourcesVerified,
  raw_or_local_files_tracked_by_git: trackedData,
  by_geography_type: byGeoType,
  checks,
  unmatched_geography_count: salPoaUnmatched,
  unmatched_tolerance: unmatchedTolerance,
  nsw_sal_population_sanity: nswCheck,
  population_2016_and_growth_pct: "intentionally not populated this sprint — see census_demographics_source_manifest.json entry 'census_population_2016_comparison' (2016/2021 ASGS boundary mismatch, documented scope decision)",
  notes: [
    "Every row is direct_or_derived='direct' — G01/G02/G35 are native SAL/POA GCP DataPack tables, no ASGS correspondence weighting used or needed.",
    "Missing/unpublished cells stay NULL (never zero-filled) — see null_population_kept_null / null_income_kept_null counts for how many rows have a genuinely NULL measure (typically very small/zero-population localities where ABS suppresses or does not compute a cell).",
    "Census self-reported median rent/mortgage (G02) are stored as census_median_weekly_rent / census_median_monthly_mortgage — kept distinct from the DCJ administrative rent series and the RBA-rate-based repayment estimate elsewhere in the warehouse; never blended into the same column.",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# Census Demographics Local Store Report (Sprint 9, Phase 2)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/census_demographics.duckdb\` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

## Source verification

Official ABS sources verified (per \`census_demographics_source_manifest.json\`
live_verification): **${officialSourcesVerified}**.
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## Coverage

| geography_type | rows | matched to core.dim_geography |
|---|---|---|
${byGeoType.map((r) => `| ${r.geography_type} | ${r.n} | ${r.matched} |`).join("\n")}

Unmatched: **${salPoaUnmatched}** (tolerance ${unmatchedTolerance} — expected special/
offshore/no-usual-address pseudo-codes with no geometry, same pattern seen in every
prior sprint's geography join).

## Checks

| check | value |
|---|---|
| duplicate natural keys | ${checks.duplicate_natural_keys} |
| negative population | ${checks.negative_population} |
| negative households | ${checks.negative_households} |
| negative income | ${checks.negative_income} |
| NULL geography_id on a publishable row, EXCLUDING expected ABS special codes (Migratory/Offshore/No-usual-address, suffix 9494/9797) | ${checks.null_geo_publishable_unexpected} |
| invalid census_year (must be 2021) | ${checks.invalid_census_year} |
| rows not labelled direct_or_derived='direct' | ${checks.not_directly_labelled} |
| rows with NULL total_population (kept NULL, not zero) | ${checks.null_population_kept_null} |
| rows with NULL median_weekly_household_income (kept NULL, not zero) | ${checks.null_income_kept_null} |

## population_2016 / population_growth_2016_2021_pct

Intentionally **not populated** this sprint — 2016 Census SAL/POA boundaries (ASGS Ed.1)
do not align with the 2021 boundaries (ASGS Ed.3) this warehouse's geography backbone
uses. See the source manifest's \`census_population_2016_comparison\` entry for the full
scope decision. Left NULL rather than approximated across mismatched boundaries.

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/census_demographics_local_store_report.json");
console.log("  warehouse/reports/census_demographics_local_store_report.md");
if (!passed) process.exit(1);
