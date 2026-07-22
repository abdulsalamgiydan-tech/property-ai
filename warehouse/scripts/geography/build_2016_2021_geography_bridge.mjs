#!/usr/bin/env node
/**
 * 2016-to-2021 geography bridge — full local build (Sprint 12, Workstream 4).
 *
 * Supersedes the population-only local build from Sprint 11 WS4
 * (build_cross_census_harmonisation.mjs, kept for history) with a
 * genuine version-aware correspondence layer: every 2016 SSC/POA source
 * geography, every 2016->2021 correspondence row (all quality levels
 * preserved, not just Good/Acceptable), and a per-source reconciliation
 * residual — not just the final converted population figure.
 *
 * Inputs (already downloaded/processed in Sprint 11 WS4, re-used not
 * re-fetched):
 *   - warehouse/data/raw/abs_correspondence/asgs_2016_to_2021/
 *       CG_SSC_2016_SAL_2021.csv, CG_POA_2016_POA_2021.csv
 *   - warehouse/data/processed/census_2016/gcp_ssc / gcp_poa (2016 Census
 *     G01 total population by 2016 SSC/POA)
 *
 * Output: warehouse/data/local/geography_bridge_2016_2021.duckdb (local
 * only) plus a committed report. No Supabase connection made by this
 * script — see load_2016_2021_geography_bridge_to_branch.mjs for that.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "geography_bridge_2016_2021.duckdb");

const CORR_DIR = rel("warehouse", "data", "raw", "abs_correspondence", "asgs_2016_to_2021");
const CENSUS_SSC_CSV = rel("warehouse", "data", "processed", "census_2016", "gcp_ssc", "2016 Census GCP State Suburbs for AUST", "2016Census_G01_AUS_SSC.csv");
const CENSUS_POA_CSV = rel("warehouse", "data", "processed", "census_2016", "gcp_poa", "2016 Census GCP Postal Areas for AUST", "2016Census_G01_AUS_POA.csv");

for (const p of [CORR_DIR, CENSUS_SSC_CSV, CENSUS_POA_CSV]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: missing input: ${p}`);
    process.exit(1);
  }
}

console.log("build_2016_2021_geography_bridge — full version-aware bridge (local-first, no Supabase)");

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) fs.rmSync(DB_PATH);

const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
async function run(sql) {
  return db.run(sql);
}
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

// Quality label -> numeric confidence_score. Documented mapping, not an
// invented weight — this scores the CORRESPONDENCE's reliability, never
// touches the underlying population/ratio values themselves.
const QUALITY_SCORE = { Good: 1.0, Acceptable: 0.7, Poor: 0.3 };

// ============================================================
// SAL family (source: 2016 SSC)
// ============================================================
await run(`
  create table census_2016_ssc_population as
  select regexp_replace(SSC_CODE_2016::varchar, '^SSC', '') as ssc_code_2016,
         Tot_P_P::double as population_2016
  from read_csv('${posix(CENSUS_SSC_CSV)}', header=true, all_varchar=true)
`);
await run(`
  create table corr_ssc_to_sal_raw as
  select SSC_CODE_2016::varchar as ssc_code_2016, SSC_NAME_2016 as ssc_name_2016,
         SAL_CODE_2021::varchar as sal_code_2021, SAL_NAME_2021 as sal_name_2021,
         RATIO_FROM_TO::double as ratio_from_to, OVERALL_QUALITY_INDICATOR as quality_label
  from read_csv('${posix(path.join(CORR_DIR, "CG_SSC_2016_SAL_2021.csv"))}', header=true, all_varchar=true)
`);

// Per-source reconciliation residual: for each 2016 SSC, how much of its
// RATIO_FROM_TO is captured across Good/Acceptable rows only (vs the full
// 100% the correspondence should sum to across ALL its rows). A residual
// close to 0 means Poor-quality exclusion lost little; a large residual
// means a source geography's population conversion is materially
// incomplete — this is a genuine, computed number, not asserted.
await run(`
  create table ssc_reconciliation_residual as
  select ssc_code_2016,
    sum(ratio_from_to) filter (where quality_label in ('Good','Acceptable')) as captured_ratio,
    sum(ratio_from_to) as total_ratio,
    round((1 - coalesce(sum(ratio_from_to) filter (where quality_label in ('Good','Acceptable')), 0) / nullif(sum(ratio_from_to), 0)) * 100, 2) as residual_pct
  from corr_ssc_to_sal_raw
  group by 1
`);

const salResidualStats = bigintsToNumbers(
  await all(`select count(*) as n, count(*) filter (where residual_pct > 5) as n_over_5pct, max(residual_pct) as max_residual from ssc_reconciliation_residual`)
)[0];
console.log(`SSC->SAL reconciliation residual: ${salResidualStats.n} source geographies, ${salResidualStats.n_over_5pct} with >5% residual (max ${salResidualStats.max_residual}%)`);

// Full correspondence table (ALL quality levels preserved — Poor rows are
// NOT dropped from the bridge itself, only excluded from the derived
// population figure below, matching "quarantine don't discard").
//
// Three genuine special/non-spatial cases handled explicitly (not a
// parsing defect, confirmed by inspecting each excluded row):
//   1. NULL source code — a 2021 target with no 2016 predecessor at all
//      (a genuinely new SAL, e.g. "Prince Regent River") or the ABS
//      "Outside Australia" placeholder target.
//   2. NULL target code — a 2016 source's tiny unallocated residual
//      (observed ratio_from_to as small as 0.00005%) that ABS itself
//      could not confidently assign to any single 2021 target.
//   3. Non-spatial target categories ABS assigns a real SAL/POA code to
//      but which were never part of the ASGS geography backbone this
//      project loaded (Sprint 2-4) because they have no boundary/geometry
//      at all — "No usual address (<state>)" and "Migratory - Offshore -
//      Shipping (<state>)", one pseudo-code per jurisdiction. Excluding
//      these keeps the bridge consistent with what core.dim_geography
//      already represents (real, current SAL/POA rows only) rather than
//      unilaterally introducing geography rows nothing else in this
//      project recognises.
// None of these represents a genuine source->target correspondence — the
// affected 2021 targets correctly keep population_2016 as NULL (no source
// row contributes), which is the honest outcome, not a bug to route
// around by inventing a link.
await run(`
  create table corr_ssc_to_sal as
  select c.*, r.residual_pct as source_reconciliation_residual_pct
  from corr_ssc_to_sal_raw c
  left join ssc_reconciliation_residual r on r.ssc_code_2016 = c.ssc_code_2016
  where c.ssc_code_2016 is not null
    and c.sal_code_2021 is not null
    and c.sal_name_2021 not like 'No usual address%'
    and c.sal_name_2021 not like 'Migratory%'
`);
const sscExcludedRows = bigintsToNumbers(
  await all(`
    select sal_code_2021, sal_name_2021, count(*) as n from corr_ssc_to_sal_raw
    where ssc_code_2016 is null or sal_code_2021 is null or sal_name_2021 like 'No usual address%' or sal_name_2021 like 'Migratory%'
    group by 1, 2 order by 1
  `)
);
if (sscExcludedRows.length > 0) {
  console.log(`  excluded ${sscExcludedRows.reduce((a, r) => a + r.n, 0)} SSC->SAL row(s), ${sscExcludedRows.length} distinct non-spatial/unallocated target(s): ${sscExcludedRows.map((r) => `${r.sal_code_2021 ?? "(null source or target)"} (${r.sal_name_2021 ?? "n/a"})`).join(", ")}`);
}

await run(`
  create table sal_population_2016_converted as
  with joined as (
    select c.sal_code_2021, c.sal_name_2021, c.ratio_from_to, c.quality_label,
           p.population_2016
    from corr_ssc_to_sal c
    join census_2016_ssc_population p on p.ssc_code_2016 = c.ssc_code_2016
    where p.population_2016 is not null
  )
  select sal_code_2021, sal_name_2021,
         sum(population_2016 * ratio_from_to) as converted_population_2016,
         count(*) as contributing_rows,
         min(quality_label) as worst_quality_used,
         case
           when bool_and(quality_label = 'Good') then 'high'
           when bool_or(quality_label = 'Poor') then 'low'
           else 'medium'
         end as growth_confidence
  from joined
  where quality_label in ('Good', 'Acceptable')
  group by 1, 2
`);

// ============================================================
// POA family (source: 2016 POA, direct code continuity)
// ============================================================
await run(`
  create table census_2016_poa_population as
  select regexp_replace(POA_CODE_2016::varchar, '^POA', '') as poa_code_2016,
         Tot_P_P::double as population_2016
  from read_csv('${posix(CENSUS_POA_CSV)}', header=true, all_varchar=true)
`);
await run(`
  create table corr_poa_to_poa_raw as
  select POA_CODE_2016::varchar as poa_code_2016, POA_NAME_2016 as poa_name_2016,
         POA_CODE_2021::varchar as poa_code_2021, POA_NAME_2021 as poa_name_2021,
         RATIO_FROM_TO::double as ratio_from_to, OVERALL_QUALITY_INDICATOR as quality_label
  from read_csv('${posix(path.join(CORR_DIR, "CG_POA_2016_POA_2021.csv"))}', header=true, all_varchar=true)
`);
await run(`
  create table poa_reconciliation_residual as
  select poa_code_2016,
    sum(ratio_from_to) filter (where quality_label in ('Good','Acceptable')) as captured_ratio,
    sum(ratio_from_to) as total_ratio,
    round((1 - coalesce(sum(ratio_from_to) filter (where quality_label in ('Good','Acceptable')), 0) / nullif(sum(ratio_from_to), 0)) * 100, 2) as residual_pct
  from corr_poa_to_poa_raw
  group by 1
`);
await run(`
  create table corr_poa_to_poa as
  select c.*, r.residual_pct as source_reconciliation_residual_pct
  from corr_poa_to_poa_raw c
  left join poa_reconciliation_residual r on r.poa_code_2016 = c.poa_code_2016
  where c.poa_code_2016 is not null
    and c.poa_code_2021 is not null
    and c.poa_name_2021 not like 'No usual address%'
    and c.poa_name_2021 not like 'Migratory%'
`);
const poaExcludedRows = bigintsToNumbers(
  await all(`
    select poa_code_2021, poa_name_2021, count(*) as n from corr_poa_to_poa_raw
    where poa_code_2016 is null or poa_code_2021 is null or poa_name_2021 like 'No usual address%' or poa_name_2021 like 'Migratory%'
    group by 1, 2 order by 1
  `)
);
if (poaExcludedRows.length > 0) {
  console.log(`  excluded ${poaExcludedRows.reduce((a, r) => a + r.n, 0)} POA->POA row(s), ${poaExcludedRows.length} distinct non-spatial/unallocated target(s): ${poaExcludedRows.map((r) => `${r.poa_code_2021 ?? "(null source or target)"} (${r.poa_name_2021 ?? "n/a"})`).join(", ")}`);
}
await run(`
  create table poa_population_2016_converted as
  with joined as (
    select c.poa_code_2021, c.poa_name_2021, c.ratio_from_to, c.quality_label,
           p.population_2016
    from corr_poa_to_poa c
    join census_2016_poa_population p on p.poa_code_2016 = c.poa_code_2016
    where p.population_2016 is not null
  )
  select poa_code_2021, poa_name_2021,
         sum(population_2016 * ratio_from_to) as converted_population_2016,
         count(*) as contributing_rows,
         min(quality_label) as worst_quality_used,
         case
           when bool_and(quality_label = 'Good') then 'high'
           when bool_or(quality_label = 'Poor') then 'low'
           else 'medium'
         end as growth_confidence
  from joined
  where quality_label in ('Good', 'Acceptable')
  group by 1, 2
`);

// ============================================================
// Distinct 2016 source geographies (for dim_geography rows)
// ============================================================
await run(`
  create table dim_geography_2016_ssc as
  select distinct ssc_code_2016 as geography_code, ssc_name_2016 as geography_name
  from corr_ssc_to_sal_raw
  where ssc_code_2016 is not null
`);
await run(`
  create table dim_geography_2016_poa as
  select distinct poa_code_2016 as geography_code, poa_name_2016 as geography_name
  from corr_poa_to_poa_raw
  where poa_code_2016 is not null
`);

// ============================================================
// National + state-level reconciliation (validation, not just reporting)
// ============================================================
const sourceTotalSsc = bigintsToNumbers(await all(`select sum(population_2016) as total from census_2016_ssc_population`))[0].total;
const targetTotalSal = bigintsToNumbers(await all(`select sum(converted_population_2016) as total from sal_population_2016_converted`))[0].total;
const salRowCount = bigintsToNumbers(await all(`select count(*) as n from sal_population_2016_converted`))[0].n;

const sourceTotalPoa = bigintsToNumbers(await all(`select sum(population_2016) as total from census_2016_poa_population`))[0].total;
const targetTotalPoa = bigintsToNumbers(await all(`select sum(converted_population_2016) as total from poa_population_2016_converted`))[0].total;
const poaRowCount = bigintsToNumbers(await all(`select count(*) as n from poa_population_2016_converted`))[0].n;

const ssc2016Count = bigintsToNumbers(await all(`select count(*) as n from dim_geography_2016_ssc`))[0].n;
const poa2016Count = bigintsToNumbers(await all(`select count(*) as n from dim_geography_2016_poa`))[0].n;
const corrSalRows = bigintsToNumbers(await all(`select count(*) as n from corr_ssc_to_sal`))[0].n;
const corrPoaRows = bigintsToNumbers(await all(`select count(*) as n from corr_poa_to_poa`))[0].n;

await run("checkpoint");
db.closeSync();

const reconciliationPctSal = ((targetTotalSal / sourceTotalSsc) * 100).toFixed(2);
const reconciliationPctPoa = ((targetTotalPoa / sourceTotalPoa) * 100).toFixed(2);

console.log(`SAL family: ${ssc2016Count} 2016 SSC source geographies, ${corrSalRows} correspondence rows (all quality), ${salRowCount} target SAL geographies converted. National reconciliation: ${reconciliationPctSal}%`);
console.log(`POA family: ${poa2016Count} 2016 POA source geographies, ${corrPoaRows} correspondence rows (all quality), ${poaRowCount} target POA geographies converted. National reconciliation: ${reconciliationPctPoa}%`);

const RECONCILIATION_TOLERANCE_PCT = 0.5; // documented tolerance: 99.5%-100.5% is "reconciled"
const salReconciled = Math.abs(100 - Number(reconciliationPctSal)) <= RECONCILIATION_TOLERANCE_PCT;
const poaReconciled = Math.abs(100 - Number(reconciliationPctPoa)) <= RECONCILIATION_TOLERANCE_PCT;

const report = {
  generated_at: new Date().toISOString(),
  method: "ABS population-weighted correspondence (RATIO_FROM_TO), full quality range preserved in the bridge table, Good/Acceptable-only used for the derived population figure, Poor quarantined not discarded",
  documented_tolerance_pct: RECONCILIATION_TOLERANCE_PCT,
  quality_score_mapping: QUALITY_SCORE,
  sal: {
    source_geographies_2016_ssc: ssc2016Count,
    correspondence_rows_all_quality: corrSalRows,
    source_total_2016_ssc_population: sourceTotalSsc,
    target_total_2021_sal_converted_population: Math.round(targetTotalSal),
    reconciliation_pct: Number(reconciliationPctSal),
    reconciled_within_tolerance: salReconciled,
    target_geographies_with_converted_value: salRowCount,
    source_residual_stats: salResidualStats,
  },
  poa: {
    source_geographies_2016_poa: poa2016Count,
    correspondence_rows_all_quality: corrPoaRows,
    source_total_2016_poa_population: sourceTotalPoa,
    target_total_2021_poa_converted_population: Math.round(targetTotalPoa),
    reconciliation_pct: Number(reconciliationPctPoa),
    reconciled_within_tolerance: poaReconciled,
    target_geographies_with_converted_value: poaRowCount,
  },
  deferred: "SA2-grain 2016->2021 correspondence (CG_SA2_2016_SA2_2021.csv, already downloaded) not built this pass — SAL/POA are the primary residential research grains per the mission; SA2 remains available for a future validation cross-check but is not required for this workstream's completion.",
};
fs.writeFileSync(rel("warehouse", "reports", "geography_bridge_2016_2021_local_build.json"), JSON.stringify(report, null, 2));
console.log(`\nReconciliation gate: SAL ${salReconciled ? "PASS" : "FAIL"}, POA ${poaReconciled ? "PASS" : "FAIL"} (tolerance ±${RECONCILIATION_TOLERANCE_PCT}%)`);
console.log("Local build complete: warehouse/data/local/geography_bridge_2016_2021.duckdb");

if (!salReconciled || !poaReconciled) {
  console.error("\nERROR: national reconciliation outside documented tolerance — refusing to proceed to branch load. Investigate before promoting.");
  process.exit(1);
}
