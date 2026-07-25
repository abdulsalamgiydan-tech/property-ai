#!/usr/bin/env node
/**
 * Cross-Census 2016->2021 population harmonisation (Sprint 11, Workstream 4).
 *
 * Converts 2016 Census total population (published at 2016 SSC/POA grain)
 * to 2021 SAL/POA grain using official ABS population-weighted
 * correspondence files (RATIO_FROM_TO), producing a defensible
 * 2016-2021 population growth figure — the gap left NULL since Sprint 9.
 *
 * Method:
 *   converted_2016_pop(target) = sum over matching FROM rows of
 *     (2016_population(FROM) * RATIO_FROM_TO)
 *   restricted to rows where OVERALL_QUALITY_INDICATOR is 'Good' or
 *   'Acceptable' — 'Poor' rows are excluded, and if a target's ONLY
 *   correspondence rows are 'Poor', its converted population stays NULL
 *   rather than being computed from a low-quality correspondence.
 *
 * Local-only. No Supabase connection made by this script.
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
const DB_PATH = path.join(LOCAL_DIR, "cross_census_harmonisation.duckdb");

const CORR_DIR = rel("warehouse", "data", "raw", "abs_correspondence", "asgs_2016_to_2021");
const CENSUS_SSC_CSV = rel(
  "warehouse", "data", "processed", "census_2016", "gcp_ssc",
  "2016 Census GCP State Suburbs for AUST", "2016Census_G01_AUS_SSC.csv"
);
const CENSUS_POA_CSV = rel(
  "warehouse", "data", "processed", "census_2016", "gcp_poa",
  "2016 Census GCP Postal Areas for AUST", "2016Census_G01_AUS_POA.csv"
);

for (const p of [CORR_DIR, CENSUS_SSC_CSV, CENSUS_POA_CSV]) {
  if (!fs.existsSync(p)) {
    console.error(`ERROR: missing input: ${p}`);
    process.exit(1);
  }
}

console.log("build_cross_census_harmonisation — 2016->2021 population conversion (local-first, no Supabase)");

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

// ── SAL (via SSC 2016 predecessor) ──────────────────────────────────────
await run(`
  create table census_2016_ssc_population as
  select regexp_replace(SSC_CODE_2016::varchar, '^SSC', '') as ssc_code_2016, Tot_P_P::double as population_2016
  from read_csv('${posix(CENSUS_SSC_CSV)}', header=true, all_varchar=true)
`);
await run(`
  create table corr_ssc_to_sal as
  select SSC_CODE_2016::varchar as ssc_code_2016, SSC_NAME_2016 as ssc_name_2016,
         SAL_CODE_2021::varchar as sal_code_2021, SAL_NAME_2021 as sal_name_2021,
         RATIO_FROM_TO::double as ratio_from_to, OVERALL_QUALITY_INDICATOR as overall_quality
  from read_csv('${posix(path.join(CORR_DIR, "CG_SSC_2016_SAL_2021.csv"))}', header=true, all_varchar=true)
`);

const salResult = await run(`
  create table sal_population_2016_converted as
  with joined as (
    select c.sal_code_2021, c.sal_name_2021, c.ratio_from_to, c.overall_quality,
           p.population_2016
    from corr_ssc_to_sal c
    join census_2016_ssc_population p on p.ssc_code_2016 = c.ssc_code_2016
    where p.population_2016 is not null
  ),
  good_only as (
    select sal_code_2021, sal_name_2021,
           sum(population_2016 * ratio_from_to) as converted_population_2016,
           count(*) as contributing_rows,
           min(overall_quality) as worst_quality_used
    from joined
    where overall_quality in ('Good', 'Acceptable')
    group by 1, 2
  )
  select * from good_only
`);

// ── POA (direct 2016 POA to 2021 POA) ───────────────────────────────────
await run(`
  create table census_2016_poa_population as
  select regexp_replace(POA_CODE_2016::varchar, '^POA', '') as poa_code_2016, Tot_P_P::double as population_2016
  from read_csv('${posix(CENSUS_POA_CSV)}', header=true, all_varchar=true)
`);
await run(`
  create table corr_poa_to_poa as
  select POA_CODE_2016::varchar as poa_code_2016, POA_NAME_2016 as poa_name_2016,
         POA_CODE_2021::varchar as poa_code_2021, POA_NAME_2021 as poa_name_2021,
         RATIO_FROM_TO::double as ratio_from_to, OVERALL_QUALITY_INDICATOR as overall_quality
  from read_csv('${posix(path.join(CORR_DIR, "CG_POA_2016_POA_2021.csv"))}', header=true, all_varchar=true)
`);

await run(`
  create table poa_population_2016_converted as
  with joined as (
    select c.poa_code_2021, c.poa_name_2021, c.ratio_from_to, c.overall_quality,
           p.population_2016
    from corr_poa_to_poa c
    join census_2016_poa_population p on p.poa_code_2016 = c.poa_code_2016
    where p.population_2016 is not null
  ),
  good_only as (
    select poa_code_2021, poa_name_2021,
           sum(population_2016 * ratio_from_to) as converted_population_2016,
           count(*) as contributing_rows,
           min(overall_quality) as worst_quality_used
    from joined
    where overall_quality in ('Good', 'Acceptable')
    group by 1, 2
  )
  select * from good_only
`);

// ── Reconciliation checks ───────────────────────────────────────────────
const sourceTotalSsc = bigintsToNumbers(await all(`select sum(population_2016) as total from census_2016_ssc_population`))[0].total;
const targetTotalSal = bigintsToNumbers(await all(`select sum(converted_population_2016) as total from sal_population_2016_converted`))[0].total;
const salRowCount = bigintsToNumbers(await all(`select count(*) as n from sal_population_2016_converted`))[0].n;

const sourceTotalPoa = bigintsToNumbers(await all(`select sum(population_2016) as total from census_2016_poa_population`))[0].total;
const targetTotalPoa = bigintsToNumbers(await all(`select sum(converted_population_2016) as total from poa_population_2016_converted`))[0].total;
const poaRowCount = bigintsToNumbers(await all(`select count(*) as n from poa_population_2016_converted`))[0].n;

const qualityDistSal = bigintsToNumbers(
  await all(`
    select overall_quality, count(*) as n from (
      select c.overall_quality from corr_ssc_to_sal c
      join census_2016_ssc_population p on p.ssc_code_2016 = c.ssc_code_2016
      where p.population_2016 is not null
    ) group by 1
  `)
);

await run("checkpoint");
db.closeSync();

const reconciliationPctSal = ((targetTotalSal / sourceTotalSsc) * 100).toFixed(2);
const reconciliationPctPoa = ((targetTotalPoa / sourceTotalPoa) * 100).toFixed(2);

console.log(`SAL: ${salRowCount} target geographies converted. Source total (2016 SSC): ${sourceTotalSsc.toLocaleString()}. Target total (2021 SAL): ${targetTotalSal.toFixed(0)}. Reconciliation: ${reconciliationPctSal}%`);
console.log(`POA: ${poaRowCount} target geographies converted. Source total (2016 POA): ${sourceTotalPoa.toLocaleString()}. Target total (2021 POA): ${targetTotalPoa.toFixed(0)}. Reconciliation: ${reconciliationPctPoa}%`);
console.log("Quality distribution (SSC->SAL rows with non-null 2016 population):", qualityDistSal);

const report = {
  generated_at: new Date().toISOString(),
  method: "population-weighted ABS official correspondence (RATIO_FROM_TO), Good/Acceptable quality only, Poor excluded",
  sal: {
    source_total_2016_ssc_population: sourceTotalSsc,
    target_total_2021_sal_converted_population: Math.round(targetTotalSal),
    reconciliation_pct: Number(reconciliationPctSal),
    target_geographies_with_converted_value: salRowCount,
  },
  poa: {
    source_total_2016_poa_population: sourceTotalPoa,
    target_total_2021_poa_converted_population: Math.round(targetTotalPoa),
    reconciliation_pct: Number(reconciliationPctPoa),
    target_geographies_with_converted_value: poaRowCount,
  },
  quality_distribution_ssc_to_sal_rows: qualityDistSal,
};
fs.writeFileSync(rel("warehouse", "reports", "cross_census_harmonisation_local_build.json"), JSON.stringify(report, null, 2));
console.log("\nLocal build complete: warehouse/data/local/cross_census_harmonisation.duckdb");
