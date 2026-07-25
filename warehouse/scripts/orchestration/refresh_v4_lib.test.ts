import { describe, expect, it } from "vitest";
import { buildRefreshSummary, computeQualityTrend } from "./refresh_v4_lib.mjs";

function run(overrides: Partial<{ started_at: string; rules_run: number; rules_passed: number; rules_failed_blocking: number; rules_failed_advisory: number }> = {}) {
  return {
    started_at: "2026-07-22T12:00:00Z",
    rules_run: 35,
    rules_passed: 32,
    rules_failed_blocking: 0,
    rules_failed_advisory: 3,
    ...overrides,
  };
}

describe("computeQualityTrend", () => {
  it("reports 'no_runs_recorded' rather than crashing or guessing when there is no history", () => {
    const result = computeQualityTrend([]);
    expect(result.trend).toBe("no_runs_recorded");
    expect(result.latest).toBeNull();
  });

  it("reports 'insufficient_history' with exactly one run — never claims improving/degrading from a single data point", () => {
    const result = computeQualityTrend([run()]);
    expect(result.trend).toBe("insufficient_history");
    expect(result.latest).toEqual(run());
  });

  it("detects an improving pass rate", () => {
    const newer = run({ started_at: "2026-07-22T12:00:00Z", rules_passed: 33 });
    const older = run({ started_at: "2026-07-22T09:00:00Z", rules_passed: 30 });
    const result = computeQualityTrend([newer, older]);
    expect(result.trend).toBe("improving");
  });

  it("detects a degrading pass rate", () => {
    const newer = run({ started_at: "2026-07-22T12:00:00Z", rules_passed: 28 });
    const older = run({ started_at: "2026-07-22T09:00:00Z", rules_passed: 32 });
    const result = computeQualityTrend([newer, older]);
    expect(result.trend).toBe("degrading");
  });

  it("reports 'stable' when the pass rate is unchanged across runs", () => {
    const newer = run();
    const older = run();
    const result = computeQualityTrend([newer, older]);
    expect(result.trend).toBe("stable");
  });

  it("flags a NEW blocking failure as 'worsening'", () => {
    const newer = run({ rules_failed_blocking: 2 });
    const older = run({ rules_failed_blocking: 0 });
    const result = computeQualityTrend([newer, older]);
    expect(result.blockingFailureTrend).toBe("worsening");
  });

  it("flags a resolved blocking failure as 'improving'", () => {
    const newer = run({ rules_failed_blocking: 0 });
    const older = run({ rules_failed_blocking: 1 });
    const result = computeQualityTrend([newer, older]);
    expect(result.blockingFailureTrend).toBe("improving");
  });

  it("flags a persistent, unresolved blocking failure distinctly from a stable pass — 'unchanged_and_blocking', not just 'stable'", () => {
    const newer = run({ rules_failed_blocking: 1 });
    const older = run({ rules_failed_blocking: 1 });
    const result = computeQualityTrend([newer, older]);
    expect(result.blockingFailureTrend).toBe("unchanged_and_blocking");
  });
});

describe("buildRefreshSummary", () => {
  it("never recommends running when the latest run has a blocking failure", () => {
    const summary = buildRefreshSummary({
      selectedDatasets: [],
      freshnessRows: [],
      qualityRunsNewestFirst: [run({ rules_failed_blocking: 1 })],
    });
    expect(summary.safe_to_run_recommendation).toMatch(/blocking quality failure is currently recorded/);
  });

  it("recommends running when there is no blocking failure", () => {
    const summary = buildRefreshSummary({
      selectedDatasets: [],
      freshnessRows: [],
      qualityRunsNewestFirst: [run()],
    });
    expect(summary.safe_to_run_recommendation).toMatch(/no blocking quality failures/);
  });

  it("treats missing quality history as safe-to-run (nothing known to be blocking) rather than failing closed", () => {
    const summary = buildRefreshSummary({ selectedDatasets: [], freshnessRows: [], qualityRunsNewestFirst: [] });
    expect(summary.safe_to_run_recommendation).toMatch(/no blocking quality failures/);
    expect(summary.quality.latest_run_at).toBeNull();
  });

  it("counts freshness rows by status accurately", () => {
    const summary = buildRefreshSummary({
      selectedDatasets: [],
      freshnessRows: [
        { freshness_status: "current" },
        { freshness_status: "current" },
        { freshness_status: "stale" },
      ],
      qualityRunsNewestFirst: [],
    });
    expect(summary.freshness_counts).toEqual({ current: 2, stale: 1 });
    expect(summary.stale_or_worse_count).toBe(1);
  });

  it("counts every stale-or-worse status, not just 'stale' literally", () => {
    const summary = buildRefreshSummary({
      selectedDatasets: [],
      freshnessRows: [
        { freshness_status: "critical" },
        { freshness_status: "manual_review" },
        { freshness_status: "failed" },
        { freshness_status: "blocked" },
        { freshness_status: "current" },
      ],
      qualityRunsNewestFirst: [],
    });
    expect(summary.stale_or_worse_count).toBe(4);
  });

  it("reports the selected dataset count directly from the input array length", () => {
    const summary = buildRefreshSummary({
      selectedDatasets: [{ dataset_id: "a" }, { dataset_id: "b" }, { dataset_id: "c" }],
      freshnessRows: [],
      qualityRunsNewestFirst: [],
    });
    expect(summary.selected_dataset_count).toBe(3);
  });
});
