import { describe, expect, it } from "vitest";
import {
  calculateApprovalsPer1000,
  calculateGrossYieldPct,
  calculateLoanPrincipal,
  calculateMonthlyRepayment,
  calculatePriceToIncomeRatio,
  calculateRentToIncomeRatio,
  calculateRepaymentToIncomePct,
  calculateSalesTurnoverPct,
} from "./affordability";
import { stateLabel } from "./stateCode";

describe("calculateMonthlyRepayment", () => {
  it("matches a known reference amortisation value", () => {
    // $400,000 loan, 6% p.a., 30 years -> ~$2,398.20/month (standard P&I formula)
    const repayment = calculateMonthlyRepayment(400_000, 6, 30);
    expect(repayment).toBeCloseTo(2398.2, 0);
  });

  it("scales principal linearly at a fixed rate/term", () => {
    const a = calculateMonthlyRepayment(200_000, 6, 30);
    const b = calculateMonthlyRepayment(400_000, 6, 30);
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it("handles a 0% rate as a straight-line repayment", () => {
    const repayment = calculateMonthlyRepayment(360_000, 0, 30);
    expect(repayment).toBeCloseTo(1000, 6); // 360,000 / 360 months
  });
});

describe("calculateLoanPrincipal", () => {
  it("applies the deposit percentage against sale price", () => {
    expect(calculateLoanPrincipal(1_000_000, 20)).toBe(800_000);
  });
});

describe("calculatePriceToIncomeRatio", () => {
  it("divides price by annualised household income", () => {
    // $1.2M price / ($1,500/wk * 52) = 15.38
    expect(calculatePriceToIncomeRatio(1_200_000, 1500)).toBeCloseTo(15.38, 2);
  });
});

describe("calculateRentToIncomeRatio", () => {
  it("is the ratio of weekly rent to weekly household income", () => {
    expect(calculateRentToIncomeRatio(650, 2000)).toBeCloseTo(0.325, 6);
  });
});

describe("calculateRepaymentToIncomePct", () => {
  it("expresses monthly repayment as a percent of monthly household income", () => {
    // $2,500/month repayment vs $2,000/wk income (= $8,666.67/month) -> 28.85%
    const pct = calculateRepaymentToIncomePct(2500, 2000);
    expect(pct).toBeCloseTo(28.85, 1);
  });
});

describe("calculateSalesTurnoverPct", () => {
  it("computes rolling-12m sales as a percent of dwelling stock", () => {
    expect(calculateSalesTurnoverPct(150, 5000)).toBeCloseTo(3, 6);
  });

  it("returns null (not zero/NaN) when dwelling stock is missing or zero", () => {
    expect(calculateSalesTurnoverPct(10, 0)).toBeNull();
  });

  it("can legitimately exceed 100% for small, high-turnover geographies", () => {
    // 6 sales against a stock of 5 dwellings — a real, valid edge case, not an error.
    expect(calculateSalesTurnoverPct(6, 5)).toBeCloseTo(120, 6);
  });
});

describe("calculateApprovalsPer1000", () => {
  it("computes approvals per 1,000 existing dwellings", () => {
    expect(calculateApprovalsPer1000(50, 10_000)).toBeCloseTo(5, 6);
  });

  it("returns null when dwelling stock is missing", () => {
    expect(calculateApprovalsPer1000(10, 0)).toBeNull();
  });
});

describe("calculateGrossYieldPct", () => {
  it("annualises weekly rent and divides by sale price", () => {
    // $500/wk * 52 = $26,000 / $650,000 = 4%
    expect(calculateGrossYieldPct(500, 650_000)).toBeCloseTo(4, 6);
  });

  it("returns null (never a bare number) when sale price is missing", () => {
    expect(calculateGrossYieldPct(500, 0)).toBeNull();
  });
});

describe("stateLabel", () => {
  it("maps ASGS numeric state codes to human-readable abbreviations", () => {
    expect(stateLabel("1")).toBe("NSW");
    expect(stateLabel("2")).toBe("VIC");
  });

  it("returns null for a missing state code rather than an empty string", () => {
    expect(stateLabel(null)).toBeNull();
    expect(stateLabel(undefined)).toBeNull();
  });

  it("falls back to the raw code for an unrecognised value instead of hiding it", () => {
    expect(stateLabel("99")).toBe("99");
  });
});
