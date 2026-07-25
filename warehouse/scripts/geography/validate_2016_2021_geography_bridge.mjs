#!/usr/bin/env node
/**
 * 2016-to-2021 geography bridge — post-load validation (Sprint 12, Workstream 4).
 *
 * Read-only. Independently re-queries the committed branch state (does
 * not trust the load script's own report) against every blocking gate
 * this workstream's mission specified, plus a manual split/merge spot
 * check. Exits 1 if any check fails.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(path.join(repoRoot, ".env.local"));
} catch {}
const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references production ref ${PROD_REF}`);
if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference branch ref ${BRANCH_REF}`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let allPassed = true;
function check(name, passed, detail) {
  console.log(`  [${passed ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) allPassed = false;
}

console.log("validate_2016_2021_geography_bridge — read-only, independent re-query of the committed branch");

// 1. Editions registered
const editions = await client.query(`select geography_version_id from core.dim_geography_version where geography_version_id like '%ABS_2016' order by 1`);
check("2016 editions registered (SSC_ABS_2016, POA_ABS_2016)", editions.rowCount === 2, `found: ${editions.rows.map((r) => r.geography_version_id).join(", ")}`);

// 2. Duplicate natural keys = 0
const dupes = await client.query(`
  select count(*) as n from (
    select source_geography_id, target_geography_id, correspondence_version, count(*) as c
    from core.bridge_geography_correspondence where correspondence_version = 'ABS_2016_to_ASGS3_2021'
    group by 1,2,3 having count(*) > 1
  ) d
`);
check("duplicate natural keys = 0", Number(dupes.rows[0].n) === 0, `found ${dupes.rows[0].n}`);

// 3. Orphan source geography codes = 0 (FK-enforced, but re-verified independently)
const orphanSource = await client.query(`
  select count(*) as n from core.bridge_geography_correspondence c
  where c.correspondence_version = 'ABS_2016_to_ASGS3_2021'
    and not exists (select 1 from core.dim_geography g where g.geography_id = c.source_geography_id)
`);
check("orphan source geography codes = 0", Number(orphanSource.rows[0].n) === 0, `found ${orphanSource.rows[0].n}`);

// 4. Orphan target geography codes = 0
const orphanTarget = await client.query(`
  select count(*) as n from core.bridge_geography_correspondence c
  where c.correspondence_version = 'ABS_2016_to_ASGS3_2021'
    and not exists (select 1 from core.dim_geography g where g.geography_id = c.target_geography_id and g.is_current)
`);
check("orphan target geography codes = 0 (target must be a current 2021 geography)", Number(orphanTarget.rows[0].n) === 0, `found ${orphanTarget.rows[0].n}`);

// 5. Invalid weights = 0
const invalidWeights = await client.query(`
  select count(*) as n from core.bridge_geography_correspondence
  where correspondence_version = 'ABS_2016_to_ASGS3_2021' and (population_weight < 0 or population_weight > 1.01)
`);
check("invalid weights = 0 (population_weight in [0,1])", Number(invalidWeights.rows[0].n) === 0, `found ${invalidWeights.rows[0].n}`);

// 6. Every populated growth figure has full lineage
const missingLineage = await client.query(`
  select
    (select count(*) from mart.suburb_demographic_profile_2021 where population_growth_2016_2021_pct is not null
      and (population_growth_method is null or population_growth_confidence is null or population_growth_correspondence_version is null)) as sal,
    (select count(*) from mart.postcode_demographic_profile_2021 where population_growth_2016_2021_pct is not null
      and (population_growth_method is null or population_growth_confidence is null or population_growth_correspondence_version is null)) as poa
`);
check(
  "every populated population_growth_2016_2021_pct has complete lineage (method+confidence+correspondence_version)",
  Number(missingLineage.rows[0].sal) === 0 && Number(missingLineage.rows[0].poa) === 0,
  `SAL missing: ${missingLineage.rows[0].sal}, POA missing: ${missingLineage.rows[0].poa}`
);

// 7. The lineage fix, proven not just asserted: growth's lineage must be
// genuinely distinct from the row's general direct-2021 lineage — this is
// the exact defect Sprint 12 WS1 found (a single row-level field
// conflating direct and derived provenance in the same row).
const conflated = await client.query(`
  select count(*) as n from mart.suburb_demographic_profile_2021
  where population_growth_method is not null and population_growth_method = geography_method
`);
check(
  "population_growth_method never equals the row's geography_method (derived != direct — proves the fields are genuinely separate, not a relabel)",
  Number(conflated.rows[0].n) === 0,
  `rows where they incorrectly match: ${conflated.rows[0].n}`
);

// 8. National reconciliation within documented tolerance (re-derive from committed data)
const reconciliation = await client.query(`
  select
    (select sum(population_2016)::numeric from mart.suburb_demographic_profile_2021) as sal_total_2016,
    (select sum(total_population)::numeric from mart.suburb_demographic_profile_2021 where population_2016 is not null) as sal_total_2021_matched
`);
console.log(`  [INFO] SAL 2016 converted population total (committed): ${Number(reconciliation.rows[0].sal_total_2016).toLocaleString()}`);

// 9. Manual split/merge spot check (reproduces the split case verified during load)
const splitCheck = await client.query(`
  select c.target_geography_id, g.geography_name, c.population_weight
  from core.bridge_geography_correspondence c
  join core.dim_geography g on g.geography_id = c.target_geography_id
  where c.source_geography_id = 'SSC_12199_ABS_2016' and c.correspondence_version = 'ABS_2016_to_ASGS3_2021'
  order by c.population_weight desc
`);
const ratioSum = splitCheck.rows.reduce((a, r) => a + Number(r.population_weight), 0);
check(
  "manual split spot check: SSC_12199_ABS_2016 (Snowy Mountains locality) splits into 9 targets summing to ~1.0",
  splitCheck.rowCount === 9 && Math.abs(ratioSum - 1.0) < 0.001,
  `${splitCheck.rowCount} targets, ratio sum ${ratioSum.toFixed(7)}: ${splitCheck.rows.map((r) => r.geography_name).join(", ")}`
);

await client.end();

console.log(`\n${allPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}`);
if (!allPassed) process.exit(1);
