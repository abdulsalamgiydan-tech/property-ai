/**
 * Sprint 15 Workstream 13 — pure, testable logic for refresh_engine_v4.mjs.
 * Extracted the same way refresh_lib.mjs was extracted for v3 — so the
 * trend-computation logic can be unit tested without a live database
 * connection.
 *
 * v4 deliberately adds NO new execution capability over v3 — this project's
 * standing guardrail against paid scheduling infrastructure, combined with
 * v3 already being a mature, tested orchestrator, means the real remaining
 * gap is visibility, not more automation: an operator (or a future ops-
 * console UI) currently has to run 3 separate scripts (plan_refresh,
 * run_quality_check, check_freshness) and mentally combine their output to
 * answer "is it safe to run a refresh right now, and has anything gotten
 * worse recently?". v4's only new capability is answering that question in
 * one read-only, dry-run-always command.
 */

/**
 * Computes a trend label from an ordered list of quality runs (newest
 * first, matching `order by started_at desc`). Never claims "improving"
 * or "degrading" from a single data point — that requires at least 2 runs
 * to compare, otherwise reports "insufficient_history" rather than
 * guessing.
 */
export function computeQualityTrend(runsNewestFirst) {
  if (!runsNewestFirst || runsNewestFirst.length === 0) {
    return { trend: "no_runs_recorded", latest: null, blockingFailureTrend: "no_runs_recorded" };
  }
  const latest = runsNewestFirst[0];
  if (runsNewestFirst.length === 1) {
    return { trend: "insufficient_history", latest, blockingFailureTrend: "insufficient_history" };
  }

  const previous = runsNewestFirst[1];
  const latestPassRate = latest.rules_run > 0 ? latest.rules_passed / latest.rules_run : null;
  const previousPassRate = previous.rules_run > 0 ? previous.rules_passed / previous.rules_run : null;

  let trend = "stable";
  if (latestPassRate != null && previousPassRate != null) {
    if (latestPassRate > previousPassRate) trend = "improving";
    else if (latestPassRate < previousPassRate) trend = "degrading";
  }

  let blockingFailureTrend = "stable";
  if (latest.rules_failed_blocking > previous.rules_failed_blocking) blockingFailureTrend = "worsening";
  else if (latest.rules_failed_blocking < previous.rules_failed_blocking) blockingFailureTrend = "improving";
  else if (latest.rules_failed_blocking > 0) blockingFailureTrend = "unchanged_and_blocking";

  return { trend, latest, blockingFailureTrend };
}

/**
 * Builds the single consolidated summary object v4's --summary command
 * prints. Pure — takes already-fetched data, does no I/O itself, so this
 * is where the actual "combine 3 scripts' worth of state into one answer"
 * logic lives and can be tested directly.
 */
export function buildRefreshSummary({ selectedDatasets, freshnessRows, qualityRunsNewestFirst }) {
  const freshnessCounts = {};
  for (const r of freshnessRows ?? []) {
    freshnessCounts[r.freshness_status] = (freshnessCounts[r.freshness_status] ?? 0) + 1;
  }
  const staleOrWorse = (freshnessRows ?? []).filter((r) =>
    ["stale", "critical", "manual_review", "failed", "blocked"].includes(r.freshness_status)
  ).length;

  const qualityTrend = computeQualityTrend(qualityRunsNewestFirst ?? []);
  const safeToRun =
    qualityTrend.latest == null || qualityTrend.latest.rules_failed_blocking === 0;

  return {
    generated_at: new Date().toISOString(),
    selected_dataset_count: (selectedDatasets ?? []).length,
    freshness_counts: freshnessCounts,
    stale_or_worse_count: staleOrWorse,
    quality: {
      latest_run_at: qualityTrend.latest?.started_at ?? null,
      rules_run: qualityTrend.latest?.rules_run ?? null,
      rules_passed: qualityTrend.latest?.rules_passed ?? null,
      rules_failed_blocking: qualityTrend.latest?.rules_failed_blocking ?? null,
      rules_failed_advisory: qualityTrend.latest?.rules_failed_advisory ?? null,
      pass_rate_trend: qualityTrend.trend,
      blocking_failure_trend: qualityTrend.blockingFailureTrend,
    },
    // A recommendation, never an instruction this script acts on itself —
    // v4 has no --execute mode; running a refresh always requires a human
    // to separately invoke refresh_engine_v3.mjs --execute.
    safe_to_run_recommendation: safeToRun
      ? "no blocking quality failures recorded in the latest run"
      : "at least one blocking quality failure is currently recorded — investigate before running a refresh",
  };
}
