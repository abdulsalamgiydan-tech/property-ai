import { describe, expect, it } from "vitest";
import {
  affordabilityFit,
  confidenceBand,
  dataConfidence,
  demandIndex,
  growthIndex,
  opportunityBand,
  opportunityScoreV1,
  OPPORTUNITY_WEIGHTS,
  yieldIndex,
} from "./scoring";

describe("opportunity_score_v1 sub-indices (spec §2)", () => {
  it("growthIndex hits the documented knots and clamps", () => {
    expect(growthIndex(-10)).toBe(0);
    expect(growthIndex(-5)).toBe(0);
    expect(growthIndex(0)).toBe(30);
    expect(growthIndex(2.5)).toBe(45); // lerp 0→5 : 30→60
    expect(growthIndex(5)).toBe(60);
    expect(growthIndex(12)).toBe(90);
    expect(growthIndex(20)).toBe(100);
    expect(growthIndex(50)).toBe(100);
  });
  it("yieldIndex hits the documented knots", () => {
    expect(yieldIndex(2.0)).toBe(0);
    expect(yieldIndex(2.5)).toBe(0);
    expect(yieldIndex(3.5)).toBe(45);
    expect(yieldIndex(4.25)).toBeCloseTo(62.5, 6);
    expect(yieldIndex(5.0)).toBe(80);
    expect(yieldIndex(6.5)).toBe(100);
    expect(yieldIndex(9)).toBe(100);
  });
  it("demandIndex hits the documented knots", () => {
    expect(demandIndex(3)).toBe(0);
    expect(demandIndex(5)).toBe(0);
    expect(demandIndex(10)).toBe(25);
    expect(demandIndex(15)).toBe(50);
    expect(demandIndex(40)).toBe(85);
    expect(demandIndex(80)).toBe(100);
    expect(demandIndex(200)).toBe(100);
  });
});

describe("opportunity score weighting (spec §3)", () => {
  const sub = { growth: 60, demand: 50, yield: 80 };
  it("applies fixed strategy weights with no renormalisation", () => {
    expect(opportunityScoreV1(sub, "growth")).toBe(61); // .6*60+.25*50+.15*80 = 60.5
    expect(opportunityScoreV1(sub, "balanced")).toBe(65); // .4*60+.25*50+.35*80 = 64.5
    expect(opportunityScoreV1(sub, "yield")).toBe(70); // .2*60+.2*50+.6*80 = 70
  });
  it("weight rows all sum to 100", () => {
    for (const w of Object.values(OPPORTUNITY_WEIGHTS)) {
      expect(w.growth + w.demand + w.yield).toBe(100);
    }
  });
  it("bands", () => {
    expect(opportunityBand(70)).toBe("strong");
    expect(opportunityBand(45)).toBe("moderate");
    expect(opportunityBand(44)).toBe("weak");
  });
});

describe("data confidence is a separate axis (spec §6)", () => {
  it("applies documented deductions", () => {
    expect(
      dataConfidence({ softStaleCount: 0, salesVolumeSample: 30, grossYieldSample: 30, hasSupplyEvidence: true, hasDemographicEvidence: true }),
    ).toBe(100);
    expect(
      dataConfidence({ softStaleCount: 1, salesVolumeSample: 8, grossYieldSample: 12, hasSupplyEvidence: false, hasDemographicEvidence: false }),
    ).toBe(55); // -15 -10 -0 -10 -10
    expect(
      dataConfidence({ softStaleCount: 0, salesVolumeSample: 4, grossYieldSample: 4, hasSupplyEvidence: true, hasDemographicEvidence: true }),
    ).toBe(70); // vol<10 -10, vol<5 -10, yield<10 -10
  });
  it("bands", () => {
    expect(confidenceBand(75)).toBe("high");
    expect(confidenceBand(50)).toBe("medium");
    expect(confidenceBand(30)).toBe("low");
    expect(confidenceBand(29)).toBe("insufficient");
  });
});

describe("affordability fit is separate (spec §7)", () => {
  it("rises with headroom and deposit comfort", () => {
    const tight = affordabilityFit(1_780_000, 1_800_000, 5);
    const roomy = affordabilityFit(700_000, 1_800_000, 40);
    expect(roomy).toBeGreaterThan(tight);
    expect(affordabilityFit(700_000, 1_800_000, 40)).toBeLessThanOrEqual(100);
    expect(affordabilityFit(1_800_000, 1_800_000, 5)).toBe(0);
  });
});
