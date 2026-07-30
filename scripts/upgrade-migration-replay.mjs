#!/usr/bin/env node
// Sprint 17.5 final closure -- Production-equivalent upgrade rehearsal.
//
// Unlike scripts/clean-migration-replay.mjs (which replays 001-046 from
// scratch into one disposable database), this script proves the actual
// Production upgrade path: start from a disposable database holding ONLY
// migrations 001-044 (Production's current real state), then apply 045
// and 046 on top -- the exact sequence Production will experience -- and
// verify the result converges with the clean replay's own result, not a
// separately-asserted "looks fine" check.
//
// Requires its OWN disposable database (UPGRADE_REPLAY_DATABASE_URL),
// separate from clean-migration-replay's, so the two runs never share
// state. Also reads clean-replay-artifacts/clean-migration-chain-report.json
// (written by clean-migration-replay.mjs, expected to have already run in
// the same CI job) to directly diff against, rather than only asserting
// this run's own invariants in isolation.

import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { Client } from "pg";
import {
  assertSafeLocalUrl,
  migrationFiles,
  bootstrapSupabasePrimitives,
  applyMigrations,
  collectChecks,
} from "./clean-migration-replay.mjs";

const repoRoot = process.cwd();
const outDir = path.join(repoRoot, "clean-replay-artifacts");
const outFile = path.join(outDir, "upgrade-migration-replay-report.json");
const cleanReplayReportFile = path.join(outDir, "clean-migration-chain-report.json");

const BASELINE_LAST_MIGRATION = "044";
const UPGRADE_MIGRATIONS = ["045_sprint17_preferences_feedback_controls.sql", "046_research_api_grant_hardening.sql"];

const EXPECTED_NEW_ONBOARDING_COLUMNS = [
  "strategy_focus", "investment_timeframe", "budget_range", "deposit_range", "preferred_property_types",
  "risk_tolerance", "buyer_context", "portfolio_status", "guidance_level", "notification_frequency",
  "completion_step", "skipped_at", "last_edited_from",
];
const EXPECTED_NEW_FEEDBACK_COLUMNS = [
  "satisfaction_score", "contact_permission", "client_submission_id", "technical_context", "status", "updated_at",
];
const EXPECTED_NEW_INDEXES = ["user_feedback_user_submission_id_idx", "user_feedback_status_created_idx"];

const GRANT_VIEWS = [
  "v_market_geography_search_v1", "v_suburb_market_snapshot_v1", "v_postcode_market_snapshot_v1",
  "v_suburb_demographic_profile_v1", "v_postcode_demographic_profile_v1", "v_dataset_freshness_v1",
  "v_refresh_run_history_v1", "v_metric_assumptions_v1", "v_quality_summary_v1", "v_evidence_catalogue_v1",
];
const GRANT_FUNCTIONS = [
  "get_market_timeseries_v1(text)", "search_market_geographies_v2(text, text, text, integer)",
  "get_market_snapshot_v2(text)", "compare_market_geographies_v1(text[])",
  "get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer)",
  "get_market_timeseries_v2(text)", "get_metric_lineage_v1(text, text, text)",
  "get_warehouse_operations_summary_v1()",
];
const INTERNAL_SCHEMAS = ["core", "mart", "staging", "meta"];

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function policyNamesOf(client, table) {
  const { rows } = await client.query(`select policyname from pg_policies where schemaname = 'public' and tablename = $1`, [table]);
  return new Set(rows.map((r) => r.policyname));
}

async function main() {
  const databaseUrl = process.env.UPGRADE_REPLAY_DATABASE_URL;
  assertSafeLocalUrl(databaseUrl);
  await fs.mkdir(outDir, { recursive: true });

  const allFiles = await migrationFiles();
  const baselineFiles = allFiles.filter((f) => f.slice(0, 3) <= BASELINE_LAST_MIGRATION);
  const upgradeFiles = allFiles.filter((f) => UPGRADE_MIGRATIONS.includes(f));
  if (baselineFiles.at(-1)?.slice(0, 3) !== BASELINE_LAST_MIGRATION) {
    throw new Error(`Expected baseline to end at ${BASELINE_LAST_MIGRATION}, got ${baselineFiles.at(-1)}`);
  }
  if (upgradeFiles.length !== UPGRADE_MIGRATIONS.length) {
    throw new Error(`Expected exactly the two Sprint 17 migrations, found: ${upgradeFiles.join(", ")}`);
  }

  const client = new Client({ connectionString: databaseUrl });
  const started = performance.now();
  const failures = [];
  function check(label, ok) {
    if (ok) console.log(`  ok   ${label}`);
    else {
      failures.push(label);
      console.error(`  FAIL ${label}`);
    }
  }

  const report = { status: "fail", startedAt: new Date().toISOString(), baselineCount: baselineFiles.length, upgradeCount: upgradeFiles.length, error: null };

  try {
    await client.connect();
    await bootstrapSupabasePrimitives(client);

    console.log(`\nPhase 1 -- applying Production-equivalent baseline (001-${BASELINE_LAST_MIGRATION}, ${baselineFiles.length} files)\n`);
    await applyMigrations(client, baselineFiles);

    const preUpgradeOnboardingCols = await columnsOf(client, "user_onboarding_preferences");
    const preUpgradeFeedbackCols = await columnsOf(client, "user_feedback");
    check("baseline does NOT yet have any 045 onboarding columns", EXPECTED_NEW_ONBOARDING_COLUMNS.every((c) => !preUpgradeOnboardingCols.has(c)));
    check("baseline does NOT yet have any 045 feedback columns", EXPECTED_NEW_FEEDBACK_COLUMNS.every((c) => !preUpgradeFeedbackCols.has(c)));

    console.log(`\nPhase 2 -- applying the upgrade (045, 046) on top of the baseline\n`);
    await applyMigrations(client, upgradeFiles);

    console.log("\nPhase 3 -- migration 045 verification\n");
    const onboardingCols = await columnsOf(client, "user_onboarding_preferences");
    for (const col of EXPECTED_NEW_ONBOARDING_COLUMNS) check(`user_onboarding_preferences.${col} present`, onboardingCols.has(col));
    const feedbackCols = await columnsOf(client, "user_feedback");
    for (const col of EXPECTED_NEW_FEEDBACK_COLUMNS) check(`user_feedback.${col} present`, feedbackCols.has(col));

    const constraints = await client.query(
      `select conname from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname in ('user_onboarding_preferences','user_feedback') and contype = 'c'`
    );
    const constraintNames = new Set(constraints.rows.map((r) => r.conname));
    const expectedConstraints = [
      "user_onboarding_preferences_strategy_focus_check", "user_onboarding_preferences_timeframe_check",
      "user_onboarding_preferences_budget_check", "user_onboarding_preferences_deposit_check",
      "user_onboarding_preferences_risk_check", "user_onboarding_preferences_buyer_context_check",
      "user_onboarding_preferences_portfolio_status_check", "user_onboarding_preferences_guidance_check",
      "user_onboarding_preferences_notification_frequency_check", "user_onboarding_preferences_completion_step_check",
      "user_feedback_category_check", "user_feedback_satisfaction_score_check",
      "user_feedback_message_length_check", "user_feedback_status_check",
    ];
    check(`all 14 new check constraints present`, expectedConstraints.every((c) => constraintNames.has(c)));

    const indexes = await client.query(`select indexname from pg_indexes where schemaname = 'public' and indexname = any($1::text[])`, [EXPECTED_NEW_INDEXES]);
    check("both new indexes present", indexes.rows.length === EXPECTED_NEW_INDEXES.length);

    const rls = await client.query(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and relname in ('user_onboarding_preferences','user_feedback')`
    );
    check("RLS still enabled on both tables after upgrade", rls.rows.length === 2 && rls.rows.every((r) => r.relrowsecurity === true));

    const onboardingPolicies = await policyNamesOf(client, "user_onboarding_preferences");
    const feedbackPolicies = await policyNamesOf(client, "user_feedback");
    check("pre-existing user_onboarding_preferences owner policies (select/insert/update/delete) intact", onboardingPolicies.size === 4);
    check("pre-existing user_feedback owner policies (select/insert) intact", feedbackPolicies.size === 2);

    // Existing-row compatibility: insert a pre-045-shaped row (only the
    // 043/044 columns) to prove old rows / old-shaped writes remain valid
    // after the new columns exist (all new columns are nullable-or-defaulted).
    await client.query(`insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'rehearsal@example.com') on conflict do nothing`);
    const legacyInsert = await client.query(
      `insert into public.user_feedback (user_id, category, message) values ('00000000-0000-0000-0000-000000000001', 'general', 'pre-045-shaped row') returning id`
    );
    check("a pre-045-shaped feedback row (no new columns supplied) inserts successfully", legacyInsert.rows.length === 1);
    const legacyOnboardingInsert = await client.query(
      `insert into public.user_onboarding_preferences (user_id) values ('00000000-0000-0000-0000-000000000001') returning user_id`
    );
    check("a pre-045-shaped onboarding row (no new columns supplied) inserts successfully", legacyOnboardingInsert.rows.length === 1);

    console.log("\nPhase 4 -- migration 046 verification (grants)\n");
    for (const view of GRANT_VIEWS) {
      const { rows } = await client.query(`select has_table_privilege('anon', $1, 'SELECT') as ok`, [`public.${view}`]);
      check(`anon can SELECT public.${view}`, rows[0].ok === true);
    }
    for (const fn of GRANT_FUNCTIONS) {
      const { rows } = await client.query(`select has_function_privilege('anon', $1, 'EXECUTE') as ok`, [`public.${fn}`]);
      check(`anon can EXECUTE public.${fn}`, rows[0].ok === true);
    }
    for (const schema of INTERNAL_SCHEMAS) {
      const { rows } = await client.query(`select has_schema_privilege('anon', $1, 'USAGE') as ok`, [schema]);
      check(`anon is denied USAGE on internal schema ${schema}`, rows[0].ok === false);
    }
    // A live query through the actual grant path: anon can run a real
    // SELECT against the search view without a permission error (the
    // query itself may return 0 rows since this disposable database has
    // no warehouse data loaded -- that's expected and not what's being
    // tested here; a permission-denied error is what would fail this).
    await client.query("set role anon");
    let liveQueryOk = true;
    try {
      await client.query(`select 1 from public.v_market_geography_search_v1 limit 1`);
    } catch {
      liveQueryOk = false;
    }
    await client.query("reset role");
    check("a live SELECT as anon against v_market_geography_search_v1 executes without a permission error", liveQueryOk);

    console.log("\nPhase 5 -- compare against the clean 001-046 replay's own result\n");
    let cleanReport = null;
    try {
      cleanReport = JSON.parse(await fs.readFile(cleanReplayReportFile, "utf8"));
    } catch {
      cleanReport = null;
    }
    if (!cleanReport) {
      check("clean-migration-chain-report.json available for comparison (run clean-migration-replay.mjs first)", false);
    } else {
      check("clean replay itself reported status: pass", cleanReport.status === "pass");
      const upgradeChecks = await collectChecks(client, allFiles);
      check(
        "required tables match between upgrade-replay and clean replay",
        JSON.stringify(upgradeChecks.missingRequiredTables) === JSON.stringify(cleanReport.checks.missingRequiredTables)
      );
      check(
        "user-owned RLS coverage matches between upgrade-replay and clean replay",
        JSON.stringify(upgradeChecks.userOwnedRlsMissing) === JSON.stringify(cleanReport.checks.userOwnedRlsMissing)
      );
      check(
        "total public/warehouse schema table count matches between upgrade-replay and clean replay",
        upgradeChecks.totalSchemaTables === cleanReport.checks.totalSchemaTables
      );
      check(
        "public policy count matches between upgrade-replay and clean replay",
        upgradeChecks.publicPolicyCount === cleanReport.checks.publicPolicyCount
      );
    }

    report.status = failures.length === 0 ? "pass" : "fail";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    report.status = "fail";
    throw error;
  } finally {
    report.failures = failures;
    report.finishedAt = new Date().toISOString();
    report.durationMs = Math.round(performance.now() - started);
    await fs.writeFile(outFile, JSON.stringify(report, null, 2));
    await client.end().catch(() => {});
  }

  console.log(`\n${failures.length === 0 ? "Upgrade-replay rehearsal PASSED" : `Upgrade-replay rehearsal FAILED -- ${failures.length} issue(s)`}`);
  if (failures.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`upgrade migration replay failed: ${error.message}`);
  process.exit(1);
});
