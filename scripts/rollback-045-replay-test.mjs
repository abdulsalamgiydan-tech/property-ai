#!/usr/bin/env node
// Sprint 17.5 -- tests the migration 045 rollback SQL against the SAME
// disposable database clean-migration-replay.mjs just replayed (001-046),
// so the rollback is exercised on real, current schema state in CI rather
// than "tested once manually on a branch" the way earlier sprint rollback
// docs recorded. Migration 046 is grant-only (no schema objects added or
// removed), so there is nothing structural to roll back there -- see
// warehouse/reports/production_migration_rollback_042_046.md for why a
// blanket grant revert is deliberately NOT provided.
//
// Run: CLEAN_REPLAY_DATABASE_URL=... node scripts/rollback-045-replay-test.mjs
// (after scripts/clean-migration-replay.mjs has already applied 001-046 to
// the same database).

import { Client } from "pg";

function assertSafeLocalUrl(url) {
  if (!url) throw new Error("CLEAN_REPLAY_DATABASE_URL is required");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("Refusing rollback test against a non-local database host");
  }
  if (url.includes("oshquaxsloolqucwvigc") || url.includes("lzonauinzatmtytyoems")) {
    throw new Error("Refusing rollback test against a real Supabase project ref");
  }
}

const ROLLBACK_045_SQL = `
  drop index if exists public.user_feedback_status_created_idx;
  drop index if exists public.user_feedback_user_submission_id_idx;

  alter table public.user_feedback
    drop constraint if exists user_feedback_status_check,
    drop constraint if exists user_feedback_message_length_check,
    drop constraint if exists user_feedback_satisfaction_score_check,
    drop constraint if exists user_feedback_category_check;

  alter table public.user_feedback
    drop column if exists updated_at,
    drop column if exists status,
    drop column if exists technical_context,
    drop column if exists client_submission_id,
    drop column if exists contact_permission,
    drop column if exists satisfaction_score;

  alter table public.user_onboarding_preferences
    drop constraint if exists user_onboarding_preferences_completion_step_check,
    drop constraint if exists user_onboarding_preferences_notification_frequency_check,
    drop constraint if exists user_onboarding_preferences_guidance_check,
    drop constraint if exists user_onboarding_preferences_portfolio_status_check,
    drop constraint if exists user_onboarding_preferences_buyer_context_check,
    drop constraint if exists user_onboarding_preferences_risk_check,
    drop constraint if exists user_onboarding_preferences_deposit_check,
    drop constraint if exists user_onboarding_preferences_budget_check,
    drop constraint if exists user_onboarding_preferences_timeframe_check,
    drop constraint if exists user_onboarding_preferences_strategy_focus_check;

  alter table public.user_onboarding_preferences
    drop column if exists last_edited_from,
    drop column if exists skipped_at,
    drop column if exists completion_step,
    drop column if exists notification_frequency,
    drop column if exists guidance_level,
    drop column if exists portfolio_status,
    drop column if exists buyer_context,
    drop column if exists risk_tolerance,
    drop column if exists preferred_property_types,
    drop column if exists deposit_range,
    drop column if exists budget_range,
    drop column if exists investment_timeframe,
    drop column if exists strategy_focus;
`;

const droppedFeedbackColumns = [
  "updated_at", "status", "technical_context", "client_submission_id", "contact_permission", "satisfaction_score",
];
const droppedOnboardingColumns = [
  "last_edited_from", "skipped_at", "completion_step", "notification_frequency", "guidance_level",
  "portfolio_status", "buyer_context", "risk_tolerance", "preferred_property_types", "deposit_range",
  "budget_range", "investment_timeframe", "strategy_focus",
];
const baseFeedbackColumns = ["id", "user_id", "category", "message", "page_path", "created_at"];
const baseOnboardingColumns = ["user_id", "primary_goal", "states_of_interest", "completed_at", "updated_at"];

async function columnsOf(client, table) {
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`,
    [table]
  );
  return new Set(rows.map((r) => r.column_name));
}

async function main() {
  const databaseUrl = process.env.CLEAN_REPLAY_DATABASE_URL;
  assertSafeLocalUrl(databaseUrl);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  const failures = [];
  function check(label, ok) {
    if (ok) console.log(`  ok   ${label}`);
    else {
      failures.push(label);
      console.error(`  FAIL ${label}`);
    }
  }

  try {
    await client.query(ROLLBACK_045_SQL);

    const feedbackCols = await columnsOf(client, "user_feedback");
    for (const col of droppedFeedbackColumns) {
      check(`user_feedback.${col} removed`, !feedbackCols.has(col));
    }
    for (const col of baseFeedbackColumns) {
      check(`user_feedback.${col} (pre-045 column) preserved`, feedbackCols.has(col));
    }

    const onboardingCols = await columnsOf(client, "user_onboarding_preferences");
    for (const col of droppedOnboardingColumns) {
      check(`user_onboarding_preferences.${col} removed`, !onboardingCols.has(col));
    }
    for (const col of baseOnboardingColumns) {
      check(`user_onboarding_preferences.${col} (pre-045 column) preserved`, onboardingCols.has(col));
    }

    const rls = await client.query(
      `select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and relname in ('user_feedback', 'user_onboarding_preferences')`
    );
    for (const row of rls.rows) {
      check(`${row.relname} RLS still enabled after rollback`, row.relrowsecurity === true);
    }

    const indexes = await client.query(
      `select indexname from pg_indexes where schemaname = 'public' and indexname in
       ('user_feedback_status_created_idx', 'user_feedback_user_submission_id_idx')`
    );
    check("045-added indexes removed", indexes.rows.length === 0);
  } finally {
    await client.end().catch(() => {});
  }

  if (failures.length > 0) {
    console.error(`\nRollback 045 test FAILED -- ${failures.length} issue(s)`);
    process.exit(1);
  }
  console.log("\nRollback 045 test passed -- schema returned to pre-045 (044/043) shape");
}

main().catch((error) => {
  console.error(`rollback 045 test failed: ${error.message}`);
  process.exit(1);
});
