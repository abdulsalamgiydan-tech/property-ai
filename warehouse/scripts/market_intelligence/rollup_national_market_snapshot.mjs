#!/usr/bin/env node
/**
 * Sprint 12, Workstream 6 — national canonical market mart completion.
 *
 * WS1's national coverage audit found mart.suburb_market_snapshot /
 * mart.postcode_market_snapshot already have a comprehensive national-ready
 * schema (identity/market/supply/demand/affordability/lineage columns) — no
 * rebuild needed. What was actually missing, confirmed by live querying the
 * branch at the start of this workstream:
 *
 *   1. jurisdiction is NULL for every state except NSW/VIC in both snapshot
 *      marts (SAL grain: never populated by the original build script at
 *      all — it isn't even in that script's INSERT column list. POA grain:
 *      state_code itself is NULL on core.dim_geography for postcodes, so no
 *      simple join was ever possible).
 *   2. population_growth_2016_2021_pct is 0% populated in BOTH snapshot
 *      marts for EVERY jurisdiction including NSW — Sprint 12 WS4 correctly
 *      computed and stored this figure (with full lineage) in
 *      mart.suburb_demographic_profile_2021 / postcode_demographic_profile_2021,
 *      but the wide snapshot mart's build script hardcodes this column to
 *      literal NULL on every insert/upsert and was never updated after WS4.
 *   3. QLD/SA/WA have real, substantial rent data (211,297 / 27,798 / 19,794
 *      rows in core.fact_rental_market_summary; loaded Sprint 11 WS9 via
 *      load_qld_sa_wa_rents_to_branch.mjs into mart.suburb_rent_quarterly /
 *      postcode_rent_quarterly) that was never rolled up into the wide
 *      snapshot or timeseries marts — those marts' own build script
 *      (load_market_intelligence_to_branch.mjs) is idempotent and DOES read
 *      from the shared, multi-state mart.suburb_rent_quarterly table, but it
 *      has not been re-run since QLD/SA/WA rent landed.
 *
 * This script performs a scoped, additive rollup rather than a schema
 * rebuild — the columns already exist. NSW/VIC's existing pipeline-computed
 * rent/sales values are never touched (only NULL rent cells are filled).
 * TAS/ACT/NT are NOT touched here: their only sales data is GCCSA-grain
 * (core.fact_residential_sales_summary), which is a different, coarser
 * geography_type than these SAL/POA-grain marts — rolling GCCSA data into a
 * SAL/POA row would be a fabricated cross-grain mapping and is deliberately
 * not attempted (documented as an open architecture gap in the WS6 report,
 * not silently worked around). QLD/SA/WA have zero sales at any grain, so
 * no yield rollup is possible for them either (no price to pair with rent) —
 * this correctly matches their registered meta.jurisdiction status of
 * 'rent_only'.
 *
 * Safety: WAREHOUSE_VALIDATION_DB_URL only (never printed); production ref
 * hard-refused; dry-run by default; ONE transaction with blocking post-load
 * gates (rollback on failure).
 *
 * Usage:
 *   node rollup_national_market_snapshot.mjs             # dry run
 *   node rollup_national_market_snapshot.mjs --execute
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postcodeToState } from "../lib/postcode_to_state.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const rel = (...p) => path.join(repoRoot, ...p);

const EXECUTE = process.argv.includes("--execute");
const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

try {
  process.loadEnvFile(rel(".env.local"));
} catch {}
const dbUrl = process.env.WAREHOUSE_VALIDATION_DB_URL ?? null;
if (!dbUrl) fail("WAREHOUSE_VALIDATION_DB_URL not set (hard stop)");
if (dbUrl.includes(PROD_REF)) fail("connection string references PRODUCTION — refusing (hard stop)");
if (!dbUrl.includes(BRANCH_REF)) fail(`connection string is not the warehouse-validation branch (${BRANCH_REF}) — refusing (hard stop)`);

console.log(`rollup_national_market_snapshot — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}`);
console.log(`  target policy: branch ref ${BRANCH_REF} only; production ${PROD_REF} refused in code`);

const { default: pg } = await import("pg");
const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, keepAlive: true });
client.on("error", () => {});
await client.connect();
const q = async (sql, params = []) => (await client.query(sql, params)).rows;

for (const t of [
  "mart.suburb_market_snapshot", "mart.postcode_market_snapshot",
  "mart.suburb_market_timeseries", "mart.postcode_market_timeseries",
  "mart.suburb_demographic_profile_2021", "mart.postcode_demographic_profile_2021",
  "mart.suburb_rent_quarterly", "mart.postcode_rent_quarterly", "meta.jurisdiction",
]) {
  const [chk] = await q("select to_regclass($1) r", [t]);
  if (!chk.r) fail(`${t} missing on branch (hard stop)`);
}

const [pre] = await q(`select
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and jurisdiction is null) as suburb_snap_no_jur,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and jurisdiction is null) as postcode_snap_no_jur,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and population_growth_2016_2021_pct is not null) as suburb_snap_has_growth,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null) as suburb_snap_has_rent,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null) as postcode_snap_has_rent,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
console.log("\n  branch state before:", pre);

// ── Pre-compute POA jurisdiction backfill (needs JS postcode-range logic) ─
const poaSuburbRows = await q(
  "select geography_id, geography_code from mart.postcode_market_snapshot where dwelling_type is null and jurisdiction is null"
);
const poaJurisdictionUpdates = [];
const stateToJurisdiction = { "1": "NSW", "2": "VIC", "3": "QLD", "4": "SA", "5": "WA", "6": "TAS", "7": "NT", "8": "ACT" };
for (const r of poaSuburbRows) {
  const state = postcodeToState(r.geography_code);
  const jurisdiction = state ? stateToJurisdiction[state] : null;
  if (jurisdiction) poaJurisdictionUpdates.push({ geography_id: r.geography_id, jurisdiction });
}
console.log(`  postcode jurisdiction backfill: ${poaJurisdictionUpdates.length}/${poaSuburbRows.length} postcodes resolved via Australia Post range heuristic`);

const report = {
  generated_at: new Date().toISOString(),
  branch_ref: BRANCH_REF,
  production_touched: false,
  frontend_changed: false,
  db_size_before: pre.db_size,
  scope_notes: {
    tas_act_nt_excluded: "TAS/ACT/NT sales data is GCCSA-grain only (core.fact_residential_sales_summary) — a coarser geography_type than SAL/POA. Not rolled into suburb/postcode_market_snapshot, which are strictly SAL/POA grain; would require a fabricated cross-grain mapping. Documented gap, not fixed here.",
    qld_sa_wa_yield_not_computed: "QLD/SA/WA have zero sales rows at any grain (confirmed live query) — gross_yield_pct cannot be computed for them (no price to pair with rent). Correctly matches their meta.jurisdiction status of 'rent_only'.",
    nsw_vic_rent_untouched: "Rent columns are only backfilled where currently NULL — NSW/VIC's existing pipeline-computed values (from load_market_intelligence_to_branch.mjs / load_vic_market_intelligence_to_branch.mjs) are never overwritten.",
  },
  updated: {},
  gates_after: {},
};

if (!EXECUTE) {
  console.log("\nDry run: would backfill jurisdiction (SAL via meta.jurisdiction join, POA via postcode-range heuristic),");
  console.log("backfill population_growth_2016_2021_pct from the demographic profile marts, and roll up QLD/SA/WA rent");
  console.log("into the wide snapshot + timeseries marts (rent-null rows and additive timeseries inserts only).");
  await client.end();
  process.exit(0);
}

try {
  await client.query("begin");

  // ── 1. jurisdiction backfill — SAL grain (state_code present) ──────────
  const jurSalSnap = await client.query(`
    update mart.suburb_market_snapshot s set jurisdiction = mj.jurisdiction_code, updated_at = now()
    from meta.jurisdiction mj where mj.asgs_state_code = s.state_code and s.jurisdiction is null`);
  const jurSalTs = await client.query(`
    update mart.suburb_market_timeseries s set jurisdiction = mj.jurisdiction_code
    from meta.jurisdiction mj where mj.asgs_state_code = s.state_code and s.jurisdiction is null`);
  console.log(`\n  jurisdiction backfill (SAL, via meta.jurisdiction): snapshot=${jurSalSnap.rowCount} timeseries=${jurSalTs.rowCount}`);
  report.updated.suburb_snapshot_jurisdiction = jurSalSnap.rowCount;

  // ── 2. jurisdiction backfill — POA grain (postcode-range heuristic) ────
  let poaSnapUpdated = 0;
  for (let i = 0; i < poaJurisdictionUpdates.length; i += 500) {
    const slice = poaJurisdictionUpdates.slice(i, i + 500);
    const params = [];
    const tuples = slice.map((r) => {
      const b = params.length;
      params.push(r.geography_id, r.jurisdiction);
      return `($${b + 1},$${b + 2})`;
    });
    const res = await client.query(
      `update mart.postcode_market_snapshot s set jurisdiction = v.jurisdiction, updated_at = now()
       from (values ${tuples.join(",")}) as v(geography_id, jurisdiction)
       where v.geography_id = s.geography_id and s.dwelling_type is null and s.jurisdiction is null`,
      params
    );
    poaSnapUpdated += res.rowCount;
  }
  console.log(`  jurisdiction backfill (POA, via Australia Post postcode ranges): snapshot=${poaSnapUpdated}`);
  report.updated.postcode_snapshot_jurisdiction = poaSnapUpdated;

  // ── 3. population_growth_2016_2021_pct backfill from WS4's demographic marts ─
  const growthSal = await client.query(`
    update mart.suburb_market_snapshot s set population_growth_2016_2021_pct = d.population_growth_2016_2021_pct,
      metric_provenance = coalesce(s.metric_provenance,'{}'::jsonb) || jsonb_build_object('population_growth_source','sprint12_ws4_2016_2021_bridge'),
      updated_at = now()
    from mart.suburb_demographic_profile_2021 d
    where d.geography_id = s.geography_id and s.dwelling_type is null
      and s.population_growth_2016_2021_pct is null and d.population_growth_2016_2021_pct is not null`);
  const growthPoa = await client.query(`
    update mart.postcode_market_snapshot s set population_growth_2016_2021_pct = d.population_growth_2016_2021_pct,
      metric_provenance = coalesce(s.metric_provenance,'{}'::jsonb) || jsonb_build_object('population_growth_source','sprint12_ws4_2016_2021_bridge'),
      updated_at = now()
    from mart.postcode_demographic_profile_2021 d
    where d.geography_id = s.geography_id and s.dwelling_type is null
      and s.population_growth_2016_2021_pct is null and d.population_growth_2016_2021_pct is not null`);
  console.log(`  population_growth_2016_2021_pct backfill: suburb=${growthSal.rowCount} postcode=${growthPoa.rowCount}`);
  report.updated.suburb_snapshot_population_growth = growthSal.rowCount;
  report.updated.postcode_snapshot_population_growth = growthPoa.rowCount;

  // ── 4. QLD/SA/WA rent rollup into the wide snapshot (rent-null rows only) ─
  const rollupSnapshotRent = async (snapshotTable, rentMart) => {
    const r = await client.query(`
      with rent_latest as (
        select geography_id, max(reference_quarter) as rq from ${rentMart} where dwelling_type = 'all' group by 1
      ),
      rent_data as (
        select r.geography_id, rl.rq as rent_period, r.median_weekly_rent as rent_now, r.sample_size_confidence as rent_conf,
          (select r2.median_weekly_rent from ${rentMart} r2
             where r2.geography_id = r.geography_id and r2.dwelling_type = 'all'
               and r2.reference_quarter = rl.rq - interval '1 year' limit 1) as rent_prev
        from ${rentMart} r join rent_latest rl on rl.geography_id = r.geography_id and rl.rq = r.reference_quarter
        where r.dwelling_type = 'all'
      )
      update ${snapshotTable} s set
        median_weekly_rent_latest = rd.rent_now,
        median_weekly_rent_prev = rd.rent_prev,
        annual_rent_change_pct = case when rd.rent_prev > 0 then round((rd.rent_now - rd.rent_prev) / rd.rent_prev * 100, 2) else null end,
        rent_confidence = rd.rent_conf,
        latest_rent_period = rd.rent_period,
        coverage_status = case when s.sales_volume_12m is not null then 'full' else 'partial' end,
        metric_provenance = coalesce(s.metric_provenance,'{}'::jsonb) || jsonb_build_object('rent_source','sprint12_ws6_multi_state_rollup'),
        updated_at = now()
      from rent_data rd
      where rd.geography_id = s.geography_id and s.dwelling_type is null and s.median_weekly_rent_latest is null`);
    return r.rowCount;
  };
  report.updated.suburb_snapshot_rent_rollup = await rollupSnapshotRent("mart.suburb_market_snapshot", "mart.suburb_rent_quarterly");
  report.updated.postcode_snapshot_rent_rollup = await rollupSnapshotRent("mart.postcode_market_snapshot", "mart.postcode_rent_quarterly");
  console.log(`  rent rollup into wide snapshot (previously-NULL rent cells only): suburb=${report.updated.suburb_snapshot_rent_rollup} postcode=${report.updated.postcode_snapshot_rent_rollup}`);

  // ── 5. QLD/SA/WA rent rollup into the timeseries marts (purely additive) ─
  const rollupTimeseriesRent = async (tsTable, rentMart, geoType, stateCode, sourceDataset) => {
    const r = await client.query(`
      insert into ${tsTable} (geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family, median_weekly_rent, confidence_label, source_dataset, jurisdiction, state_code)
      select rq.geography_id, '${geoType}', rq.reference_quarter, 'quarter', null, 'rent', rq.median_weekly_rent, rq.confidence_label, $1, mj.jurisdiction_code, d.state_code
      from ${rentMart} rq
      join core.dim_geography d on d.geography_id = rq.geography_id
      join meta.jurisdiction mj on mj.asgs_state_code = d.state_code
      where rq.dwelling_type = 'all' and d.state_code = $2
        and rq.reference_quarter >= (select max(reference_quarter) - interval '24 months' from ${rentMart} where dwelling_type = 'all')
      on conflict (geography_id, reference_period, period_type, (coalesce(dwelling_type,'')), metric_family) do nothing`,
      [sourceDataset, stateCode]
    );
    return r.rowCount;
  };
  let suburbTsRent = 0, postcodeTsRent = 0;
  for (const [stateCode, sourceDataset] of [["3", "qld_rta_bond_statistics"], ["4", "sa_private_rent_report"], ["5", "wa_dmirs_bond_lodgements"]]) {
    suburbTsRent += await rollupTimeseriesRent("mart.suburb_market_timeseries", "mart.suburb_rent_quarterly", "SAL", stateCode, sourceDataset);
    postcodeTsRent += await rollupTimeseriesRent("mart.postcode_market_timeseries", "mart.postcode_rent_quarterly", "POA", stateCode, sourceDataset);
  }
  console.log(`  rent rollup into timeseries (QLD/SA/WA, additive, trailing 24m): suburb=${suburbTsRent} postcode=${postcodeTsRent}`);
  report.updated.suburb_timeseries_rent_rollup = suburbTsRent;
  report.updated.postcode_timeseries_rent_rollup = postcodeTsRent;

  // ── Post-load blocking gates ────────────────────────────────────────────
  const [post] = await q(`select
    (select count(*)::int from (select geography_id from mart.suburb_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_suburb_snapshot,
    (select count(*)::int from (select geography_id from mart.postcode_market_snapshot where dwelling_type is null group by 1 having count(*)>1) x) as dup_postcode_snapshot,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null and rent_confidence is null) as rent_missing_label_suburb,
    (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null and rent_confidence is null) as rent_missing_label_postcode,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_weekly_rent_latest < 0) as negative_rent_suburb,
    (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and median_weekly_rent_latest < 0) as negative_rent_postcode,
    (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and population_growth_2016_2021_pct < -100) as impossible_growth_suburb,
    (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.suburb_market_timeseries group by 1,2,3,4,5 having count(*)>1) x) as dup_suburb_ts,
    (select count(*)::int from (select geography_id, reference_period, period_type, coalesce(dwelling_type,''), metric_family from mart.postcode_market_timeseries group by 1,2,3,4,5 having count(*)>1) x) as dup_postcode_ts,
    (select count(*)::int from mart.suburb_market_snapshot s where dwelling_type is null and not exists (select 1 from core.dim_geography g where g.geography_id = s.geography_id)) as orphan_suburb_snapshot,
    pg_size_pretty(pg_database_size(current_database())) as db_now`);
  report.gates_after = post;
  console.log(`\nPost-load gates: dup_snapshot=${Number(post.dup_suburb_snapshot) + Number(post.dup_postcode_snapshot)} rent_missing_label=${Number(post.rent_missing_label_suburb) + Number(post.rent_missing_label_postcode)} negative_rent=${Number(post.negative_rent_suburb) + Number(post.negative_rent_postcode)} impossible_growth=${post.impossible_growth_suburb} dup_ts=${Number(post.dup_suburb_ts) + Number(post.dup_postcode_ts)} orphan=${post.orphan_suburb_snapshot} db_now=${post.db_now}`);
  const failCount = [
    post.dup_suburb_snapshot, post.dup_postcode_snapshot, post.rent_missing_label_suburb, post.rent_missing_label_postcode,
    post.negative_rent_suburb, post.negative_rent_postcode, post.impossible_growth_suburb, post.dup_suburb_ts, post.dup_postcode_ts, post.orphan_suburb_snapshot,
  ].map(Number).reduce((a, b) => a + b, 0);
  if (failCount > 0) {
    await client.query("rollback");
    fail("post-load gates FAILED — transaction rolled back, branch unchanged (hard stop)");
  }
  for (const [rule, failed] of [
    ["no_duplicate_grain", Number(post.dup_suburb_snapshot) + Number(post.dup_postcode_snapshot) + Number(post.dup_suburb_ts) + Number(post.dup_postcode_ts)],
    ["price_range_sanity", Number(post.negative_rent_suburb) + Number(post.negative_rent_postcode)],
    ["confidence_completeness", Number(post.rent_missing_label_suburb) + Number(post.rent_missing_label_postcode)],
    ["geo_code_valid", post.orphan_suburb_snapshot],
  ]) {
    await client.query(
      "insert into meta.data_quality_result (rule_id, severity, status, failed_record_count, details) values ($1,'blocker',$2,$3,$4)",
      [rule, failed === 0 ? "passed" : "failed", failed, JSON.stringify({ stage: "sprint12_ws6_national_snapshot_rollup" })]
    );
  }
  await client.query("commit");
  console.log("\nBranch load COMMITTED (branch only; production untouched).");
} catch (err) {
  try { await client.query("rollback"); } catch {}
  try { await client.end(); } catch {}
  fail(`load aborted, transaction rolled back: ${String(err.message).slice(0, 500)}`);
}

const [summary] = await q(`select
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and jurisdiction is not null) as suburb_snap_has_jur,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and jurisdiction is not null) as postcode_snap_has_jur,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and population_growth_2016_2021_pct is not null) as suburb_snap_has_growth,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and population_growth_2016_2021_pct is not null) as postcode_snap_has_growth,
  (select count(*)::int from mart.suburb_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null) as suburb_snap_has_rent,
  (select count(*)::int from mart.postcode_market_snapshot where dwelling_type is null and median_weekly_rent_latest is not null) as postcode_snap_has_rent,
  pg_size_pretty(pg_database_size(current_database())) as db_size`);
report.core_state_after = summary;
await client.end();

fs.writeFileSync(rel("warehouse", "reports", "sprint12_ws6_national_snapshot_rollup_report.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nRun report written: warehouse/reports/sprint12_ws6_national_snapshot_rollup_report.json");
console.log(summary);
