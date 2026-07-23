import { describe, expect, it } from "vitest";
import { detectWatchlistChanges, type SnapshotDiffInput } from "./watchlistChanges";

const baseline: SnapshotDiffInput = {
  latest_sales_period: "2026-06",
  latest_rent_period: "2026-Q2",
  latest_yield_period: "2026-Q2",
  latest_approvals_period: "2026-06",
  median_sale_price_12m: 1_000_000,
  median_weekly_rent_latest: 600,
  gross_yield_pct: 3.12,
  approvals_12m: 50,
  sales_volume_12m: 120,
  sales_sample_confidence: "medium",
  rent_confidence: "high",
  yield_confidence: "medium",
  supply_confidence: "high",
};

describe("detectWatchlistChanges", () => {
  it("returns no events when there is no prior snapshot (first check establishes a baseline)", () => {
    expect(detectWatchlistChanges(null, baseline)).toEqual([]);
  });

  it("returns no events when nothing changed", () => {
    expect(detectWatchlistChanges(baseline, { ...baseline })).toEqual([]);
  });

  it("is idempotent: calling twice with the same inputs returns the same events", () => {
    const current = { ...baseline, median_sale_price_12m: 1_050_000 };
    const first = detectWatchlistChanges(baseline, current);
    const second = detectWatchlistChanges(baseline, current);
    expect(first).toEqual(second);
  });

  it("detects a new sales source period", () => {
    const current = { ...baseline, latest_sales_period: "2026-07" };
    const events = detectWatchlistChanges(baseline, current);
    expect(events).toContainEqual(
      expect.objectContaining({ event_type: "new_source_period", metric_family: "sales", new_value: "2026-07" })
    );
  });

  it("does not flag a period as 'new' the first time it's ever seen (previous null)", () => {
    const previous: SnapshotDiffInput = { ...baseline, latest_sales_period: null };
    const events = detectWatchlistChanges(previous, baseline);
    expect(events.some((e) => e.event_type === "new_source_period" && e.metric_family === "sales")).toBe(false);
  });

  it("detects a meaningful median price movement above the 1% threshold", () => {
    const current = { ...baseline, median_sale_price_12m: 1_050_000 };
    const events = detectWatchlistChanges(baseline, current);
    const event = events.find((e) => e.event_type === "median_price_movement");
    expect(event).toBeDefined();
    expect(event!.description).toContain("rose 5.0%");
  });

  it("does not flag a sub-threshold price movement as noise", () => {
    const current = { ...baseline, median_sale_price_12m: 1_003_000 }; // 0.3%
    const events = detectWatchlistChanges(baseline, current);
    expect(events.some((e) => e.event_type === "median_price_movement")).toBe(false);
  });

  it("detects a rent fall as well as a rise", () => {
    const current = { ...baseline, median_weekly_rent_latest: 550 };
    const events = detectWatchlistChanges(baseline, current);
    const event = events.find((e) => e.event_type === "median_rent_movement");
    expect(event!.description).toContain("fell");
  });

  it("detects a meaningful sales transaction volume movement (Sprint 14 WS9 — previously untracked)", () => {
    const current = { ...baseline, sales_volume_12m: 150 };
    const events = detectWatchlistChanges(baseline, current);
    const event = events.find((e) => e.event_type === "sales_volume_movement");
    expect(event).toBeDefined();
    expect(event!.description).toContain("rose 25.0%");
    expect(event!.metric_family).toBe("sales");
  });

  it("does not flag a sub-threshold volume change as noise", () => {
    const current = { ...baseline, sales_volume_12m: 121 };
    const events = detectWatchlistChanges(baseline, current);
    expect(events.some((e) => e.event_type === "sales_volume_movement")).toBe(false);
  });

  it("detects a confidence upgrade", () => {
    const current = { ...baseline, sales_sample_confidence: "high" };
    const events = detectWatchlistChanges(baseline, current);
    expect(events).toContainEqual(
      expect.objectContaining({ event_type: "confidence_upgrade", metric_family: "sales" })
    );
  });

  it("detects a confidence downgrade", () => {
    const current = { ...baseline, rent_confidence: "low" };
    const events = detectWatchlistChanges(baseline, current);
    expect(events).toContainEqual(
      expect.objectContaining({ event_type: "confidence_downgrade", metric_family: "rent" })
    );
  });

  it("detects a metric becoming newly unavailable (never surfaced as a zero)", () => {
    const current = { ...baseline, gross_yield_pct: null };
    const events = detectWatchlistChanges(baseline, current);
    const event = events.find((e) => e.event_type === "metric_newly_unavailable" && e.metric_family === "yield");
    expect(event).toBeDefined();
    expect(event!.new_value).toBeNull();
  });

  it("detects a metric becoming newly available", () => {
    const previous = { ...baseline, approvals_12m: null };
    const events = detectWatchlistChanges(previous, baseline);
    const event = events.find((e) => e.event_type === "metric_newly_available" && e.metric_family === "approvals");
    expect(event).toBeDefined();
    expect(event!.previous_value).toBeNull();
  });

  it("can detect multiple simultaneous changes in one pass", () => {
    const current: SnapshotDiffInput = {
      ...baseline,
      latest_sales_period: "2026-07",
      median_sale_price_12m: 1_100_000,
      rent_confidence: "medium",
    };
    const events = detectWatchlistChanges(baseline, current);
    expect(events.length).toBeGreaterThanOrEqual(3);
  });

  it("handles a previous value of exactly 0 without dividing by zero", () => {
    const previous = { ...baseline, approvals_12m: 0 };
    const current = { ...baseline, approvals_12m: 5 };
    const events = detectWatchlistChanges(previous, current);
    // 0 -> 5 is an infinite/undefined percent change; must not crash or emit NaN/Infinity in output.
    const movement = events.find((e) => e.event_type === "approvals_movement");
    expect(movement).toBeUndefined();
    expect(events.every((e) => !e.description.includes("NaN") && !e.description.includes("Infinity"))).toBe(true);
  });
});
