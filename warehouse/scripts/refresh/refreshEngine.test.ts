import { describe, expect, it } from "vitest";
import { decideState, periodRank, STATES } from "./refreshEngine.mjs";

const locked = { period_rank: 202606, period_label: "Q2 2026", etag: '"abc"' };

describe("periodRank", () => {
  it("parses month-name, Q<n>, <n>Q and YYYY-MM formats consistently", () => {
    expect(periodRank("Metropolitan Median House Sales Q2 2026")).toBe(202606);
    expect(periodRank("2Q 2026")).toBe(202606);
    expect(periodRank("Private Rental Report 2026-03")).toBe(202603);
    expect(periodRank("March 2026")).toBe(202603);
    expect(periodRank("Moving Annual ... Sep 2025")).toBe(202509);
    expect(periodRank("no period here")).toBe(-1);
  });
});

describe("decideState", () => {
  it("unchanged when the latest official period equals the locked period", () => {
    expect(decideState(locked, { reachable: true, periodRank: 202606, periodLabel: "Q2 2026", etag: '"abc"' }).state).toBe("unchanged");
  });
  it("new_period_detected when a newer period is published", () => {
    expect(decideState(locked, { reachable: true, periodRank: 202609, periodLabel: "Q3 2026" }).state).toBe("new_period_detected");
  });
  it("same_period_revision_detected on an ETag change within the same period", () => {
    expect(decideState(locked, { reachable: true, periodRank: 202606, periodLabel: "Q2 2026", etag: '"different"' }).state).toBe("same_period_revision_detected");
  });
  it("historical_backfill_detected when the latest is older than locked", () => {
    expect(decideState(locked, { reachable: true, periodRank: 202603, periodLabel: "Q1 2026" }).state).toBe("historical_backfill_detected");
  });
  it("source_unreachable / source_access_blocked on network / 403", () => {
    expect(decideState(locked, { reachable: false }).state).toBe("source_unreachable");
    expect(decideState(locked, { reachable: false, status: 403 }).state).toBe("source_access_blocked");
  });
  it("resource_removed when the accepted resource is gone", () => {
    expect(decideState(locked, { reachable: true, resourceRemoved: true }).state).toBe("resource_removed");
  });
  it("blocks on licence or schema change (fail closed, never auto-accept)", () => {
    expect(decideState(locked, { reachable: true, periodRank: 202606 }, { licenceOk: false }).state).toBe("blocked_licence_change");
    expect(decideState(locked, { reachable: true, periodRank: 202606 }, { schemaOk: false }).state).toBe("blocked_schema_drift");
  });
  it("every state has a documented exit code", () => {
    for (const s of ["unchanged", "new_period_detected", "source_unreachable", "blocked_schema_drift", "candidate_ready", "manual_review_required"]) {
      expect((STATES as Record<string, number>)[s]).toBeTypeOf("number");
    }
  });
});
