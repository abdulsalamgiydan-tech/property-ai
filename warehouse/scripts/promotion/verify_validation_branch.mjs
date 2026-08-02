#!/usr/bin/env node
/**
 * Independent READ-ONLY re-verification of the SA+VIC official-metrics load on
 * the Supabase VALIDATION BRANCH. Opens a fresh connection, runs SELECTs only
 * (no DDL/DML), and confirms the loaded candidate matches the committed manifest.
 *
 * SAFETY: read-only. Same fail-closed branch/prod guard as the loader; refuses if
 * the connection string references Production, or does not reference the branch.
 * The URL is never printed. No write is issued.
 *
 * Usage: node warehouse/scripts/promotion/verify_validation_branch.mjs
 */
import pg from "pg";
import fs from "fs";

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const MANIFEST_PATH = "warehouse/reports/v4a/validation_load_manifest.json";
function fail(msg) { console.error(`FAIL CLOSED (verify): ${msg}`); process.exit(1); }
const n = (r) => Number(Object.values(r.rows[0])[0]);

async function main() {
  process.loadEnvFile(".env.local");
  const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
  if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set");
  if (DB_URL.includes(PROD_REF)) fail(`refusing: references PRODUCTION ref ${PROD_REF}`);
  if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: does not reference validation branch ref ${BRANCH_REF}`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
  await client.connect();
  const results = [];
  const assert = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
  try {
    const db = (await client.query("select current_database() db, current_user usr")).rows[0];

    const core = n(await client.query("select count(*)::int c from core.official_observation"));
    const mart = n(await client.query("select count(*)::int c from mart.official_suburb_metric"));
    const view = n(await client.query("select count(*)::int c from public.v_official_suburb_metric_v1"));
    assert("core_count_matches_manifest", core === manifest.total_rows, `core=${core} manifest=${manifest.total_rows}`);
    assert("mart_present", mart > 0, `mart=${mart}`);
    assert("view_direct_only_present", view > 0, `view=${view}`);

    // The public v1 view is DIRECT-only by design; derived yields live in the
    // internal mart (status='derived'), not the public view.
    const derivedInMart = n(await client.query("select count(*)::int c from mart.official_suburb_metric where status='derived'"));
    assert("derived_yields_in_mart", derivedInMart === (manifest.by_status.derived || 0), `mart derived=${derivedInMart} manifest=${manifest.by_status.derived}`);
    const derivedInView = n(await client.query("select count(*)::int c from public.v_official_suburb_metric_v1 where status<>'direct'"));
    assert("view_is_direct_only", derivedInView === 0, `non-direct in view=${derivedInView}`);

    // A sample SA suburb (Belair SAL_40085): direct price + rent visible in the view.
    const belair = (await client.query("select metric from public.v_official_suburb_metric_v1 where geography_id='SAL_40085_ASGS3_2021' order by metric")).rows.map((r) => r.metric);
    assert("sa_belair_direct_metrics_in_view", belair.includes("median_house_price") && belair.includes("median_rent"), `metrics=${JSON.stringify(belair)}`);
    // Belair yield present in the internal mart (derived), not the public view.
    const belairYield = n(await client.query("select count(*)::int c from mart.official_suburb_metric where geography_id='SAL_40085_ASGS3_2021' and metric='gross_yield'"));
    assert("sa_belair_yield_in_mart", belairYield === 1, `belair yield in mart=${belairYield}`);

    // A VIC suburb: bedroom-specific rent visible in the view (bedroom_group <> 'all').
    const vicBedroom = n(await client.query("select count(*)::int c from public.v_official_suburb_metric_v1 where geography_id like 'SAL_2%' and metric='median_rent' and bedroom_group <> 'all'"));
    assert("vic_bedroom_specific_rent_in_view", vicBedroom > 0, `vic bedroom-specific rent rows=${vicBedroom}`);

    // Calderwood rule: no postcode / contextual row reaches the public view.
    const poa = n(await client.query("select count(*)::int c from public.v_official_suburb_metric_v1 where geography_id like 'POA_%'"));
    const ctx = n(await client.query("select count(*)::int c from public.v_official_suburb_metric_v1 where status='contextual'"));
    assert("no_postcode_or_contextual_in_view", poa === 0 && ctx === 0, `POA=${poa} contextual=${ctx}`);

    const allOk = results.every((r) => r.ok);
    console.log(`\nRead-only re-verification — branch ref ${BRANCH_REF} (production=false), db=${db.db} user=${db.usr}`);
    console.log(`core=${core} mart=${mart} view=${view} (manifest total=${manifest.total_rows}, sha256=${manifest.payload_sha256})`);
    for (const r of results) console.log(`  [${r.ok ? "PASS" : "FAIL"}] ${r.name} — ${r.detail}`);
    console.log(`\n${allOk ? "READ-ONLY VERIFICATION PASSED" : "VERIFICATION FAILED"} — Production ref never referenced.`);
    if (!allOk) process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();
