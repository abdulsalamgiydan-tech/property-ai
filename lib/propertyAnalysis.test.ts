import { describe, expect, it } from "vitest";
import {
  analyzeProperty,
  type PropertyAnalysisInputs,
} from "@/lib/propertyAnalysis";

const BASE_INPUT: PropertyAnalysisInputs = {
  purchasePrice: 600_000,
  weeklyRent: 550,
  rentalGrowthRatePercent: 3,
  interestRatePercent: 6,
  depositPercent: 20,
  annualExpenses: 7_000,
  preTaxSalary: 120_000,
  yearBuilt: 2015,
  buildingValuePercent: 80,
  fixturesEstimate: 10_000,
  suburbGrowthPercent: 5,
  vacancyPercent: 5,
  suburb: "Test",
  state: "NSW",
  isInterestOnly: false,
  loanTermYears: 30,
  pmFeePercent: 8,
  strategy: "balanced",
};

describe("break-even weekly rent diagnostics", () => {
  it("produces rents that zero the corresponding year-one cashflow", () => {
    const result = analyzeProperty(BASE_INPUT);

    const atPreTaxBreakEven = analyzeProperty({
      ...BASE_INPUT,
      weeklyRent: result.diagnostics.breakEvenWeeklyPreTax,
    });
    const atAfterTaxBreakEven = analyzeProperty({
      ...BASE_INPUT,
      weeklyRent: result.diagnostics.breakEvenWeeklyAfterTax,
    });

    expect(atPreTaxBreakEven.preTaxCashflow).toBeCloseTo(0, 6);
    expect(atAfterTaxBreakEven.afterTaxCashflow).toBeCloseTo(0, 6);
  });

  it("accounts for vacancy and management fees without depending on current rent", () => {
    const lowerCurrentRent = analyzeProperty({
      ...BASE_INPUT,
      weeklyRent: 300,
    });
    const higherCurrentRent = analyzeProperty({
      ...BASE_INPUT,
      weeklyRent: 900,
    });
    const fullyCollectedWithoutManagement = analyzeProperty({
      ...BASE_INPUT,
      vacancyPercent: 0,
      pmFeePercent: 0,
    });

    expect(lowerCurrentRent.diagnostics.breakEvenWeeklyPreTax).toBeCloseTo(
      higherCurrentRent.diagnostics.breakEvenWeeklyPreTax,
      10
    );
    expect(lowerCurrentRent.diagnostics.breakEvenWeeklyAfterTax).toBeCloseTo(
      higherCurrentRent.diagnostics.breakEvenWeeklyAfterTax,
      10
    );
    expect(lowerCurrentRent.diagnostics.breakEvenWeeklyPreTax).toBeGreaterThan(
      fullyCollectedWithoutManagement.diagnostics.breakEvenWeeklyPreTax
    );
    expect(lowerCurrentRent.diagnostics.breakEvenWeeklyAfterTax).toBeGreaterThan(
      fullyCollectedWithoutManagement.diagnostics.breakEvenWeeklyAfterTax
    );
  });
});
