#!/usr/bin/env node
/**
 * Census demographics local store builder (Sprint 9, Phase 2).
 *
 * Reads G01 (population), G02 (medians/income) and G35 (household
 * composition) directly from the already-extracted, already-verified
 * official ABS GCP DataPacks (Sprint 3) at SAL and POA grain — both are
 * native geographies for these tables, so no ASGS correspondence weighting
 * is used; every row is direct_or_derived='direct'.
 *
 * No Supabase connection, no secrets. Missing/unpublished cells stay NULL.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DuckDBInstance } from "@duckdb/node-api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);
const posix = (p) => p.replaceAll("\\", "/");

const MANIFEST = rel("warehouse", "reports", "census_demographics_source_manifest.json");
const PROCESSED_DIR = rel("warehouse", "data", "processed", "census", "2021");
const LOCAL_DIR = rel("warehouse", "data", "local");
const DB_PATH = path.join(LOCAL_DIR, "census_demographics.duckdb");
const ASGS_DB = rel("warehouse", "data", "local", "asgs_2021.duckdb");

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(MANIFEST)) fail("manifest missing — run discover_census_demographic_sources.mjs first");
const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
if (!manifest.live_verification?.every((r) => r.verified)) fail("manifest not live-verified — run discover_census_demographic_sources.mjs first");

console.log("build_census_demographics_local_store — local-first (no Supabase, no secrets)");

const GEOS = [
  { level: "SAL", folder: "2021 Census GCP Suburbs and Localities for AUS", codeCol: "SAL_CODE_2021" },
  { level: "POA", folder: "2021 Census GCP Postal Areas for AUS", codeCol: "POA_CODE_2021" },
];

fs.mkdirSync(LOCAL_DIR, { recursive: true });
if (fs.existsSync(DB_PATH)) {
  fs.rmSync(DB_PATH, { force: true });
  fs.rmSync(`${DB_PATH}.wal`, { force: true });
}
const instance = await DuckDBInstance.create(DB_PATH);
const db = await instance.connect();
const run = (sql) => db.run(sql);
const one = async (sql) => (await db.runAndReadAll(sql)).getRows()[0];

await run(`
  create table census_demographics (
    geography_type              varchar not null,   -- SAL | POA
    geography_code              varchar not null,
    census_year                 integer not null,
    total_population            integer,             -- G01 Tot_P_P
    median_age                  double,               -- G02 Median_age_persons
    total_households            integer,               -- G35 Total_Total
    family_households           integer,                -- G35 Total_FamHhold
    lone_person_households       integer,                 -- G35 Num_Psns_UR_1_Total
    average_household_size        double,                   -- G02 Average_household_size
    median_weekly_household_income integer,                   -- G02 Median_tot_hhd_inc_weekly
    median_weekly_personal_income   integer,                   -- G02 Median_tot_prsnl_inc_weekly
    median_weekly_family_income      integer,                   -- G02 Median_tot_fam_inc_weekly
    census_median_weekly_rent          integer,                 -- G02 Median_rent_weekly (self-reported, kept distinct from DCJ)
    census_median_monthly_mortgage      integer,                -- G02 Median_mortgage_repay_monthly (self-reported)
    average_persons_per_bedroom          double,                -- G02 Average_num_psns_per_bedroom
    direct_or_derived                     varchar not null default 'direct',
    data_quality_status                    varchar not null default 'passed',
    source_tables                           varchar not null default 'G01,G02,G35'
  )`);

for (const geo of GEOS) {
  const dir = path.join(PROCESSED_DIR, geo.level, geo.folder);
  const g01 = posix(path.join(dir, "2021Census_G01_AUST_" + geo.level + ".csv"));
  const g02 = posix(path.join(dir, "2021Census_G02_AUST_" + geo.level + ".csv"));
  const g35 = posix(path.join(dir, "2021Census_G35_AUST_" + geo.level + ".csv"));

  await run(`
    insert into census_demographics
    select
      '${geo.level}', g01."${geo.codeCol}", 2021,
      try_cast(g01.Tot_P_P as integer),
      try_cast(g02.Median_age_persons as double),
      try_cast(g35.Total_Total as integer),
      try_cast(g35.Total_FamHhold as integer),
      try_cast(g35.Num_Psns_UR_1_Total as integer),
      try_cast(g02.Average_household_size as double),
      try_cast(g02.Median_tot_hhd_inc_weekly as integer),
      try_cast(g02.Median_tot_prsnl_inc_weekly as integer),
      try_cast(g02.Median_tot_fam_inc_weekly as integer),
      try_cast(g02.Median_rent_weekly as integer),
      try_cast(g02.Median_mortgage_repay_monthly as integer),
      try_cast(g02.Average_num_psns_per_bedroom as double),
      'direct', 'passed', 'G01,G02,G35'
    from read_csv('${g01}', header=true, all_varchar=true) g01
    join read_csv('${g02}', header=true, all_varchar=true) g02 on g02."${geo.codeCol}" = g01."${geo.codeCol}"
    join read_csv('${g35}', header=true, all_varchar=true) g35 on g35."${geo.codeCol}" = g01."${geo.codeCol}"
  `);
  const [n] = await one(`select count(*) from census_demographics where geography_type = '${geo.level}'`);
  console.log(`  ${geo.level}: ${n} rows loaded (direct from native GCP DataPack, no correspondence)`);
}

// ── Join to the local ASGS backbone to attach geography_id (SAL_2021 codes
// are 9-digit; POA codes need 4-digit zero-padding — same convention used
// throughout this warehouse since Sprint 2). ──────────────────────────────
await run(`attach '${posix(ASGS_DB)}' as asgs (read_only)`);
await run(`
  alter table census_demographics add column geography_id varchar;
  update census_demographics d
  set geography_id = a.geography_type || '_' || a.geography_code || '_' || a.boundary_version
  from asgs.asgs_geography a
  where a.geography_type = d.geography_type
    and a.geography_code = (
      case when d.geography_type='POA' then lpad(regexp_replace(d.geography_code, '^[A-Z]+', ''), 4, '0')
           else regexp_replace(d.geography_code, '^[A-Z]+', '') end
    )
    and not a.is_quarantined
`);
const [matched] = await one("select count(*) from census_demographics where geography_id is not null");
const [unmatched] = await one("select count(*) from census_demographics where geography_id is null");
console.log(`\nGeography match: ${matched} matched to core geography backbone, ${unmatched} unmatched`);

await run(`copy census_demographics to '${posix(path.join(LOCAL_DIR, "census_demographics.parquet"))}' (format parquet, compression zstd)`);
await run("checkpoint");
db.closeSync();

const mb = (p) => (fs.statSync(p).size / 1024 / 1024).toFixed(2);
console.log("\nLocal Census demographics store built (all gitignored):");
console.log(`  warehouse/data/local/census_demographics.duckdb  ${mb(DB_PATH)} MB`);
console.log(`  warehouse/data/local/census_demographics.parquet  ${mb(path.join(LOCAL_DIR, "census_demographics.parquet"))} MB`);
console.log("No Supabase connection was made. Validate with validate_census_demographics_local_store.mjs.");
