import { describe, expect, it } from "vitest";
import { classifyYieldCandidate, type YieldCandidate } from "./yieldDisposition";

const ok: YieldCandidate = {
  median_sale_price_12m: 642000,
  median_weekly_rent_latest: 480,
  latest_sales_period: "2026-01-01",
  latest_rent_period: "2026-01-01",
  sales_sample_confidence: "medium",
  rent_confidence: "medium",
  direct_or_derived: "direct",
};

describe("classifyYieldCandidate", () => {
  it("materialises a fully compatible, sample-qualified candidate", () => {
    expect(classifyYieldCandidate(ok)).toBe("materialised");
  });

  it("suppresses insufficient (or low) rent samples — thresholds not lowered to inflate coverage", () => {
    expect(classifyYieldCandidate({ ...ok, rent_confidence: "insufficient" })).toBe("insufficient_sample");
    expect(classifyYieldCandidate({ ...ok, rent_confidence: "low" })).toBe("insufficient_sample");
    expect(classifyYieldCandidate({ ...ok, sales_sample_confidence: "insufficient" })).toBe("insufficient_sample");
  });

  it("rejects incompatible periods (e.g. rent 4 years from the sales window)", () => {
    expect(classifyYieldCandidate({ ...ok, latest_rent_period: "2021-06-01" })).toBe("incompatible_period");
  });

  it("rejects a non-direct (contextual) input rather than materialising a suburb value", () => {
    expect(classifyYieldCandidate({ ...ok, direct_or_derived: "contextual" })).toBe("context_only");
  });

  it("rejects invalid (null/non-positive) values", () => {
    expect(classifyYieldCandidate({ ...ok, median_sale_price_12m: 0 })).toBe("invalid_value");
    expect(classifyYieldCandidate({ ...ok, median_weekly_rent_latest: null })).toBe("invalid_value");
  });

  it("dispositions partition the input set (reconciliation invariant)", () => {
    const set: YieldCandidate[] = [
      ok,
      { ...ok, rent_confidence: "insufficient" },
      { ...ok, latest_rent_period: "2019-01-01" },
      { ...ok, median_sale_price_12m: -1 },
    ];
    const counts = set.reduce<Record<string, number>>((m, c) => ((m[classifyYieldCandidate(c)] = (m[classifyYieldCandidate(c)] || 0) + 1), m), {});
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(set.length); // every candidate gets exactly one disposition
  });
});
