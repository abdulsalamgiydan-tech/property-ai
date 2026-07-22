#!/usr/bin/env node
/**
 * 2016-to-2021 geography bridge — branch load (Sprint 12, Workstream 4).
 *
 * Loads the full version-aware bridge built by
 * build_2016_2021_geography_bridge.mjs:
 *   1. core.dim_geography_version — 2 new edition rows (SSC_ABS_2016, POA
 *      2016 edition), additive.
 *   2. core.dim_geography — 2016 SSC + 2016 POA source geographies,
 *      is_current=false (never rendered, never picked up by any query
 *      that filters is_current=true, matching the established convention
 *      used everywhere else in this codebase — verified by grep before
 *      writing this script).
 *   3. core.bridge_geography_correspondence — every 2016->2021
 *      correspondence row at ALL quality levels (Good/Acceptable/Poor —
 *      Poor rows are preserved with their quality_label, not discarded;
 *      only excluded from the derived population figure, matching
 *      "quarantine don't discard").
 *   4. mart.suburb_demographic_profile_2021 /
 *      postcode_demographic_profile_2021 — UPDATE population_2016 /
 *      population_growth_2016_2021_pct (unchanged formula from Sprint 11
 *      WS4) PLUS the new population_growth_method/confidence/
 *      correspondence_version/source_dataset_id lineage columns (the
 *      actual WS4 fix — see migration 027).
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only; production ref hard-refused;
 * dry-run by default; ONE transaction with blocking post-load gates.
 *
 * Usage:
 *   node load_2016_2021_geography_bridge_to_branch.mjs             # dry run
 *   node load_2016_2021_geography_bridge_to_branch.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const SOURCE_DATASET_ID = "abs_correspondence_2016_2021";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

console.log(`load_2016_2021_geography_bridge_to_branch — ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);

// ── 1. Read local bridge store (before any DB connection) ────────────────
const DB_PATH = rel("warehouse", "data", "local", "geography_bridge_2016_2021.duckdb");
if (!fs.existsSync(DB_PATH)) fail(`local store not found at ${DB_PATH} — run build_2016_2021_geography_bridge.mjs first`);
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

const ssc2016 = bigintsToNumbers(await all(`select geography_code, geography_name from dim_geography_2016_ssc`));
const poa2016 = bigintsToNumbers(await all(`select geography_code, geography_name from dim_geography_2016_poa`));
const corrSal = bigintsToNumbers(
  await all(`select ssc_code_2016, sal_code_2021, ratio_from_to, quality_label, source_reconciliation_residual_pct from corr_ssc_to_sal`)
);
const corrPoa = bigintsToNumbers(
  await all(`select poa_code_2016, poa_code_2021, ratio_from_to, quality_label, source_reconciliation_residual_pct from corr_poa_to_poa`)
);
const salConverted = bigintsToNumbers(await all(`select sal_code_2021, converted_population_2016, growth_confidence from sal_population_2016_converted`));
const poaConverted = bigintsToNumbers(await all(`select poa_code_2021, converted_population_2016, growth_confidence from poa_population_2016_converted`));
db.closeSync();

console.log(
  `  loaded from local store: ${ssc2016.length} 2016 SSC geographies, ${poa2016.length} 2016 POA geographies, ` +
    `${corrSal.length} SSC->SAL correspondence rows, ${corrPoa.length} POA->POA correspondence rows, ` +
    `${salConverted.length} SAL population conversions, ${poaConverted.length} POA population conversions`
);

// ── 2. Connect, capacity check, load in one transaction ───────────────────
const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 0, query_timeout: 0 });
await client.connect();

const sizeBeforeRes = await client.query("select pg_database_size(current_database())::bigint as bytes");
const sizeBeforeMb = Number(sizeBeforeRes.rows[0].bytes) / 1024 / 1024;
console.log(`  branch DB size before: ${sizeBeforeMb.toFixed(1)} MB`);
const CAPACITY_CEILING_MB = 4500;
const CAPACITY_WARN_FRACTION = 0.9;
if (sizeBeforeMb / CAPACITY_CEILING_MB >= CAPACITY_WARN_FRACTION) {
  fail(`branch capacity at ${((sizeBeforeMb / CAPACITY_CEILING_MB) * 100).toFixed(1)}% of ${CAPACITY_CEILING_MB} MB ceiling — refusing further writes`);
}

if (!EXECUTE) {
  console.log("\nDry run complete. No writes made. Re-run with --execute to load.");
  await client.end();
  process.exit(0);
}

try {
  await client.query("BEGIN");

  // -- meta.dataset: register the correspondence dataset for lineage traceability --
  await client.query(
    `insert into meta.dataset (dataset_id, source_id, dataset_name, geography_available, earliest_period, latest_period, file_format, refresh_frequency, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dataset_id) do nothing`,
    [
      SOURCE_DATASET_ID,
      "abs_census",
      "ABS official 2016-to-2021 geographic correspondence (population-weighted, SSC->SAL and POA->POA)",
      "SSC(2016)->SAL(2021), POA(2016)->POA(2021)",
      "2016",
      "2021",
      "csv",
      "static (five-yearly Census boundary edition)",
      "Sprint 12 WS4 — full version-aware bridge, all quality levels preserved (Good/Acceptable/Poor), not just the Good/Acceptable subset used for the derived population figure.",
    ]
  );

  // -- dim_geography_version: register the 2 new 2016 editions --
  await client.query(
    `insert into core.dim_geography_version (geography_version_id, geography_type, boundary_version, source_id, valid_from, valid_to, notes)
     values
       ('SSC_ABS_2016', 'SSC', 'ABS_2016', 'abs_census', '2016-08-09', '2021-06-30', 'ABS 2016 Census State Suburbs — predecessor geography to SAL (ASGS3_2021). Loaded Sprint 12 WS4 for cross-boundary population correspondence only; not a rendering geography, no geom.'),
       ('POA_ABS_2016', 'POA', 'ABS_2016', 'abs_census', '2016-08-09', '2021-06-30', 'ABS 2016 Postal Areas — predecessor edition to POA (ASGS3_2021). Loaded Sprint 12 WS4 for cross-boundary population correspondence only; not a rendering geography, no geom.')
     on conflict (geography_version_id) do nothing`
  );

  // -- dim_geography: 2016 SSC + POA rows, is_current=false --
  async function bulkInsertGeography(rows, typePrefix, idSuffix) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = batch.map((r) => {
        const id = `${typePrefix}_${r.geography_code}_${idSuffix}`;
        params.push(id, typePrefix, r.geography_code, r.geography_name, idSuffix);
        return `($${params.length - 4},$${params.length - 3},$${params.length - 2},$${params.length - 1},false,$${params.length})`;
      });
      const res = await client.query(
        `insert into core.dim_geography (geography_id, geography_type, geography_code, geography_name, is_current, boundary_version)
         values ${tuples.join(",")}
         on conflict (geography_id) do nothing`,
        params
      );
      inserted += res.rowCount;
    }
    return inserted;
  }
  const sscInserted = await bulkInsertGeography(ssc2016, "SSC", "ABS_2016");
  const poaInserted = await bulkInsertGeography(poa2016, "POA", "ABS_2016");
  console.log(`  core.dim_geography: ${sscInserted} SSC (2016) + ${poaInserted} POA (2016) rows inserted`);

  // -- bridge_geography_correspondence: every 2016->2021 row, all quality levels --
  async function bulkInsertCorrespondence(rows, sourceType, sourceIdSuffix, targetType, sourceCodeKey, targetCodeKey) {
    const BATCH = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = batch.map((r) => {
        const sourceId = `${sourceType}_${r[sourceCodeKey]}_${sourceIdSuffix}`;
        const targetId = `${targetType}_${r[targetCodeKey]}_ASGS3_2021`;
        const confidenceScore = r.quality_label === "Good" ? 1.0 : r.quality_label === "Acceptable" ? 0.7 : 0.3;
        params.push(
          sourceId, targetId, sourceType, targetType,
          r.ratio_from_to, // population_weight
          r.ratio_from_to, // preferred_weight (population-weighted is the only/best weight this source provides)
          "abs_population_weighted_correspondence_2016_2021",
          "ABS_2016_to_ASGS3_2021",
          confidenceScore, r.quality_label,
          r.source_reconciliation_residual_pct,
          SOURCE_DATASET_ID
        );
        return `($${params.length - 11},$${params.length - 10},$${params.length - 9},$${params.length - 8},$${params.length - 7},$${params.length - 6},$${params.length - 5},$${params.length - 4},$${params.length - 3},$${params.length - 2},$${params.length - 1},$${params.length})`;
      });
      const res = await client.query(
        `insert into core.bridge_geography_correspondence
          (source_geography_id, target_geography_id, source_geography_type, target_geography_type,
           population_weight, preferred_weight, correspondence_method, correspondence_version,
           confidence_score, quality_label, reconciliation_residual_pct, source_dataset_id)
         values ${tuples.join(",")}
         on conflict (source_geography_id, target_geography_id, correspondence_version) do nothing`,
        params
      );
      inserted += res.rowCount;
    }
    return inserted;
  }
  const salCorrInserted = await bulkInsertCorrespondence(corrSal, "SSC", "ABS_2016", "SAL", "ssc_code_2016", "sal_code_2021");
  const poaCorrInserted = await bulkInsertCorrespondence(corrPoa, "POA", "ABS_2016", "POA", "poa_code_2016", "poa_code_2021");
  console.log(`  core.bridge_geography_correspondence: ${salCorrInserted} SSC->SAL + ${poaCorrInserted} POA->POA rows inserted`);

  // -- demographic profile marts: population_2016/growth + lineage columns --
  await client.query(`create temp table sal_pop2016_staged (geography_code text, population_2016 numeric, growth_confidence text) on commit drop`);
  await client.query(`create temp table poa_pop2016_staged (geography_code text, population_2016 numeric, growth_confidence text) on commit drop`);

  async function stageConverted(table, rows, codePrefix, codeKey) {
    const BATCH = 1000;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const params = [];
      const tuples = batch.map((r) => {
        params.push(`${codePrefix}${r[codeKey]}`, r.converted_population_2016, r.growth_confidence);
        return `($${params.length - 2},$${params.length - 1},$${params.length})`;
      });
      await client.query(`insert into ${table} (geography_code, population_2016, growth_confidence) values ${tuples.join(",")}`, params);
    }
  }
  await stageConverted("sal_pop2016_staged", salConverted, "SAL", "sal_code_2021");
  await stageConverted("poa_pop2016_staged", poaConverted, "POA", "poa_code_2021");

  const salUpdate = await client.query(`
    update mart.suburb_demographic_profile_2021 d
    set population_2016 = round(s.population_2016)::integer,
        population_growth_2016_2021_pct = case
          when s.population_2016 >= 50 and d.total_population is not null
          then round(((d.total_population - s.population_2016) / s.population_2016 * 100)::numeric, 2)
          else null
        end,
        population_growth_method = 'derived',
        population_growth_confidence = case when s.population_2016 >= 50 then s.growth_confidence else null end,
        population_growth_correspondence_version = 'ABS_2016_to_ASGS3_2021',
        population_growth_source_dataset_id = $1
    from sal_pop2016_staged s
    where s.geography_code = d.geography_code
  `, [SOURCE_DATASET_ID]);
  const poaUpdate = await client.query(`
    update mart.postcode_demographic_profile_2021 d
    set population_2016 = round(s.population_2016)::integer,
        population_growth_2016_2021_pct = case
          when s.population_2016 >= 50 and d.total_population is not null
          then round(((d.total_population - s.population_2016) / s.population_2016 * 100)::numeric, 2)
          else null
        end,
        population_growth_method = 'derived',
        population_growth_confidence = case when s.population_2016 >= 50 then s.growth_confidence else null end,
        population_growth_correspondence_version = 'ABS_2016_to_ASGS3_2021',
        population_growth_source_dataset_id = $1
    from poa_pop2016_staged s
    where s.geography_code = d.geography_code
  `, [SOURCE_DATASET_ID]);
  console.log(`  mart.suburb_demographic_profile_2021: ${salUpdate.rowCount} rows updated`);
  console.log(`  mart.postcode_demographic_profile_2021: ${poaUpdate.rowCount} rows updated`);

  // ── Blocking validation gates ────────────────────────────────────────
  const gates = await client.query(`
    select
      (select count(*)::int from mart.suburb_demographic_profile_2021 where population_2016 is not null and population_2016 < 0) as sal_negative,
      (select count(*)::int from mart.postcode_demographic_profile_2021 where population_2016 is not null and population_2016 < 0) as poa_negative,
      (select count(*)::int from mart.suburb_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_2016 < 50) as sal_low_base_leak,
      (select count(*)::int from mart.postcode_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_2016 < 50) as poa_low_base_leak,
      (select count(*)::int from mart.suburb_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_growth_method is null) as sal_growth_missing_lineage,
      (select count(*)::int from mart.postcode_demographic_profile_2021 where population_growth_2016_2021_pct is not null and population_growth_method is null) as poa_growth_missing_lineage,
      (select count(*)::int from (select source_geography_id, target_geography_id, correspondence_version, count(*) from core.bridge_geography_correspondence where correspondence_version='ABS_2016_to_ASGS3_2021' group by 1,2,3 having count(*) > 1) dup) as duplicate_correspondence_keys,
      (select count(*)::int from core.bridge_geography_correspondence c where c.correspondence_version = 'ABS_2016_to_ASGS3_2021' and not exists (select 1 from core.dim_geography g where g.geography_id = c.target_geography_id)) as orphan_target_geography,
      (select count(*)::int from core.bridge_geography_correspondence where correspondence_version = 'ABS_2016_to_ASGS3_2021' and (population_weight < 0 or population_weight > 1.01)) as invalid_weights,
      pg_database_size(current_database())::bigint as db_bytes_now
  `);
  const g = gates.rows[0];
  console.log(`  gates: ${JSON.stringify(g)}`);
  const failures = [];
  if (g.sal_negative > 0) failures.push(`sal_negative=${g.sal_negative}`);
  if (g.poa_negative > 0) failures.push(`poa_negative=${g.poa_negative}`);
  if (g.sal_low_base_leak > 0) failures.push(`sal_low_base_leak=${g.sal_low_base_leak}`);
  if (g.poa_low_base_leak > 0) failures.push(`poa_low_base_leak=${g.poa_low_base_leak}`);
  if (g.sal_growth_missing_lineage > 0) failures.push(`sal_growth_missing_lineage=${g.sal_growth_missing_lineage}`);
  if (g.poa_growth_missing_lineage > 0) failures.push(`poa_growth_missing_lineage=${g.poa_growth_missing_lineage}`);
  if (g.duplicate_correspondence_keys > 0) failures.push(`duplicate_correspondence_keys=${g.duplicate_correspondence_keys}`);
  if (g.orphan_target_geography > 0) failures.push(`orphan_target_geography=${g.orphan_target_geography}`);
  if (g.invalid_weights > 0) failures.push(`invalid_weights=${g.invalid_weights}`);
  if (failures.length > 0) {
    throw new Error(`validation gate failed: ${failures.join(", ")}`);
  }

  await client.query("COMMIT");
  console.log("\nCOMMITTED (branch only; production untouched).");

  const sizeAfterRes = await client.query("select pg_database_size(current_database())::bigint as bytes");
  const sizeAfterMb = Number(sizeAfterRes.rows[0].bytes) / 1024 / 1024;
  const report = {
    generated_at: new Date().toISOString(),
    mode: "EXECUTE",
    branch_ref: BRANCH_REF,
    production_touched: false,
    dim_geography_version_rows_added: 2,
    dim_geography_rows_inserted: { ssc_2016: sscInserted, poa_2016: poaInserted },
    bridge_correspondence_rows_inserted: { ssc_to_sal: salCorrInserted, poa_to_poa: poaCorrInserted },
    mart_rows_updated: { suburb_demographic_profile_2021: salUpdate.rowCount, postcode_demographic_profile_2021: poaUpdate.rowCount },
    validation_gates: g,
    db_size_before_mb: Number(sizeBeforeMb.toFixed(1)),
    db_size_after_mb: Number(sizeAfterMb.toFixed(1)),
  };
  fs.writeFileSync(rel("warehouse", "reports", "geography_bridge_2016_2021_branch_load_report.json"), JSON.stringify(report, null, 2));
  console.log(`Branch size: ${sizeBeforeMb.toFixed(1)} MB -> ${sizeAfterMb.toFixed(1)} MB`);
  console.log("Report written: warehouse/reports/geography_bridge_2016_2021_branch_load_report.json");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("ROLLED BACK due to error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
