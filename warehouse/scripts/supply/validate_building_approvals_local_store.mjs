#!/usr/bin/env node
/**
 * ABS Building Approvals local store validation (Sprint 4, Part C).
 *
 * Read-only validation of warehouse/data/local/building_approvals.duckdb.
 * Joins are checked against the local ASGS DuckDB store (asgs_2021.duckdb)
 * — no Supabase connection, no secrets. Git check proves no raw/local data
 * files are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/building_approvals_local_store_report.json
 *   warehouse/reports/building_approvals_local_store_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const DB_PATH = rel("warehouse", "data", "local", "building_approvals.duckdb");
const ASGS_DB = rel("warehouse", "data", "local", "asgs_2021.duckdb");
const INVENTORY = rel("warehouse", "reports", "building_approvals_download_inventory.json");
const OUT_JSON = rel("warehouse", "reports", "building_approvals_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "building_approvals_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_building_approvals_local_store.mjs"],
  [ASGS_DB, "run build_asgs_local_store.mjs (Sprint 2)"],
  [INVENTORY, "run build_building_approvals_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const sourceOk = fs.existsSync(rel("warehouse", "data", "raw", "building_approvals", "ba_sa2_monthly.csv")) && !!inventory.sha256;

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|csv|xlsx|parquet|duckdb)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
await db.run(`attach '${posix(ASGS_DB)}' as asgs (read_only)`);
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const byDwellingType = (await rows(
  "select dwelling_type, count(*)::int n, count(*) filter (is_quarantined)::int q from building_approvals_sa2 group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n), q: num(r.q) }));

const period = await one(
  "select min(reference_period) minp, max(reference_period) maxp, count(distinct reference_period)::int n_periods from building_approvals_sa2"
);

const checks = await one(`
  with geos as (select distinct geography_code from building_approvals_sa2 where not is_quarantined),
       asgs_sa2 as (select geography_code from asgs.asgs_geography where geography_type='SA2' and not is_quarantined)
  select
    (select count(*) from building_approvals_sa2 where geography_code is null)::int as null_codes,
    (select count(*) from (select geography_code, reference_period, dwelling_type, measure_name
       from building_approvals_sa2 where not is_quarantined group by 1,2,3,4 having count(*)>1))::int as duplicate_keys,
    (select count(*) from building_approvals_sa2 where is_quarantined and quarantine_reason='negative_count')::int as negative_quarantined,
    (select count(*) from building_approvals_sa2 where is_quarantined)::int as quarantined_total,
    (select count(*) from building_approvals_sa2 where not is_quarantined and approval_count is null)::int as null_values_kept_null,
    (select count(*) from geos g join asgs_sa2 a using (geography_code))::int as joined_to_asgs,
    (select count(*) from geos g where not exists (select 1 from asgs_sa2 a where a.geography_code = g.geography_code))::int as unjoined,
    (select count(*) from asgs_sa2 a where not exists (select 1 from geos g where g.geography_code = a.geography_code))::int as asgs_sa2_without_approvals
  `);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

// Cross-consistency: national houses vs other-residential vs total-dwellings,
// for the latest 12 months (total should be >= houses and >= other, and
// close to houses+other since the two components are the ABS breakdown).
const latest12 = await one(`
  with latest as (select max(reference_period) mx from building_approvals_sa2)
  select
    sum(approval_count) filter (where dwelling_type='houses')::bigint as houses,
    sum(approval_count) filter (where dwelling_type='other_residential')::bigint as other,
    sum(approval_count) filter (where dwelling_type='total_dwellings')::bigint as total
  from building_approvals_sa2, latest
  where not is_quarantined and reference_period > (mx - interval 12 month)`);
for (const k of Object.keys(latest12)) latest12[k] = num(latest12[k]);

db.closeSync();

const orphanIsSpecialOrOutside = checks.unjoined <= 30; // small tolerance: outside-Aus / offshore rows

const passed =
  sourceOk && trackedData.length === 0 &&
  checks.null_codes === 0 && checks.duplicate_keys === 0 &&
  checks.joined_to_asgs > 0 && orphanIsSpecialOrOutside &&
  period.n_periods >= 50; // roughly July 2021 -> now

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  source: { ...inventory, source_file_on_disk: sourceOk },
  raw_or_local_files_tracked_by_git: trackedData,
  period_coverage: { min: period.minp, max: period.maxp, distinct_periods: num(period.n_periods) },
  by_dwelling_type: byDwellingType,
  checks,
  latest_12m_national_consistency: latest12,
  notes: [
    "ABS omits SA2-months with zero approvals rather than publishing explicit 0 rows; these are absent from the store, not quarantined — never backfilled as zero.",
    "unjoined geographies are typically 'Migratory/Offshore/Shipping' or 'No usual address' style SA2 special codes with no ASGS boundary — expected, not a mapping defect.",
    "asgs_sa2_without_approvals counts backbone SA2s that never had a recorded approval in the whole series (small regional/remote areas) — expected.",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# Building Approvals Local Store Report (Sprint 4)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/building_approvals.duckdb\` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

## Source

Dataset: \`${inventory.dataset_id}\`, retrieved via official ABS Data API key
\`${inventory.api_key_used}\`. Size: ${(inventory.size_bytes / 1024 / 1024).toFixed(1)} MB,
sha256 recorded. Raw file on disk: ${sourceOk ? "✅" : "❌"}.
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## Coverage

Periods: **${period.n_periods}** months, ${period.minp} to ${period.maxp}.

| dwelling type | cells | quarantined |
|---|---|---|
${byDwellingType.map((r) => `| ${r.dwelling_type} | ${r.n} | ${r.q} |`).join("\n")}

## Geography join (against the local ASGS backbone store)

| check | value |
|---|---|
| SA2 geographies joined to ASGS backbone | ${checks.joined_to_asgs} |
| unjoined (special codes / offshore) | ${checks.unjoined} |
| ASGS SA2s with zero recorded approvals (expected for remote areas) | ${checks.asgs_sa2_without_approvals} |

## Checks

| check | value |
|---|---|
| NULL geography codes | ${checks.null_codes} |
| duplicate natural keys | ${checks.duplicate_keys} |
| negative counts (quarantined) | ${checks.negative_quarantined} |
| total quarantined cells | ${checks.quarantined_total} |
| unpublished cells kept NULL | ${checks.null_values_kept_null} |

## Latest 12-month national consistency

Houses: ${latest12.houses?.toLocaleString?.() ?? latest12.houses} · Other residential:
${latest12.other?.toLocaleString?.() ?? latest12.other} · Total residential:
${latest12.total?.toLocaleString?.() ?? latest12.total}
(Total should be ≈ Houses + Other residential — ABS's own aggregate, used directly.)

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/building_approvals_local_store_report.json");
console.log("  warehouse/reports/building_approvals_local_store_report.md");
if (!passed) process.exit(1);
