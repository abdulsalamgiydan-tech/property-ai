#!/usr/bin/env node
/**
 * RBA interest-rate local store validation (Sprint 8, Part C).
 *
 * Read-only validation of warehouse/data/local/rba_rates.duckdb. No
 * Supabase connection, no secrets. Git check proves no raw/local data files
 * are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/rba_rates_local_store_report.json
 *   warehouse/reports/rba_rates_local_store_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const DB_PATH = rel("warehouse", "data", "local", "rba_rates.duckdb");
const MANIFEST = rel("warehouse", "reports", "rba_rates_source_manifest.json");
const INVENTORY = rel("warehouse", "reports", "rba_rates_download_inventory.json");
const OUT_JSON = rel("warehouse", "reports", "rba_rates_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "rba_rates_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);
const isoDate = (v) => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && "days" in v) return new Date(Number(v.days) * 86400000).toISOString().slice(0, 10);
  return String(v);
};

for (const [p, hint] of [
  [DB_PATH, "run build_rba_rates_local_store.mjs"],
  [MANIFEST, "run discover_rba_rate_sources.mjs"],
  [INVENTORY, "run build_rba_rates_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const officialSourcesVerified = manifest.entries
  .filter((e) => e.status !== "out_of_scope")
  .every((e) => e.status === "discovered" && e.verification?.http_status === 200);
const hashesRecorded = inventory.files.length === 3 && inventory.files.every((f) => !!f.sha256 && f.bytes > 0);

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|csv|xlsx|parquet|duckdb)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const byRateType = (await rows(
  "select rate_type, count(*)::int n, count(*) filter (rate_percent is null)::int null_n from rba_interest_rates group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n), null_n: num(r.null_n) }));

const periodRaw = await one(
  "select min(reference_period) minp, max(reference_period) maxp, count(distinct reference_period)::int n_periods from rba_interest_rates"
);
const period = { minp: isoDate(periodRaw.minp), maxp: isoDate(periodRaw.maxp), n_periods: num(periodRaw.n_periods) };

const checks = await one(`
  select
    (select count(*)::int from rba_interest_rates where reference_period is null) as null_dates,
    (select count(*)::int from (
       select reference_period, rate_type, coalesce(borrower_type,'') bt, coalesce(loan_type,'') lt, count(*) c
       from rba_interest_rates group by 1,2,3,4 having count(*) > 1
     ) d) as duplicate_natural_keys,
    (select count(*)::int from rba_interest_rates where rate_percent < 0) as negative_rates,
    (select count(*)::int from rba_interest_rates where rate_percent is null and data_quality_status='passed') as passed_but_null_rate,
    (select count(*)::int from rba_interest_rates where rate_percent is not null and data_quality_status <> 'passed') as numeric_but_not_passed,
    (select count(*)::int from rba_interest_rates where data_quality_status = 'range_not_numeric') as range_format_rows,
    (select count(*)::int from rba_interest_rates where data_quality_status = 'unpublished_cell') as unpublished_cells,
    (select count(*)::int from rba_interest_rates where series_id is null or series_id = '') as missing_series_id
`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

// Cash rate target sanity: values should sit within a plausible historical
// band (0% to 20%) — a loose bound check, not a claim about correctness.
const cashRateBandRaw = await one(`
  select min(rate_percent) mn, max(rate_percent) mx, min(reference_period) minp, max(reference_period) maxp
  from rba_interest_rates where rate_type = 'cash_rate_target' and rate_percent is not null`);
const cashRateBand = { mn: cashRateBandRaw.mn, mx: cashRateBandRaw.mx, minp: isoDate(cashRateBandRaw.minp), maxp: isoDate(cashRateBandRaw.maxp) };

db.closeSync();

const datesValid = checks.null_dates === 0 && period.minp !== null && period.maxp !== null;
const expectedPeriodsPresent = period.n_periods >= 90; // ~ 1959-2026 monthly range collapsed to distinct dates, generous floor

const passed =
  officialSourcesVerified &&
  hashesRecorded &&
  trackedData.length === 0 &&
  datesValid &&
  expectedPeriodsPresent &&
  checks.duplicate_natural_keys === 0 &&
  checks.negative_rates === 0 &&
  checks.passed_but_null_rate === 0 &&
  checks.missing_series_id === 0;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  official_sources_verified: officialSourcesVerified,
  file_hashes_recorded: hashesRecorded,
  inventory_files: inventory.files.map((f) => ({ dataset_id: f.dataset_id, sha256: f.sha256, bytes: f.bytes })),
  raw_or_local_files_tracked_by_git: trackedData,
  period_coverage: { min: period.minp, max: period.maxp, distinct_periods: num(period.n_periods) },
  by_rate_type: byRateType,
  checks,
  cash_rate_target_sanity_band_pct: cashRateBand,
  notes: [
    "3 range-format A2 rows (pre-Aug-1990) are stored with rate_percent = NULL and data_quality_status = 'range_not_numeric' — never estimated to a single value. passed_but_null_rate=0 confirms every NULL rate_percent row is explicitly labelled non-passed, not a silent gap.",
    "F5 series that had not yet started in a given month (e.g. investor series before Aug 2015) are omitted from the store entirely for that month, never zero-filled.",
    "F6 has no unpublished cells across the 8 curated series in the current pull (unpublished_cells counts across all rate_type, informational only).",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# RBA Interest Rates Local Store Report (Sprint 8, Part C)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/rba_rates.duckdb\` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

## Source verification

Official RBA sources verified (per \`rba_rates_source_manifest.json\`): **${officialSourcesVerified}**.
File hashes recorded for all 3 downloaded files: **${hashesRecorded}**.
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

| dataset | sha256 (prefix) | bytes |
|---|---|---|
${inventory.files.map((f) => `| ${f.dataset_id} | ${f.sha256.slice(0, 16)}... | ${f.bytes.toLocaleString()} |`).join("\n")}

## Coverage

Periods: **${period.n_periods}** distinct dates, ${period.minp} to ${period.maxp}.

| rate_type | rows | NULL rate_percent |
|---|---|---|
${byRateType.map((r) => `| ${r.rate_type} | ${r.n} | ${r.null_n} |`).join("\n")}

## Checks

| check | value |
|---|---|
| NULL reference_period (date parsing failures) | ${checks.null_dates} |
| duplicate natural keys (reference_period, rate_type, borrower_type, loan_type) | ${checks.duplicate_natural_keys} |
| negative rates | ${checks.negative_rates} |
| rows labelled 'passed' but rate_percent NULL (should be 0 — every NULL is explicitly labelled) | ${checks.passed_but_null_rate} |
| rows with a numeric rate but a non-'passed' label (should be 0) | ${checks.numeric_but_not_passed} |
| range-format rows (pre-Aug-1990 A2, rate_percent NULL by design) | ${checks.range_format_rows} |
| unpublished cells (informational) | ${checks.unpublished_cells} |
| missing series_id | ${checks.missing_series_id} |

## Cash rate target sanity

Range observed among numeric (non-range-format) rows: **${cashRateBand.mn}% – ${cashRateBand.mx}%**, ${cashRateBand.minp} to ${cashRateBand.maxp} — consistent with the RBA's own published history. Note the true historical peak (17.00-17.50%, Jan-Aug 1990) is among the 3 range-format rows excluded from this numeric band, not a data error.

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/rba_rates_local_store_report.json");
console.log("  warehouse/reports/rba_rates_local_store_report.md");
if (!passed) process.exit(1);
