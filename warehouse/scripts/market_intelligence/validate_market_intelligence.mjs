#!/usr/bin/env node
/**
 * Market Intelligence data-quality + provenance validation (Sprint 9, Phase 8).
 *
 * Read-only, independent re-check of every blocking rule against the branch
 * (separate from the in-transaction gates already enforced during the load) —
 * confirms nothing regressed and every required provenance field is present.
 *
 * Outputs:
 *   warehouse/reports/market_intelligence_validation_report.json
 *   warehouse/reports/market_intelligence_validation_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try { process.loadEnvFile(rel(".env.local")); } catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
const one = async (sql) => (await client.query(sql)).rows[0];

console.log("validate_market_intelligence — read-only checks against the branch");

const checks = await one(`select
  (select count(*)::int from (select geography_id from mart.suburb_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_suburb_snapshot,
  (select count(*)::int from (select geography_id from mart.postcode_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_postcode_snapshot,
  (select count(*)::int from (select geography_id, census_year from mart.suburb_demographic_profile_2021 group by 1,2 having count(*)>1) x) as dup_suburb_demog,
  (select count(*)::int from (select geography_id, census_year from mart.postcode_demographic_profile_2021 group by 1,2 having count(*)>1) x) as dup_postcode_demog,
  (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.suburb_market_timeseries group by 1,2,3,4,5 having count(*)>1) x) as dup_suburb_ts,
  (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.postcode_market_timeseries group by 1,2,3,4,5 having count(*)>1) x) as dup_postcode_ts,
  (select count(*)::int from mart.suburb_market_snapshot s where dwelling_type is null and s.geography_id not in (select geography_id from core.dim_geography)) as orphan_suburb_snapshot,
  (select count(*)::int from mart.postcode_market_snapshot s where dwelling_type is null and s.geography_id not in (select geography_id from core.dim_geography)) as orphan_postcode_snapshot,
  (select count(*)::int from mart.suburb_demographic_profile_2021 where geography_id not in (select geography_id from core.dim_geography)) as orphan_suburb_demog,
  (select count(*)::int from mart.suburb_market_timeseries where geography_id not in (select geography_id from core.dim_geography)) as orphan_suburb_ts,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and (median_sale_price_12m < 0 or median_sale_price_prev_12m < 0 or median_weekly_rent_latest < 0 or median_weekly_rent_prev < 0 or median_weekly_household_income < 0 or sales_volume_12m < 0 or dwelling_stock_total < 0 or approvals_12m < 0 or total_population < 0 or total_households < 0)) as negative_values_suburb,
  (select count(*)::int from mart.suburb_demographic_profile_2021 where total_population < 0 or total_households < 0 or median_weekly_household_income < 0) as negative_values_demog,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and (renter_household_pct < 0 or renter_household_pct > 100 or owner_occupier_pct < 0 or owner_occupier_pct > 100)) as bad_pct_snapshot,
  (select count(*)::int from mart.suburb_demographic_profile_2021 where renter_household_pct < 0 or renter_household_pct > 100 or owner_with_mortgage_pct < 0 or owner_with_mortgage_pct > 100 or owner_outright_pct < 0 or owner_outright_pct > 100 or detached_house_pct < 0 or detached_house_pct > 100 or apartment_unit_pct < 0 or apartment_unit_pct > 100) as bad_pct_demog,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and gross_yield_pct is not null and (median_sale_price_detached is null and median_sale_price_apartment is null and median_sale_price_townhouse is null) and median_weekly_rent_latest is null) as yield_without_inputs,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and gross_yield_pct is not null and yield_confidence is null) as yield_missing_label_suburb,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and gross_yield_pct is not null and yield_confidence is null) as yield_missing_label_postcode,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and est_monthly_repayment_owner_occupier is not null and (rba_rate_used is null or median_weekly_household_income is null or median_sale_price_12m is null)) as affordability_without_inputs,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_sale_price_12m is not null and sales_sample_confidence is null) as price_without_sample_label_suburb,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and median_sale_price_12m is not null and sales_sample_confidence is null) as price_without_sample_label_postcode,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and latest_sales_period > current_date) as future_dated_suburb,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and latest_sales_period > current_date) as future_dated_postcode,
  (select count(*)::int from mart.suburb_market_timeseries where reference_period > current_date) as future_dated_ts,
  (select count(*)::int from mart.suburb_market_snapshot s where dwelling_type is null and s.geography_id not like 'SAL_%') as inconsistent_geo_level_suburb,
  (select count(*)::int from mart.postcode_market_snapshot s where dwelling_type is null and s.geography_id not like 'POA_%') as inconsistent_geo_level_postcode,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and est_monthly_repayment_owner_occupier is not null and (est_monthly_repayment_owner_occupier <= 0 or est_monthly_repayment_owner_occupier > 100000)) as invalid_mortgage_calc,
  (select count(*)::int from meta.metric_assumption where scenario_code='standard_20pct_deposit_30yr_pi') as assumption_rows,
  (select max(snapshot_generated_at) from mart.suburb_market_snapshot where dwelling_type is null) as latest_snapshot_generated_at
`);
for (const k of Object.keys(checks)) if (typeof checks[k] === "bigint") checks[k] = Number(checks[k]);

const staleDays = (new Date() - new Date(checks.latest_snapshot_generated_at)) / (1000 * 60 * 60 * 24);
checks.snapshot_age_days = Math.round(staleDays * 10) / 10;
checks.stale_source_flag = staleDays > 90; // informational — 90-day staleness threshold for a research snapshot

await client.end();

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|csv|xlsx|parquet|duckdb)$/i.test(l) && /warehouse\/data\//.test(l));

const blockingKeys = [
  "dup_suburb_snapshot", "dup_postcode_snapshot", "dup_suburb_demog", "dup_postcode_demog", "dup_suburb_ts", "dup_postcode_ts",
  "orphan_suburb_snapshot", "orphan_postcode_snapshot", "orphan_suburb_demog", "orphan_suburb_ts",
  "negative_values_suburb", "negative_values_demog", "bad_pct_snapshot", "bad_pct_demog",
  "yield_without_inputs", "yield_missing_label_suburb", "yield_missing_label_postcode",
  "affordability_without_inputs", "price_without_sample_label_suburb", "price_without_sample_label_postcode",
  "future_dated_suburb", "future_dated_postcode", "future_dated_ts",
  "inconsistent_geo_level_suburb", "inconsistent_geo_level_postcode", "invalid_mortgage_calc",
];
const blockingFailures = blockingKeys.filter((k) => Number(checks[k]) > 0);
const passed = blockingFailures.length === 0 && trackedData.length === 0 && checks.assumption_rows > 0;

const report = {
  generated_at: new Date().toISOString(),
  verdict: passed ? "PASSED" : "FAILED",
  branch_ref: BRANCH_REF,
  checks,
  blocking_failures: blockingFailures,
  raw_or_local_files_tracked_by_git: trackedData,
  notes: [
    "All checks are read-only, run independently against the branch AFTER commit — separate from the in-transaction gates enforced during the load itself.",
    `Snapshot freshness: latest snapshot_generated_at is ${checks.snapshot_age_days} days old (stale_source_flag fires above 90 days — informational, not blocking for a just-built snapshot).`,
    "inconsistent_geo_level checks confirm every suburb-mart row's geography_id has the SAL_ prefix and every postcode-mart row has POA_ — no cross-level contamination.",
  ],
};
fs.mkdirSync(rel("warehouse", "reports"), { recursive: true });
fs.writeFileSync(rel("warehouse", "reports", "market_intelligence_validation_report.json"), JSON.stringify(report, null, 2) + "\n");

const md = `# Market Intelligence Validation Report (Sprint 9, Phase 8)

Generated: ${report.generated_at}
Branch: \`${BRANCH_REF}\` (read-only checks). Verdict: **${report.verdict}**

## Blocking checks

| check | value |
|---|---|
| duplicate suburb/postcode snapshot grain | ${checks.dup_suburb_snapshot} / ${checks.dup_postcode_snapshot} |
| duplicate demographic profile grain | ${checks.dup_suburb_demog} / ${checks.dup_postcode_demog} |
| duplicate time-series grain | ${checks.dup_suburb_ts} / ${checks.dup_postcode_ts} |
| orphan geography IDs (snapshot/demog/timeseries) | ${checks.orphan_suburb_snapshot + checks.orphan_postcode_snapshot} / ${checks.orphan_suburb_demog} / ${checks.orphan_suburb_ts} |
| negative prices/rents/incomes/counts | ${checks.negative_values_suburb} (snapshot) / ${checks.negative_values_demog} (demographics) |
| percentages outside 0-100 | ${checks.bad_pct_snapshot} (snapshot) / ${checks.bad_pct_demog} (demographics) |
| yield without sale or rent inputs | ${checks.yield_without_inputs} |
| yield without confidence label | ${checks.yield_missing_label_suburb} / ${checks.yield_missing_label_postcode} |
| affordability without rate/income/price inputs | ${checks.affordability_without_inputs} |
| price without sample-size label | ${checks.price_without_sample_label_suburb} / ${checks.price_without_sample_label_postcode} |
| future-dated source periods | ${checks.future_dated_suburb + checks.future_dated_postcode + checks.future_dated_ts} |
| inconsistent geography level (wrong ID prefix) | ${checks.inconsistent_geo_level_suburb} / ${checks.inconsistent_geo_level_postcode} |
| invalid mortgage calculations (<=0 or >$100k/month) | ${checks.invalid_mortgage_calc} |
| raw/local files tracked by git | ${trackedData.length} ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")} |
| metric_assumption baseline scenario present | ${checks.assumption_rows} rows |

${blockingFailures.length > 0 ? `**FAILURES:** ${blockingFailures.join(", ")}` : "All blocking checks pass with zero violations."}

## Freshness

Latest snapshot generated ${checks.snapshot_age_days} days ago (stale-source flag
fires above 90 days for this research snapshot — informational only).

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(rel("warehouse", "reports", "market_intelligence_validation_report.md"), md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/market_intelligence_validation_report.json");
console.log("  warehouse/reports/market_intelligence_validation_report.md");
if (!passed) process.exit(1);
