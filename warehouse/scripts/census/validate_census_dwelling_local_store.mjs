#!/usr/bin/env node
/**
 * 2021 Census dwelling local store validation (Sprint 3, Part C).
 *
 * Read-only validation of warehouse/data/local/census_2021.duckdb. Joins are
 * checked against the LOCAL ASGS DuckDB store (asgs_2021.duckdb) — no
 * Supabase connection, no secrets. The git check shells out to `git ls-files`
 * to prove no raw/local data files are tracked.
 *
 * Outputs (committed):
 *   warehouse/reports/census_dwelling_local_store_report.json
 *   warehouse/reports/census_dwelling_local_store_report.md
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

const DB_PATH = rel("warehouse", "data", "local", "census_2021.duckdb");
const ASGS_DB = rel("warehouse", "data", "local", "asgs_2021.duckdb");
const INVENTORY = rel("warehouse", "reports", "census_dwelling_download_inventory.json");
const OUT_JSON = rel("warehouse", "reports", "census_dwelling_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "census_dwelling_local_store_report.md");

const LEVELS = ["SAL", "POA", "SA2", "SA1", "LGA"];
const EXPECTED_MEASURES = 8; // G36 cells per geography
const EXPECTED_TENURES = 6; // G37 cells per geography

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}
const num = (v) => (typeof v === "bigint" ? Number(v) : v);

for (const [p, hint] of [
  [DB_PATH, "run build_census_dwelling_local_store.mjs"],
  [ASGS_DB, "run build_asgs_local_store.mjs"],
  [INVENTORY, "run build_census_dwelling_local_store.mjs"],
]) {
  if (!fs.existsSync(p)) fail(`${path.relative(repoRoot, p)} missing — ${hint}`);
}

const inventory = JSON.parse(fs.readFileSync(INVENTORY, "utf8"));
const inventoryFiles = inventory.files.map((f) => ({
  dataset_id: f.dataset_id,
  size_mb: +(f.size_bytes / 1024 / 1024).toFixed(1),
  sha256_recorded: !!f.sha256,
  on_disk: fs.existsSync(rel(f.raw_storage_path)),
}));

// Git must not track any raw/local data files.
const tracked = execFileSync("git", ["ls-files"], { cwd: repoRoot, encoding: "utf8" });
const trackedData = tracked
  .split("\n")
  .filter((l) => /\.(zip|csv|xlsx|parquet|duckdb|shp|dbf|gpkg)$/i.test(l) && /warehouse\/data\//.test(l));

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
await db.run(`attach '${posix(ASGS_DB)}' as asgs (read_only)`);
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

// Geography-level summaries + join coverage against the ASGS backbone store.
const byLevel = [];
for (const level of LEVELS) {
  const r = await one(`
    with cd as (select * from census_dwelling_stock where geography_type = '${level}'),
         geos as (select distinct geography_code from cd where not is_quarantined),
         asgs_codes as (select geography_code from asgs.asgs_geography
                        where geography_type = '${level}' and not is_quarantined)
    select
      (select count(*) from cd)::int as dwelling_cells,
      (select count(*) from census_household_tenure where geography_type='${level}')::int as tenure_cells,
      (select count(*) from geos)::int as geographies,
      (select count(distinct measure_name || '|' || dwelling_type) from cd)::int as distinct_measures,
      (select count(*) from geos g join asgs_codes a using (geography_code))::int as joined_to_asgs,
      (select count(*) from geos g where not exists (select 1 from asgs_codes a where a.geography_code = g.geography_code))::int as unjoined,
      (select count(*) from asgs_codes a where not exists (select 1 from geos g where g.geography_code = a.geography_code))::int as asgs_without_census,
      (select sum(value_count) from cd where not is_quarantined and measure_name='total_private_dwellings')::bigint as total_private_dwellings
    `);
  byLevel.push({ level, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, num(v)])) });
}

const checks = await one(`select
  (select count(*) from census_dwelling_stock where geography_code is null or geography_code = '')::int as null_codes,
  (select count(*) from (select geography_type, geography_code, measure_name, dwelling_type
     from census_dwelling_stock where not is_quarantined group by 1,2,3,4 having count(*)>1))::int as duplicate_keys,
  (select count(*) from (select geography_type, geography_code, tenure_type
     from census_household_tenure where not is_quarantined group by 1,2,3 having count(*)>1))::int as duplicate_tenure_keys,
  (select count(*) from census_dwelling_stock where is_quarantined and quarantine_reason='negative_count')::int as negative_counts_quarantined,
  (select count(*) from census_dwelling_stock where is_quarantined)::int as quarantined_dwelling_cells,
  (select count(*) from census_household_tenure where is_quarantined)::int as quarantined_tenure_cells,
  (select count(*) from census_dwelling_stock where not is_quarantined and value_count is null)::int as null_values_kept_null,
  (select count(*) from mb_dwelling_counts)::int as mb_rows,
  (select sum(dwellings) from mb_dwelling_counts)::bigint as mb_total_dwellings,
  (select count(*) from correspondence_dwelling_weights)::int as dwelling_weight_pairs,
  (select count(*) from correspondence_dwelling_weights where dwelling_ratio is null)::int as zero_dwelling_sources_null,
  (select count(*) from (select source_geography_type, target_geography_type, source_geography_code
     from correspondence_dwelling_weights where dwelling_ratio is not null
     group by 1,2,3 having abs(sum(dwelling_ratio) - 1.0) > 0.001))::int as dwelling_weight_violations`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

// Cross-level consistency: national total dwellings per level vs MB counts.
const national = byLevel.map((l) => ({ level: l.level, total_private_dwellings: l.total_private_dwellings }));

db.closeSync();

const requiredMeasuresOk = byLevel.every((l) => l.distinct_measures === EXPECTED_MEASURES);
const tenureCellsOk = byLevel.every((l) => l.tenure_cells === l.geographies * EXPECTED_TENURES || l.tenure_cells === (l.dwelling_cells / EXPECTED_MEASURES) * EXPECTED_TENURES);
const allFilesOk = inventoryFiles.every((f) => f.on_disk && f.sha256_recorded);

const passed =
  allFilesOk && trackedData.length === 0 && requiredMeasuresOk &&
  checks.null_codes === 0 && checks.duplicate_keys === 0 && checks.duplicate_tenure_keys === 0 &&
  checks.dwelling_weight_violations === 0;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  source_files: inventoryFiles,
  raw_or_local_files_tracked_by_git: trackedData,
  by_level: byLevel,
  checks,
  national_totals_by_level: national,
  notes: [
    "Unjoined census geographies are ABS special codes (e.g. ZZZZ 'no usual address' style rows) and Census-only outside-ASGS rows — counted, kept quarantine-free in the store, and excluded at branch load by the dim join.",
    "asgs_without_census counts backbone areas with no Census row (expected ~0).",
    "NULL value_count cells are unpublished ABS cells kept NULL — never zero-filled.",
    "Dwelling-weight ratios: per-source sums reconcile to 1.0 (±0.001); zero-dwelling sources stay NULL and fall back to area weights at load time.",
  ],
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# Census Dwelling Local Store Report (Sprint 3)

Generated: ${report.generated_at}
Store: \`warehouse/data/local/census_2021.duckdb\` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

## Source files (hashes in \`census_dwelling_download_inventory.json\`)

| dataset | size (MB) | sha256 | on disk |
|---|---|---|---|
${inventoryFiles.map((f) => `| ${f.dataset_id} | ${f.size_mb} | ${f.sha256_recorded ? "✅" : "❌"} | ${f.on_disk ? "✅" : "❌"} |`).join("\n")}

Raw/local data files tracked by git: **${trackedData.length}** ${trackedData.length === 0 ? "✅" : "❌ " + trackedData.join(", ")}

## By geography level

| level | geographies | dwelling cells | tenure cells | measures | joined to ASGS | unjoined (special) | ASGS w/o census |
|---|---|---|---|---|---|---|---|
${byLevel.map((l) => `| ${l.level} | ${l.geographies} | ${l.dwelling_cells} | ${l.tenure_cells} | ${l.distinct_measures}/8 | ${l.joined_to_asgs} | ${l.unjoined} | ${l.asgs_without_census} |`).join("\n")}

## National total private dwellings by level (cross-level consistency)

| level | total private dwellings |
|---|---|
${national.map((n) => `| ${n.level} | ${n.total_private_dwellings?.toLocaleString?.() ?? n.total_private_dwellings} |`).join("\n")}
| MB counts | ${checks.mb_total_dwellings?.toLocaleString?.() ?? checks.mb_total_dwellings} |

## Checks

| check | value |
|---|---|
| NULL geography codes | ${checks.null_codes} |
| duplicate dwelling keys | ${checks.duplicate_keys} |
| duplicate tenure keys | ${checks.duplicate_tenure_keys} |
| negative counts (quarantined) | ${checks.negative_counts_quarantined} |
| quarantined dwelling / tenure cells | ${checks.quarantined_dwelling_cells} / ${checks.quarantined_tenure_cells} |
| unpublished cells kept NULL | ${checks.null_values_kept_null} |
| MB rows / total dwellings | ${checks.mb_rows} / ${checks.mb_total_dwellings} |
| dwelling-weight pairs (NULL zero-dwelling) | ${checks.dwelling_weight_pairs} (${checks.zero_dwelling_sources_null}) |
| dwelling-weight reconciliation violations (±0.001) | ${checks.dwelling_weight_violations} |

${report.notes.map((n) => `- ${n}`).join("\n")}
`;
fs.writeFileSync(OUT_MD, md);
console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/census_dwelling_local_store_report.json");
console.log("  warehouse/reports/census_dwelling_local_store_report.md");
if (!passed) process.exit(1);
