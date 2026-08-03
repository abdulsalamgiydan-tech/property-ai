#!/usr/bin/env node
/**
 * GUARDED one-shot loader: applies migration 056 and loads the deterministic
 * SA+VIC official-metrics candidate into the designated Supabase VALIDATION
 * BRANCH only, then runs the full check suite (preflight / post-load / security-
 * grant / idempotency / conflict / rollback) and STOPS. Emits a machine+human
 * report. No promotion beyond the validation branch.
 *
 * HARD SAFETY GUARANTEES:
 *   - Loads WAREHOUSE_VALIDATION_DB_URL and FAILS CLOSED if it references the
 *     Production ref, or does NOT reference the validation branch ref (same guard
 *     as warehouse/scripts/orchestration/check_freshness.mjs). The URL is never
 *     printed.
 *   - Only additive objects (migration 056) are created + rows inserted; no
 *     existing object is altered/dropped; no Storage/Vercel/env/main/Production.
 *   - All writes are idempotent (create ... if not exists; insert ... on conflict
 *     do nothing). An existing observation id with DIFFERENT content is never
 *     overwritten. statement_timeout set; SSL on.
 *   - Requires --confirm-validation-load (no accidental run).
 *
 * Usage:
 *   node warehouse/scripts/promotion/load_validation_branch.mjs --confirm-validation-load
 */
import pg from "pg";
import fs from "fs";
import path from "path";
import { INSERT_OBSERVATION, INSERT_MART, POSTLOAD_VALIDATIONS, observationValues } from "./officialPromotion.mjs";

const BRANCH_REF = "lzonauinzatmtytyoems";
const PROD_REF = "oshquaxsloolqucwvigc";
const arg = (name, def) => { const i = process.argv.indexOf(name); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def; };
const CONFIRM = process.argv.includes("--confirm-validation-load");
const PAYLOAD_PATH = arg("--payload", "warehouse/data/local/v4a_payload/merged_payload.json");
const MANIFEST_PATH = arg("--manifest", "warehouse/reports/v4a/validation_load_manifest.json");
const MIGRATION_PATH = "supabase/migrations/056_official_suburb_metrics.sql";
const REPORT_PATH = arg("--report", "warehouse/reports/v4a/validation_load_report.json");

function fail(msg) { console.error(`FAIL CLOSED (load_validation_branch): ${msg}`); process.exit(1); }
const check = (name, ok, detail) => ({ name, ok: !!ok, detail });
const n = (r) => Number(Object.values(r.rows[0])[0]);

async function main() {
  if (!CONFIRM) fail("refusing: pass --confirm-validation-load to run the guarded validation-branch load");

  process.loadEnvFile(".env.local");
  const DB_URL = process.env.WAREHOUSE_VALIDATION_DB_URL;
  if (!DB_URL) fail("WAREHOUSE_VALIDATION_DB_URL not set in .env.local");
  if (DB_URL.includes(PROD_REF)) fail(`refusing: connection string references PRODUCTION ref ${PROD_REF}`);
  if (!DB_URL.includes(BRANCH_REF)) fail(`refusing: connection string does not reference validation branch ref ${BRANCH_REF}`);

  const payload = JSON.parse(fs.readFileSync(PAYLOAD_PATH, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const rows = payload.rows;
  if (!Array.isArray(rows) || rows.length === 0) fail("empty payload");
  if (payload.payload_sha256 !== manifest.payload_sha256) fail("payload/manifest checksum mismatch — rebuild the payload");
  if (rows.length !== manifest.total_rows) fail(`row count ${rows.length} != manifest ${manifest.total_rows}`);
  // Expected mart rows = unique (geo,metric,pt,bg,pe) among direct/derived rows.
  const martKeys = new Set(rows.filter((r) => r.status === "direct" || r.status === "derived").map((r) => `${r.geo}|${r.metric}|${r.pt}|${r.bg}|${r.pe}`));
  const expectedMart = martKeys.size;

  const migration = fs.readFileSync(MIGRATION_PATH, "utf8");
  const checks = [];
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false }, statement_timeout: 60000 });
  await client.connect();
  try {
    // --- 1. Preflight: confirm branch (not prod) + existing objects intact ----
    const db = (await client.query("select current_database() db, current_user usr")).rows[0];
    const has = async (schema, name, kind) => n(await client.query(
      kind === "view"
        ? `select count(*)::int c from information_schema.views where table_schema=$1 and table_name=$2`
        : `select count(*)::int c from information_schema.tables where table_schema=$1 and table_name=$2`,
      [schema, name])) === 1;
    const existingIntact = (await has("mart", "suburb_market_snapshot")) && (await has("public", "v_suburb_market_snapshot_v1", "view"));
    checks.push(check("preflight_existing_055_objects_intact", existingIntact, "mart.suburb_market_snapshot + public.v_suburb_market_snapshot_v1 present"));
    const rolesPresent = n(await client.query(`select count(*)::int c from pg_roles where rolname in ('anon','authenticated')`)) === 2;
    checks.push(check("preflight_supabase_roles_present", rolesPresent, "anon + authenticated exist"));

    // Pre-existing conflict scan (only meaningful on a re-run where the table
    // already exists): any payload id already stored with DIFFERENT content aborts.
    const officialExists = await has("core", "official_observation");
    let preConflicts = 0;
    if (officialExists) {
      const ids = rows.map((r) => r.id);
      const existing = await client.query(`select observation_id, value::text v from core.official_observation where observation_id = any($1)`, [ids]);
      const byId = new Map(existing.rows.map((e) => [e.observation_id, e.v]));
      for (const r of rows) { const v = byId.get(r.id); if (v !== undefined && Number(v) !== Number(r.val)) preConflicts++; }
    }
    checks.push(check("preflight_no_preexisting_content_conflict", preConflicts === 0, `pre-existing conflicting ids: ${preConflicts}`));
    if (preConflicts > 0) throw new Error("aborting: pre-existing content conflict (fail closed)");

    // --- 2. Apply migration 056 (additive, idempotent) ------------------------
    await client.query(migration);
    checks.push(check("migration_056_applied", await has("core", "official_observation") && await has("mart", "official_suburb_metric") && await has("public", "v_official_suburb_metric_v1", "view"), "core+mart tables + public view exist"));

    // --- 3. Load the exact payload (idempotent, transactional) ----------------
    await client.query("begin");
    for (const r of rows) await client.query(INSERT_OBSERVATION, observationValues(r));
    for (const r of rows) await client.query(INSERT_MART, [r.id]);
    await client.query("commit");

    const coreCount = n(await client.query(`select count(*)::int c from core.official_observation`));
    const martCount = n(await client.query(`select count(*)::int c from mart.official_suburb_metric`));
    const viewCount = n(await client.query(`select count(*)::int c from public.v_official_suburb_metric_v1`));
    checks.push(check("core_row_count_matches_payload", coreCount === rows.length, `core=${coreCount} payload=${rows.length}`));
    checks.push(check("mart_row_count_matches_expected", martCount === expectedMart, `mart=${martCount} expected=${expectedMart}`));

    // --- 4. Post-load validations (each must be 0) ----------------------------
    for (const v of POSTLOAD_VALIDATIONS) {
      const violations = n(await client.query(v.sql));
      checks.push(check(`postload_${v.name}`, violations === 0, `violations=${violations}`));
    }

    // --- 5. Security / least-privilege grants ---------------------------------
    const priv = async (role, obj, p) => (await client.query(`select has_table_privilege($1,$2,$3) ok`, [role, obj, p])).rows[0].ok;
    const anonView = await priv("anon", "public.v_official_suburb_metric_v1", "SELECT");
    const authView = await priv("authenticated", "public.v_official_suburb_metric_v1", "SELECT");
    const anonCore = await priv("anon", "core.official_observation", "SELECT");
    const authCore = await priv("authenticated", "core.official_observation", "SELECT");
    const anonMart = await priv("anon", "mart.official_suburb_metric", "SELECT");
    const authMart = await priv("authenticated", "mart.official_suburb_metric", "SELECT");
    checks.push(check("grant_anon_authenticated_select_view", anonView && authView, `anon=${anonView} authenticated=${authView}`));
    checks.push(check("no_grant_on_core_internal", !anonCore && !authCore, `anon=${anonCore} authenticated=${authCore} (must be false)`));
    checks.push(check("no_grant_on_mart_internal", !anonMart && !authMart, `anon=${anonMart} authenticated=${authMart} (must be false)`));

    // --- 6. Idempotency: a second identical load adds nothing -----------------
    await client.query("begin");
    for (const r of rows) await client.query(INSERT_OBSERVATION, observationValues(r));
    for (const r of rows) await client.query(INSERT_MART, [r.id]);
    await client.query("commit");
    const coreAfter = n(await client.query(`select count(*)::int c from core.official_observation`));
    const martAfter = n(await client.query(`select count(*)::int c from mart.official_suburb_metric`));
    checks.push(check("idempotent_reload_no_change", coreAfter === coreCount && martAfter === martCount, `core ${coreCount}->${coreAfter}, mart ${martCount}->${martAfter}`));

    // --- 7. Conflict: existing id + DIFFERENT value must NOT overwrite ---------
    const probe = rows[0];
    const tampered = { ...probe, val: Number(probe.val) + 1 };
    await client.query(INSERT_OBSERVATION, observationValues(tampered)); // on conflict do nothing
    const stored = Number((await client.query(`select value from core.official_observation where observation_id=$1`, [probe.id])).rows[0].value);
    checks.push(check("conflict_existing_id_not_overwritten", stored === Number(probe.val), `stored=${stored} original=${probe.val} (tamper ignored)`));

    // --- 8. Rollback proof (separate txn; does not disturb the candidate) ------
    const sentinelId = `obs_rollback_sentinel_${Date.now()}`;
    const sentinel = { id: sentinelId, src: "sentinel", sha: "sentinel", geo: "SAL_00000_ASGS3_2021", metric: "sentinel", pt: "all", bg: "all", val: 1, unit: "x", ps: null, pe: "2026-06-30", status: "direct" };
    await client.query("begin");
    await client.query(INSERT_OBSERVATION, observationValues(sentinel));
    const inTxn = n(await client.query(`select count(*)::int c from core.official_observation where observation_id=$1`, [sentinelId]));
    await client.query("rollback");
    const afterRollback = n(await client.query(`select count(*)::int c from core.official_observation where observation_id=$1`, [sentinelId]));
    checks.push(check("transactional_rollback_proven", inTxn === 1 && afterRollback === 0, `in-txn=${inTxn} after-rollback=${afterRollback}`));
    const coreFinal = n(await client.query(`select count(*)::int c from core.official_observation`));
    checks.push(check("candidate_undisturbed_after_rollback", coreFinal === coreCount, `core=${coreFinal} expected=${coreCount}`));

    const allOk = checks.every((c) => c.ok);
    const report = {
      generated_at: new Date().toISOString(),
      target: { supabase_branch_ref: BRANCH_REF, is_production: false, database: db.db, role: db.usr },
      payload_sha256: payload.payload_sha256,
      manifest_sha256: manifest.payload_sha256,
      counts: { core: coreCount, mart: martCount, view: viewCount, payload: rows.length, expected_mart: expectedMart, by_status: manifest.by_status, by_state: manifest.by_state, by_metric: manifest.by_metric },
      excluded: manifest.excluded,
      checks,
      all_checks_passed: allOk,
      untouched: ["Production (oshquaxsloolqucwvigc)", "main", "Vercel", "environment variables", "Storage", "Stash"],
      promotion_beyond_validation_branch: false,
    };
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log(`\nValidation-branch load — branch ref ${BRANCH_REF} (production=false), db=${db.db} user=${db.usr}`);
    console.log(`payload sha256: ${payload.payload_sha256}`);
    console.log(`core=${coreCount} mart=${martCount} view=${viewCount} (payload=${rows.length}, expected mart=${expectedMart})`);
    for (const c of checks) console.log(`  [${c.ok ? "PASS" : "FAIL"}] ${c.name} — ${c.detail}`);
    console.log(`\n${allOk ? "ALL CHECKS PASSED" : "ONE OR MORE CHECKS FAILED"} — report -> ${REPORT_PATH}`);
    console.log("STOP: candidate loaded on the validation branch only. No promotion beyond the validation branch.");
    if (!allOk) process.exitCode = 1;
  } catch (e) {
    try { await client.query("rollback"); } catch { /* no active txn */ }
    console.error(`load failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
