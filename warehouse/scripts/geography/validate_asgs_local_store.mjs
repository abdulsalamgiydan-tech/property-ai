#!/usr/bin/env node
/**
 * ASGS local store validation (cost-saving strategy).
 *
 * Read-only validation of warehouse/data/local/asgs_2021.duckdb against the
 * approved ASGS Edition 3 expectations. No Supabase connection, no network
 * (spatial extension already installed by the build), no secrets.
 *
 * Outputs (committed):
 *   warehouse/reports/asgs_local_store_report.json
 *   warehouse/reports/asgs_local_store_report.md
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const DB_PATH = rel("warehouse", "data", "local", "asgs_2021.duckdb");
const OUT_JSON = rel("warehouse", "reports", "asgs_local_store_report.json");
const OUT_MD = rel("warehouse", "reports", "asgs_local_store_report.md");

// ABS-published feature counts (same snapshot the branch load validated against).
const EXPECTED_GEO = { STATE: 10, GCCSA: 35, SA4: 108, SA3: 359, SA2: 2473, SA1: 61845, LGA: 566, SAL: 15353, POA: 2644 };
const EXPECTED_CORR = { "SA1->SAL": 73131, "SA1->POA": 65318, "SA1->LGA": 62372, "SA2->SAL": 17496, "SA2->POA": 5904, "SA2->LGA": 3097 };
const WEIGHT_TOL = 0.001;

if (!fs.existsSync(DB_PATH)) {
  console.error("ERROR: local store missing — run build_asgs_local_store.mjs first");
  process.exit(1);
}

const instance = await DuckDBInstance.create(DB_PATH, { access_mode: "READ_ONLY" });
const db = await instance.connect();
await db.run("LOAD spatial;");
const rows = async (sql) => (await db.runAndReadAll(sql)).getRowObjects();
const one = async (sql) => (await rows(sql))[0];

const num = (v) => (typeof v === "bigint" ? Number(v) : v);

const geoByType = (await rows(`
  select geography_type, count(*)::int n, count(*) filter (is_quarantined)::int quarantined
  from asgs_geography group by 1 order by 1`)).map((r) => ({ ...r, n: num(r.n), quarantined: num(r.quarantined) }));

const corrByPair = (await rows(`
  select source_geography_type || '->' || target_geography_type as pair,
         count(*)::int n, count(*) filter (is_quarantined)::int quarantined
  from asgs_correspondence group by 1 order by 1`)).map((r) => ({ ...r, n: num(r.n), quarantined: num(r.quarantined) }));

const checks = await one(`select
  (select count(*) from asgs_geography where geography_code is null)::int as null_codes,
  (select count(*) from (select geography_type, geography_code from asgs_geography where not is_quarantined group by 1,2 having count(*)>1))::int as duplicate_codes,
  (select count(*) from asgs_geography where not is_quarantined and geom is null)::int as non_quarantined_missing_geom,
  (select count(*) from asgs_geography where geom is not null and not ST_IsValid(geom))::int as invalid_geoms,
  (select count(*) from asgs_geography where geom is not null and ST_Area(geom) = 0)::int as zero_area_geoms,
  (select count(*) from asgs_geography where is_quarantined)::int as quarantined_geo,
  (select count(*) from asgs_correspondence where is_quarantined)::int as quarantined_corr,
  (select count(*) from asgs_correspondence where not is_quarantined and ratio is null)::int as non_quarantined_null_ratio,
  (select count(*) from (
     select source_geography_type, target_geography_type, source_geography_code
     from asgs_correspondence where not is_quarantined
     group by 1,2,3 having abs(sum(ratio) - 1.0) > ${WEIGHT_TOL}))::int as weight_violations`);
for (const k of Object.keys(checks)) checks[k] = num(checks[k]);

const geoMismatches = geoByType
  .filter((r) => EXPECTED_GEO[r.geography_type] !== r.n)
  .map((r) => `${r.geography_type}: ${r.n} != expected ${EXPECTED_GEO[r.geography_type]}`);
const corrMismatches = corrByPair
  .filter((r) => EXPECTED_CORR[r.pair] !== r.n)
  .map((r) => `${r.pair}: ${r.n} != expected ${EXPECTED_CORR[r.pair]}`);

db.closeSync();

const files = ["asgs_2021.duckdb", "asgs_geography.parquet", "asgs_correspondence.parquet"].map((f) => {
  const p = rel("warehouse", "data", "local", f);
  return { file: `warehouse/data/local/${f}`, size_mb: fs.existsSync(p) ? +(fs.statSync(p).size / 1024 / 1024).toFixed(1) : null };
});

const passed =
  geoMismatches.length === 0 && corrMismatches.length === 0 &&
  checks.null_codes === 0 && checks.duplicate_codes === 0 &&
  checks.non_quarantined_missing_geom === 0 && checks.invalid_geoms === 0 &&
  checks.non_quarantined_null_ratio === 0 && checks.weight_violations === 0;

const report = {
  generated_at: new Date().toISOString(),
  store: "local DuckDB/Parquet (no Supabase connection made)",
  verdict: passed ? "PASSED" : "FAILED",
  files,
  geography_by_type: geoByType,
  correspondence_by_pair: corrByPair,
  checks: { ...checks, weight_tolerance: WEIGHT_TOL },
  count_mismatches: { geography: geoMismatches, correspondence: corrMismatches },
  quarantine_note:
    "Quarantined rows are ABS special-purpose codes (Migratory - Offshore - Shipping, No usual address, Outside Australia): no published geometry / zero Albers area. Preserved with reasons, never dropped, nothing invented.",
  crs: "geometry stored EPSG:4326 (transformed from GDA2020 EPSG:7844 at build); parquet geom is WKB",
};
fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2) + "\n");

const md = `# ASGS Local Store Report

Generated: ${report.generated_at}
Store: local DuckDB + Parquet under \`warehouse/data/local/\` (gitignored).
**No Supabase connection was made.** Verdict: **${report.verdict}**

| file | size (MB) |
|---|---|
${files.map((f) => `| \`${f.file}\` | ${f.size_mb} |`).join("\n")}

## Geography (\`asgs_geography\`)

| level | rows | quarantined | expected |
|---|---|---|---|
${geoByType.map((r) => `| ${r.geography_type} | ${r.n} | ${r.quarantined} | ${EXPECTED_GEO[r.geography_type]} |`).join("\n")}

## Correspondences (\`asgs_correspondence\`)

| pair | rows | quarantined | expected |
|---|---|---|---|
${corrByPair.map((r) => `| ${r.pair} | ${r.n} | ${r.quarantined} | ${EXPECTED_CORR[r.pair]} |`).join("\n")}

## Checks

| check | value |
|---|---|
| NULL geography codes | ${checks.null_codes} |
| duplicate codes (non-quarantined) | ${checks.duplicate_codes} |
| non-quarantined rows missing geometry | ${checks.non_quarantined_missing_geom} |
| invalid geometries (ST_IsValid) | ${checks.invalid_geoms} |
| zero-area geometries | ${checks.zero_area_geoms} |
| quarantined geography rows | ${checks.quarantined_geo} |
| quarantined correspondence rows | ${checks.quarantined_corr} |
| non-quarantined NULL ratios | ${checks.non_quarantined_null_ratio} |
| weight reconciliation violations (±${WEIGHT_TOL}) | ${checks.weight_violations} |

${report.quarantine_note}

CRS: ${report.crs}
`;
fs.writeFileSync(OUT_MD, md);

console.log(`Validation ${report.verdict}. Reports written:`);
console.log("  warehouse/reports/asgs_local_store_report.json");
console.log("  warehouse/reports/asgs_local_store_report.md");
if (!passed) process.exit(1);
