#!/usr/bin/env node
/**
 * NSW rents local store validation — FULL STATE (Sprint 7, Part B).
 *
 * Read-only validation of warehouse/data/local/nsw_rents.duckdb (full-state
 * build) against the local ASGS backbone store. No Supabase connection, no
 * secrets.
 *
 * Outputs (committed):
 *   warehouse/reports/nsw_rents_full_state_local_store_report.json
 *   warehouse/reports/nsw_rents_full_state_local_store_report.md
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

const DB_PATH = rel("warehouse", "data", "local", "nsw_rents.duckdb");
const ASGS_DB = rel("warehouse", "data", "local", "asgs_2021.duckdb");
const INVENTORY = rel("warehouse", "reports", "nsw_rental_bonds_download_inventory.json");
const OUT_JSON = rel("warehouse", "reports", "nsw_rents_full_state_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "nsw_rents_full_state_local_store_report.md");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_nsw_rents_full_state_local_store.mjs"],
  [ASGS_DB, "run build_asgs_local_store.mjs (Sprint 2)"],
  [INVENTORY, "run build_nsw_rents_full_state_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}
const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const allHashed = inventory.files.every((f) => !!f.sha256);

const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(xlsx|xls|zip|parquet|duckdb|csv)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
await db.run(`attach '${posix(ASGS_DB)}' as asgs (read_only)`);
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const byQuarter = (await rows(
  "select cast(reference_period as varchar) as quarter, count(*)::int n from nsw_rental_summary group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n) }));

const byGeoType = (await rows(
  "select geography_type, count(*)::int n from nsw_rental_summary group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n) }));

const byDwellingType = (await rows(
  "select dwelling_type, count(*)::int n from nsw_rental_summary group by 1 order by 1"
)).map((r) => ({ ...r, n: num(r.n) }));

const bedroomCoverage = await one(`
  select count(*) filter (bedroom_count is not null)::int with_bedroom,
         count(*) filter (bedroom_count is null)::int total_only
  from nsw_rental_summary`);

const checks = await one(`
  with poa_lookup as (select geography_code from asgs.asgs_geography where geography_type='POA' and not is_quarantined),
       lga_lookup as (select geography_code from asgs.asgs_geography where geography_type='LGA' and not is_quarantined and state_code='1')
  select
    (select count(*) from nsw_rental_summary where geography_id is null)::int as null_geo_ids,
    (select count(*) from nsw_rental_summary where geography_code is null or geography_code = '')::int as null_codes,
    (select count(*) from (select geography_id, reference_period, dwelling_type, bedroom_count
       from nsw_rental_summary group by 1,2,3,4 having count(*)>1))::int as duplicate_keys,
    (select count(*) from nsw_rental_summary where median_weekly_rent is not null and median_weekly_rent <= 0)::int as non_positive_rent,
    (select count(*) from nsw_rental_summary where median_weekly_rent is null)::int as null_median_rent,
    (select count(*) from nsw_rental_summary where rental_count is null)::int as null_rental_count,
    (select count(*) from nsw_rental_summary where geography_type='POA'
       and not exists (select 1 from poa_lookup p where p.geography_code = nsw_rental_summary.geography_code))::int as poa_unmatched_to_asgs,
    (select count(*) from nsw_rental_summary where geography_type='LGA'
       and not exists (select 1 from lga_lookup l where l.geography_code = nsw_rental_summary.geography_code))::int as lga_unmatched_to_asgs,
    (select count(distinct geography_code) from nsw_rental_summary where geography_type='LGA')::int as distinct_lgas_covered,
    (select count(distinct geography_code) from nsw_rental_summary where geography_type='POA')::int as distinct_poas_covered,
    (select count(*) from nsw_rental_summary where dwelling_type='unknown_residential')::int as unknown_dwelling_type
  `);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

db.closeSync();

const passed =
  allHashed && trackedData.length === 0 &&
  checks.null_geo_ids === 0 && checks.duplicate_keys === 0 &&
  checks.non_positive_rent === 0 && checks.poa_unmatched_to_asgs === 0 && checks.lga_unmatched_to_asgs === 0 &&
  byQuarter.length > 0;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  scope: "full_state_nsw",
  source_files: inventory.files.length,
  all_files_hashed: allHashed,
  raw_or_local_files_tracked_by_git: trackedData,
  quarters_loaded: byQuarter.length,
  by_quarter: byQuarter,
  by_geography_type: byGeoType,
  by_dwelling_type: byDwellingType,
  bedroom_breakdown_coverage: { with_bedroom: num(bedroomCoverage.with_bedroom), total_only: num(bedroomCoverage.total_only) },
  checks,
  notes: [
    "median_weekly_rent is NULL for DCJ-suppressed cells (<=10 bonds lodged, or <=30 lodged flagged for caution and also treated as NULL here) — never zero-filled or estimated.",
    "Dwelling type mapping is a direct 1:1 preservation of DCJ's own categories (House/Flat-Unit/Townhouse/Other/Total), high confidence except 'Other' (medium) and any unmapped value ('unknown_residential', low).",
    "POA geography join is an exact 4-digit postcode match against the full national ASGS POA list (DCJ's own report is inherently NSW-scoped, so no out-of-state code appears in the source data).",
    "LGA geography join is an exact name match against all 129 NSW LGA names (filtered by state_code to avoid cross-state name collisions).",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# NSW Rents Full-State Local Store Report (Sprint 7)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/nsw_rents.duckdb\` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

Scope: all of NSW (129 LGAs, full postcode coverage).
Source: NSW DCJ Rent and Sales Report, quarterly LGA + Postcode tables.

## Source files

${inventory.files.length} raw files hashed (all: ${allHashed ? "✅" : "❌"}).
Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## Coverage

Quarters loaded: **${byQuarter.length}** (${byQuarter.map((q) => q.quarter).join(", ")})
LGAs covered: **${checks.distinct_lgas_covered}** / 129. Postcodes covered: **${checks.distinct_poas_covered}**

| geography type | rows |
|---|---|
${byGeoType.map((r) => `| ${r.geography_type} | ${r.n} |`).join("\n")}

## By dwelling type

| dwelling_type | rows |
|---|---|
${byDwellingType.map((r) => `| ${r.dwelling_type} | ${r.n} |`).join("\n")}

Bedroom breakdown: ${report.bedroom_breakdown_coverage.with_bedroom} rows with a specific bedroom count,
${report.bedroom_breakdown_coverage.total_only} "Total" (all bedrooms) rows.

## Checks

| check | value |
|---|---|
| NULL geography ids | ${checks.null_geo_ids} |
| NULL geography codes | ${checks.null_codes} |
| duplicate natural keys | ${checks.duplicate_keys} |
| non-positive rent (should never occur — DCJ never publishes negative/zero) | ${checks.non_positive_rent} |
| NULL median rent (suppressed cells) | ${checks.null_median_rent} / ${byQuarter.reduce((s, q) => s + q.n, 0)} |
| NULL rental count | ${checks.null_rental_count} |
| POA codes not found in the ASGS backbone | ${checks.poa_unmatched_to_asgs} |
| LGA codes not found in the ASGS backbone | ${checks.lga_unmatched_to_asgs} |
| unknown_residential dwelling type (preserved, not forced) | ${checks.unknown_dwelling_type} |

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/nsw_rents_full_state_local_store_report.json");
console.log("  warehouse/reports/nsw_rents_full_state_local_store_report.md");
if (!passed) process.exit(1);
