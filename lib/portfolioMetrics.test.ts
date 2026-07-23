import { describe, expect, it } from "vitest";
import {
  calculatePortfolioPropertyMetrics,
  calculatePortfolioTotals,
  portfolioOwnershipShare,
  type PortfolioMetricsInput,
} from "@/lib/portfolioMetrics";

function property(
  overrides: Partial<PortfolioMetricsInput> = {}
): PortfolioMetricsInput {
  return {
    current_value: 1_000_000,
    loan_balance: 400_000,
    weekly_rent: 1_000,
    annual_expenses: 12_000,
    ownership_percentage: 100,
    ...overrides,
  };
}

describe("portfolio ownership metrics", () => {
  it("scales every economic metric to the ownership share", () => {
    const metrics = calculatePortfolioPropertyMetrics(
      property({ ownership_percentage: 50 })
    );

    expect(metrics).toEqual({
      ownershipShare: 0.5,
      value: 500_000,
      debt: 200_000,
      equity: 300_000,
      annualRent: 26_000,
      annualExpenses: 6_000,
      annualCashflow: 20_000,
    });
  });

  it("treats a missing ownership percentage as full ownership", () => {
    expect(portfolioOwnershipShare(property({ ownership_percentage: null }))).toBe(1);
    expect(calculatePortfolioPropertyMetrics(property({ ownership_percentage: null })).equity)
      .toBe(600_000);
  });

  it("clamps invalid stored ownership percentages to safe bounds", () => {
    expect(portfolioOwnershipShare(property({ ownership_percentage: -10 }))).toBe(0);
    expect(portfolioOwnershipShare(property({ ownership_percentage: 150 }))).toBe(1);
    expect(portfolioOwnershipShare(property({ ownership_percentage: Number.NaN }))).toBe(1);
  });

  it("aggregates mixed ownership shares and calculates LVR", () => {
    const totals = calculatePortfolioTotals([
      property({ ownership_percentage: 50 }),
      property({
        current_value: 500_000,
        loan_balance: 100_000,
        weekly_rent: 500,
        annual_expenses: 5_000,
        ownership_percentage: 100,
      }),
    ]);

    expect(totals).toEqual({
      value: 1_000_000,
      debt: 300_000,
      equity: 700_000,
      annualRent: 52_000,
      annualExpenses: 11_000,
      annualCashflow: 41_000,
      lvrPercent: 30,
    });
  });
});
