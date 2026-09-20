import { describe, expect, it } from "vitest";
import {
  neutralPreTaxDepositPercent,
  neutralPreTaxInterestRatePercent,
} from "@/lib/advisoryInsights";
import {
  analyzeProperty,
  type PropertyAnalysisInputs,
} from "@/lib/propertyAnalysis";

const BASE_INPUT: PropertyAnalysisInputs = {
  purchasePrice: 550_000,
  weeklyRent: 520,
  rentalGrowthRatePercent: 3,
  interestRatePercent: 6.2,
  depositPercent: 20,
  annualExpenses: 6500,
  preTaxSalary: 120_000,
  yearBuilt: 2010,
  buildingValuePercent: 80,
  fixturesEstimate: 10_000,
  suburbGrowthPercent: 5,
  vacancyPercent: 2,
  suburb: "Test",
  state: "NSW",
  isInterestOnly: false,
  loanTermYears: 30,
  pmFeePercent: 8,
  strategy: "balanced",
};

describe.each([
  ["principal-and-interest", false],
  ["interest-only", true],
] as const)("neutral pre-tax sensitivities for %s loans", (_label, isInterestOnly) => {
  const input = { ...BASE_INPUT, isInterestOnly };

  it("finds a deposit that reproduces neutral pre-tax cashflow", () => {
    const result = analyzeProperty(input);
    const depositPercent = neutralPreTaxDepositPercent(result);

    expect(depositPercent).not.toBeNull();
    const adjusted = analyzeProperty({
      ...input,
      depositPercent: depositPercent!,
    });
    expect(adjusted.preTaxCashflow).toBeCloseTo(0, 6);
  });

  it("finds an interest rate that reproduces neutral pre-tax cashflow", () => {
    const result = analyzeProperty(input);
    const interestRatePercent = neutralPreTaxInterestRatePercent(result);

    expect(interestRatePercent).not.toBeNull();
    const adjusted = analyzeProperty({
      ...input,
      interestRatePercent: interestRatePercent!,
    });
    expect(adjusted.preTaxCashflow).toBeCloseTo(0, 6);
  });
});

describe("unavailable neutral pre-tax sensitivities", () => {
  it("does not suggest changing the deposit when interest is zero", () => {
    const result = analyzeProperty({
      ...BASE_INPUT,
      interestRatePercent: 0,
    });

    expect(neutralPreTaxDepositPercent(result)).toBeNull();
  });

  it("does not suggest changing the rate when there is no loan", () => {
    const result = analyzeProperty({
      ...BASE_INPUT,
      depositPercent: 100,
    });

    expect(neutralPreTaxInterestRatePercent(result)).toBeNull();
  });
});
