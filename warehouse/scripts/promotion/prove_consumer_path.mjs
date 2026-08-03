#!/usr/bin/env node
/**
 * READ-ONLY proof that the official-metrics candidate is consumable through the
 * privilege-accurate consumer path on the Supabase VALIDATION BRANCH.
 *
 * The public consumer (anon) reaches the data only via the direct-only view
 * public.v_official_suburb_metric_v1 (migration 056) and the SECURITY DEFINER
 * RPCs. This script SETs ROLE anon (exactly the privilege context PostgREST uses
 * for an anon request) and confirms:
 *   - SA complete + partial profiles return their supported direct metrics with
 *     source + period + status;
 *   - VIC exposes only its supported direct bedroom-specific rents;
 *   - anon has NO direct access to the internal core/mart tables;
 *   - Calderwood regression: existing direct price intact (get_market_snapshot_v2),
 *     postcode rent stays contextual (no POA_ row / no contextual in the view),
 *     and no false suburb yield exists.
 *
 * NOTE ON FRESHNESS + DERIVED YIELDS: the 056 view is direct-only and omits
 * retrieved_at, so freshness and the derived yields are proven through the new
 * consumer RPC (migration 057) in the LOCAL rehearsal — 057 is NOT applied here
 * (no remote write). This script proves what is actually deployed on the branch.
 *
 * SAFETY: read-only (SELECT / set role only); same fail-closed prod-ref guard as
 * the loader; the URL is never printed. No write is issued.
 *
 * Usage: node warehouse/scripts/promotion/prove_consumer_path.mjs
 */
import pg from "pg";
import fs from "fs";
import path from "path";

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const CALDERWOOD = "SAL_10749_ASGS3_2021";
const REPORT_PATH = "warehouse/reports/v4a/consumer_path_proof.json";
function fail(msg) { console.error(`FAIL CLOSED (prove_consumer_path): ${msg}`); process.exit(1); }

async function main() {
  process.loadEnvFile(".env.local");
  const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
  if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set");
  if (DB_URL.includes(PROD_REF)) fail(`refusing: references PRODUCTION ref ${PROD_REF}`);
  if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: does not reference validation branch ref ${BRANCH_REF}`);

  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 30000 });
  await client.connect();
  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const evidence = {};
  try {
    // Everything below runs as the anon role — the actual consumer privilege.
    await client.query("set role anon");

    // --- SA complete profile: the SA suburb with the most direct metrics -------
    const saComplete = (await client.query(`
      select geography_id from public.v_official_suburb_metric_v1
      where geography_id like 'SAL_4%'
      group by geography_id order by count(distinct metric) desc, geography_id limit 1`)).rows[0].geography_id;
    const saCompleteRows = (await client.query(`
      select metric, property_type, bedroom_group, value, unit, period_end, status, source_id, attribution
      from public.v_official_suburb_metric_v1 where geography_id = $1 order by metric, property_type`, [saComplete])).rows;
    evidence.sa_complete = { geography_id: saComplete, rows: saCompleteRows };
    const saMetrics = new Set(saCompleteRows.map((r) => r.metric));
    push("sa_complete_has_price_and_rent", saMetrics.has("median_house_price") && saMetrics.has("median_rent"), `${saComplete}: metrics=${[...saMetrics].join(",")}`);
    push("sa_complete_rows_carry_source_period_status", saCompleteRows.every((r) => r.source_id && r.period_end && r.status), `all ${saCompleteRows.length} rows carry source_id+period_end+status`);

    // --- SA partial profile: a SA suburb with rent but NO house price ----------
    const saPartial = (await client.query(`
      select geography_id from public.v_official_suburb_metric_v1 v
      where geography_id like 'SAL_4%' and metric = 'median_rent'
        and not exists (select 1 from public.v_official_suburb_metric_v1 x where x.geography_id = v.geography_id and x.metric = 'median_house_price')
      group by geography_id order by geography_id limit 1`)).rows[0]?.geography_id ?? null;
    if (saPartial) {
      const partialRows = (await client.query(`select metric, property_type, value, period_end, status, source_id from public.v_official_suburb_metric_v1 where geography_id=$1 order by metric, property_type`, [saPartial])).rows;
      evidence.sa_partial = { geography_id: saPartial, rows: partialRows };
      push("sa_partial_has_rent_no_price", partialRows.some((r) => r.metric === "median_rent") && !partialRows.some((r) => r.metric === "median_house_price"), `${saPartial}: metrics=${partialRows.map((r) => r.metric).join(",")}`);
      // A partial profile (no price) must not carry a yield in any consumer surface.
      push("sa_partial_no_yield", !partialRows.some((r) => r.metric === "gross_yield"), "no gross_yield without a house price");
    } else {
      push("sa_partial_present", false, "no SA rent-only suburb found (unexpected)");
    }

    // --- VIC: only supported DIRECT bedroom-specific rents ---------------------
    const vicRows = (await client.query(`
      select distinct metric, property_type, bedroom_group, status
      from public.v_official_suburb_metric_v1 where geography_id like 'SAL_2%' order by 1,2,3`)).rows;
    evidence.vic_shape = vicRows;
    const vicOnlyRent = vicRows.every((r) => r.metric === "median_rent" && r.status === "direct");
    const vicBedroomSpecific = vicRows.some((r) => r.bedroom_group !== "all");
    const vicNoYield = !vicRows.some((r) => r.metric === "gross_yield");
    push("vic_only_direct_rent", vicOnlyRent, `distinct VIC (metric,status)=${vicRows.map((r) => r.metric + "/" + r.status).join(",")}`);
    push("vic_is_bedroom_specific", vicBedroomSpecific, `bedroom groups present=${[...new Set(vicRows.map((r) => r.bedroom_group))].join(",")}`);
    push("vic_no_yield", vicNoYield, "VIC has no house price -> no yield exposed");

    // --- Calderwood regression (contextual postcode rule) ----------------------
    const poaInView = Number((await client.query(`select count(*)::int c from public.v_official_suburb_metric_v1 where geography_id like 'POA_%'`)).rows[0].c);
    const ctxInView = Number((await client.query(`select count(*)::int c from public.v_official_suburb_metric_v1 where status <> 'direct'`)).rows[0].c);
    push("no_postcode_row_in_official_view", poaInView === 0, `POA_ rows in view=${poaInView}`);
    push("no_contextual_in_official_view", ctxInView === 0, `non-direct rows in view=${ctxInView}`);

    // --- anon has NO direct access to internal core/mart -----------------------
    const denied = async (sql) => { try { await client.query(sql); return false; } catch { return true; } };
    const coreDenied = await denied("select 1 from core.official_observation limit 1");
    const martDenied = await denied("select 1 from mart.official_suburb_metric limit 1");
    push("anon_denied_core_official_observation", coreDenied, "select on core.official_observation raises for anon");
    push("anon_denied_mart_official_suburb_metric", martDenied, "select on mart.official_suburb_metric raises for anon");

    // --- Calderwood existing direct price intact (existing consumer RPC) --------
    await client.query("reset role");
    await client.query("set role anon");
    // Only 052-contract columns are selected here: migration 055 (which adds
    // direct_or_derived etc.) is PREPARED/UNAPPLIED on the branch.
    let calder = null;
    try {
      calder = (await client.query(`select geography_id, median_sale_price_12m, median_weekly_rent_latest from public.get_market_snapshot_v2($1)`, [CALDERWOOD])).rows[0] ?? null;
    } catch (e) { calder = { error: e.message }; }
    evidence.calderwood_snapshot = calder;
    push("calderwood_direct_price_intact", !!calder && !calder.error && calder.median_sale_price_12m != null, `median_sale_price_12m=${calder?.median_sale_price_12m}`);

    await client.query("reset role");
    const allOk = checks.every((c) => c.ok);
    const report = {
      generated_at: new Date().toISOString(),
      target: { supabase_branch_ref: BRANCH_REF, is_production: false },
      consumer_privilege: "set role anon (PostgREST anon-request equivalent)",
      note: "Freshness (retrieved_at) and derived yields are proven via the new consumer RPC get_official_suburb_metrics_v1 (migration 057) in the LOCAL rehearsal; 057 is NOT applied to the branch (no remote write). This proves the deployed 056 direct-only view path.",
      checks, all_checks_passed: allOk, evidence,
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log(`\nConsumer-path proof (branch ${BRANCH_REF}, anon role, read-only)`);
    console.log(`SA complete: ${saComplete} (${saMetrics.size} metrics)  SA partial: ${saPartial}`);
    for (const c of checks) console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.name} — ${c.detail}`);
    console.log(`\n${allOk ? "CONSUMER-PATH PROOF PASSED" : "PROOF FAILED"} — report -> ${REPORT_PATH}`);
    if (!allOk) process.exitCode = 1;
  } finally {
    try { await client.query("reset role"); } catch { /* ignore */ }
    await client.end();
  }
}
main();
