import { describe, expect, it } from "vitest";
import { computeGrowth, type RollingMedianPoint } from "./growthMetrics";

function pt(periodEnd: string, medianPrice: number | null, sampleSize = 50, over: Partial<RollingMedianPoint> = {}): RollingMedianPoint {
  return { periodEnd, medianPrice, sampleSize, propertyType: "house", geographyLevel: "suburb", ...over };
}

// A ~10-year house series ending 2026-06, one point per year.
const series: RollingMedianPoint[] = [
  pt("2016-06-30", 500000),
  pt("2021-06-30", 700000),
  pt("2023-06-30", 820000),
  pt("2025-06-30", 900000),
  pt("2026-06-30", 950000),
];

describe("computeGrowth", () => {
  it("computes distinct cumulative change and CAGR over 5 years", () => {
    const r = computeGrowth(series, { years: 5, minSample: 10 });
    expect(r.available).toBe(true);
    // 950000 / 700000 - 1 = 35.71% cumulative
    expect(r.cumulativeChangePct).toBeCloseTo(35.71, 1);
    // CAGR over ~5y is much smaller than cumulative and they must differ
    expect(r.cagrPct).not.toBe(r.cumulativeChangePct);
    expect(r.cagrPct).toBeGreaterThan(5);
    expect(r.cagrPct).toBeLessThan(8);
    expect(r.currentPeriodEnd).toBe("2026-06-30");
    expect(r.priorPeriodEnd).toBe("2021-06-30");
    expect(r.currentSample).toBe(50);
    expect(r.priorSample).toBe(50);
  });

  it("computes 10-year growth using the ~10y-prior point", () => {
    const r = computeGrowth(series, { years: 10, minSample: 10 });
    expect(r.available).toBe(true);
    expect(r.priorPeriodEnd).toBe("2016-06-30");
    expect(r.cumulativeChangePct).toBeCloseTo(90, 0); // 950k/500k - 1
  });

  it("returns unavailable when no comparable prior point exists within tolerance", () => {
    const r = computeGrowth([pt("2026-06-30", 950000), pt("2024-06-30", 880000)], { years: 5, minSample: 10 });
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/no comparable point/);
  });

  it("suppresses endpoints below the minimum sample rule (never lowered to inflate coverage)", () => {
    const r = computeGrowth([pt("2026-06-30", 950000, 8), pt("2021-06-30", 700000, 60)], { years: 5, minSample: 10 });
    expect(r.available).toBe(false); // current point fails min sample → dropped
  });

  it("refuses to mix property types", () => {
    const r = computeGrowth([pt("2026-06-30", 950000), pt("2021-06-30", 600000, 50, { propertyType: "unit" })], { years: 5, minSample: 10 });
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/property type/);
  });

  it("refuses to mix geography levels", () => {
    const r = computeGrowth([pt("2026-06-30", 950000), pt("2021-06-30", 600000, 50, { geographyLevel: "postcode" })], { years: 5, minSample: 10 });
    expect(r.available).toBe(false);
    expect(r.reason).toMatch(/geography/);
  });

  it("does not interpolate a missing baseline — nulls are skipped, not filled", () => {
    const r = computeGrowth([pt("2026-06-30", 950000), pt("2021-06-30", null)], { years: 5, minSample: 10 });
    expect(r.available).toBe(false);
  });
});
