import { describe, expect, it } from "vitest";
import { analyzeProperty } from "@/lib/propertyAnalysis";
import { rankInvestments } from "./engine";
import { OPPORTUNITY_WEIGHTS } from "./scoring";
import { SCENARIO_ASSUMPTIONS, scenarioFor } from "./scenario";
import type { CandidateRow, InvestmentProfile, MetricProvenance } from "./types";

const AS_OF = new Date("2026-08-04T00:00:00Z");

function m(value: number, over: Partial<MetricProvenance> = {}): MetricProvenance {
  return {
    value,
    unit: "%",
    sample_size: 30,
    period_start: "2025-06-30",
    period_end: "2026-06-30",
    status: "direct",
    source_id: "sa_metro_median_house_sales",
    licence: "CC BY 4.0",
    attribution: "© Government of South Australia (CC BY 4.0)",
    retrieved_at: "2026-06-01T00:00:00Z",
    provider: "official",
    ...over,
  };
}

function row(
  geo: string,
  v: { price: number; rent: number; yield: number; volume: number; growth: number },
  over: Partial<CandidateRow> = {},
): CandidateRow {
  return {
    geography_id: geo,
    jurisdiction: "SA",
    property_type: "house",
    suburb_name: geo,
    hasSupplyEvidence: true,
    hasDemographicEvidence: true,
    metrics: {
      median_house_price: m(v.price, { unit: "AUD" }),
      median_rent: m(v.rent, { unit: "AUD/week" }),
      gross_yield: m(v.yield, { status: "derived", unit: "%" }),
      sales_volume: m(v.volume, { unit: "count" }),
      price_growth_12m: m(v.growth, { unit: "%" }),
    },
    ...over,
  };
}

const PROFILE: InvestmentProfile = {
  maxPrice: 1_800_000,
  deposit: 400_000,
  strategy: "growth",
  acceptableWeeklyHoldingCost: 800,
  propertyType: "house",
  states: ["SA"],
  riskTolerance: "medium",
  holdingPeriodYears: 10,
};

const ROWS: CandidateRow[] = [
  row("SAL_40001_ASGS3_2021", { price: 700_000, rent: 560, yield: 4.16, volume: 45, growth: 9 }), // ALPHA
  row("SAL_40002_ASGS3_2021", { price: 800_000, rent: 620, yield: 4.03, volume: 20, growth: 4 }), // BRAVO
  row("SAL_40003_ASGS3_2021", { price: 650_000, rent: 600, yield: 4.8, volume: 60, growth: 12 }), // CHARLIE
  row("SAL_40004_ASGS3_2021", { price: 900_000, rent: 560, yield: 3.23, volume: 8, growth: -3 }), // DELTA
];

describe("A1 — identical inputs always produce identical rankings", () => {
  it("is deterministic across runs and orders by opportunity score", () => {
    const a = rankInvestments(PROFILE, ROWS, { asOf: AS_OF });
    const b = rankInvestments(PROFILE, [...ROWS].reverse(), { asOf: AS_OF });
    expect(a).toEqual(b); // input order does not matter
    expect(a.ranked.map((r) => r.geographyId)).toEqual([
      "SAL_40003_ASGS3_2021", // CHARLIE (growth 12, demand 60)
      "SAL_40001_ASGS3_2021", // ALPHA
      "SAL_40002_ASGS3_2021", // BRAVO
      "SAL_40004_ASGS3_2021", // DELTA (negative growth)
    ]);
    expect(a.scoreVersion).toBe("opportunity_score_v1");
    a.ranked.forEach((r) => expect(Number.isInteger(r.opportunityScore)).toBe(true));
  });
});

describe("A2 — weight changes produce explainable changes", () => {
  it("score equals the exact weighted sum of the same sub-indices (decomposable)", () => {
    for (const strategy of ["growth", "balanced", "yield"] as const) {
      const out = rankInvestments({ ...PROFILE, strategy }, ROWS, { asOf: AS_OF });
      for (const r of out.ranked) {
        const w = OPPORTUNITY_WEIGHTS[strategy];
        const expected = Math.round((w.growth / 100) * r.subIndices.growth + (w.demand / 100) * r.subIndices.demand + (w.yield / 100) * r.subIndices.yield);
        expect(r.opportunityScore).toBe(expected);
        expect(r.weights).toEqual(w);
      }
    }
  });
  it("switching to cash-flow weighting reweights the same sub-indices", () => {
    const g = rankInvestments({ ...PROFILE, strategy: "growth" }, ROWS, { asOf: AS_OF });
    const y = rankInvestments({ ...PROFILE, strategy: "yield" }, ROWS, { asOf: AS_OF });
    const gTop = g.ranked[0];
    const yTop = y.ranked.find((r) => r.geographyId === gTop.geographyId)!;
    // Same sub-indices, different weights → the delta is fully explained by weights.
    expect(yTop.subIndices).toEqual(gTop.subIndices);
    expect(yTop.opportunityScore).not.toBe(gTop.opportunityScore);
  });
});

describe("A3 — missing evidence can never improve a result", () => {
  it("a missing mandatory metric EXCLUDES (never ranks) the suburb", () => {
    const broken = ROWS.map((r) =>
      r.geography_id === "SAL_40003_ASGS3_2021"
        ? { ...r, metrics: { ...r.metrics, price_growth_12m: undefined as unknown as MetricProvenance } }
        : r,
    );
    const out = rankInvestments(PROFILE, broken, { asOf: AS_OF });
    expect(out.ranked.map((r) => r.geographyId)).not.toContain("SAL_40003_ASGS3_2021");
    expect(out.excluded.find((e) => e.geographyId === "SAL_40003_ASGS3_2021")?.reason).toBe("missing_mandatory_evidence");
  });
  it("a missing OPTIONAL metric lowers confidence only, never opportunity", () => {
    const withOpt = rankInvestments(PROFILE, ROWS, { asOf: AS_OF }).ranked[0];
    const noOpt = rankInvestments(
      PROFILE,
      ROWS.map((r) => ({ ...r, hasSupplyEvidence: false, hasDemographicEvidence: false })),
      { asOf: AS_OF },
    ).ranked[0];
    expect(noOpt.opportunityScore).toBe(withOpt.opportunityScore);
    expect(noOpt.confidence).toBeLessThan(withOpt.confidence);
  });
  it("worse evidence never yields a higher opportunity score", () => {
    const good = rankInvestments(PROFILE, [row("SAL_49999_ASGS3_2021", { price: 700_000, rent: 560, yield: 4.16, volume: 45, growth: 12 })], { asOf: AS_OF }).ranked[0];
    const worse = rankInvestments(PROFILE, [row("SAL_49999_ASGS3_2021", { price: 700_000, rent: 560, yield: 4.16, volume: 45, growth: 4 })], { asOf: AS_OF }).ranked[0];
    expect(worse.opportunityScore).toBeLessThanOrEqual(good.opportunityScore);
  });
});

describe("A4 — cash-flow scenario matches the independent deal engine", () => {
  it("reuses analyzeProperty exactly and yields the textbook gross yield", () => {
    const price = 650_000;
    const rent = 600;
    const deposit = 400_000;
    const sc = scenarioFor({ medianPrice: price, weeklyRent: rent, deposit, state: "SA", strategy: "growth" });
    expect(sc.grossYieldPct).toBeCloseTo(((rent * 52) / price) * 100, 6);

    const independent = analyzeProperty({
      purchasePrice: price,
      weeklyRent: rent,
      rentalGrowthRatePercent: SCENARIO_ASSUMPTIONS.rentalGrowthRatePct,
      interestRatePercent: SCENARIO_ASSUMPTIONS.investorInterestRatePct,
      depositPercent: (deposit / price) * 100,
      annualExpenses: SCENARIO_ASSUMPTIONS.annualHoldingExpenses,
      preTaxSalary: SCENARIO_ASSUMPTIONS.assumedTaxableSalary,
      yearBuilt: SCENARIO_ASSUMPTIONS.yearBuilt,
      buildingValuePercent: SCENARIO_ASSUMPTIONS.buildingValuePercent,
      fixturesEstimate: SCENARIO_ASSUMPTIONS.fixturesEstimate,
      suburbGrowthPercent: 0,
      vacancyPercent: SCENARIO_ASSUMPTIONS.vacancyPct,
      suburb: "",
      state: "SA",
      isInterestOnly: SCENARIO_ASSUMPTIONS.isInterestOnly,
      loanTermYears: SCENARIO_ASSUMPTIONS.loanTermYears,
      pmFeePercent: SCENARIO_ASSUMPTIONS.propertyManagementFeePct,
      strategy: "growth",
    });
    expect(sc.annualAfterTaxCashflow).toBeCloseTo(independent.afterTaxCashflow, 6);
    expect(sc.weeklyAfterTaxCashflow).toBeCloseTo(independent.afterTaxCashflow / 52, 6);
    expect(sc.lvr).toBeCloseTo(independent.lvr, 6);
  });
});

describe("A5 — ineligible suburbs cannot leak into rankings", () => {
  it("above-budget, stale, and over-holding-budget suburbs appear only in excluded", () => {
    const rows: CandidateRow[] = [
      row("SAL_40003_ASGS3_2021", { price: 650_000, rent: 600, yield: 4.8, volume: 60, growth: 12 }), // eligible
      row("SAL_40010_ASGS3_2021", { price: 2_000_000, rent: 900, yield: 2.34, volume: 30, growth: 8 }), // above budget
      row("SAL_40011_ASGS3_2021", { price: 700_000, rent: 560, yield: 4.16, volume: 45, growth: 9 }, {
        metrics: {
          median_house_price: m(700_000, { unit: "AUD", retrieved_at: "2024-01-01T00:00:00Z" }),
          median_rent: m(560, { unit: "AUD/week", retrieved_at: "2024-01-01T00:00:00Z" }),
          gross_yield: m(4.16, { status: "derived", retrieved_at: "2024-01-01T00:00:00Z" }),
          sales_volume: m(45, { unit: "count", retrieved_at: "2024-01-01T00:00:00Z" }),
          price_growth_12m: m(9, { retrieved_at: "2024-01-01T00:00:00Z" }),
        },
      }), // stale
    ];
    const strict: InvestmentProfile = { ...PROFILE, acceptableWeeklyHoldingCost: 50 };
    const out = rankInvestments(strict, rows, { asOf: AS_OF });
    const rankedIds = out.ranked.map((r) => r.geographyId);
    expect(rankedIds).not.toContain("SAL_40010_ASGS3_2021");
    expect(rankedIds).not.toContain("SAL_40011_ASGS3_2021");
    expect(out.excluded.find((e) => e.geographyId === "SAL_40010_ASGS3_2021")?.reason).toBe("above_price_budget");
    expect(out.excluded.find((e) => e.geographyId === "SAL_40011_ASGS3_2021")?.reason).toBe("stale_evidence");
    // every excluded id is absent from ranked
    for (const e of out.excluded) expect(rankedIds).not.toContain(e.geographyId);
  });
  it("blocks a state that is not offered for ranking", () => {
    const out = rankInvestments({ ...PROFILE, states: ["NSW"] }, ROWS, { asOf: AS_OF });
    expect(out.stateBlocked).toBe(true);
    expect(out.ranked).toHaveLength(0);
  });
});

describe("A6 — every displayed figure maps to provenance", () => {
  it("each mandatory metric on each ranked result carries source, period, freshness, status", () => {
    const out = rankInvestments(PROFILE, ROWS, { asOf: AS_OF });
    expect(out.ranked.length).toBeGreaterThan(0);
    for (const r of out.ranked) {
      for (const metric of ["median_house_price", "median_rent", "gross_yield", "sales_volume", "price_growth_12m"] as const) {
        const p = r.evidence[metric];
        expect(p).toBeTruthy();
        expect(p.source_id).toBeTruthy();
        expect(p.period_end ?? p.period_start).toBeTruthy();
        expect(p.retrieved_at).toBeTruthy();
        expect(["direct", "derived"]).toContain(p.status);
        expect(p.provider).toBe("official");
      }
    }
  });
});
