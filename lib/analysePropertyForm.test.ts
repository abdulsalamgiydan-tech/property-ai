import { describe, expect, it } from "vitest";
import {
  buildPropertyAnalysisInputFromForm,
  type AnalysePropertyFormFields,
} from "@/lib/analysePropertyForm";

const VALID_FORM: AnalysePropertyFormFields = {
  purchasePrice: "550,000",
  weeklyRent: "520",
  rentalGrowthRate: "3",
  interestRate: "6.2",
  depositPercent: "20",
  annualExpenses: "6,500",
  expensesGrowthRate: "2.5",
  suburbGrowthPercent: "5",
  vacancyPercent: "2",
  preTaxSalary: "120,000",
  yearBuilt: "2010",
  buildingValuePercent: "80",
  fixturesEstimate: "10,000",
  pmFeePercent: "8",
  loanTermYears: "30",
  suburb: "Newcastle",
  state: "NSW",
  isInterestOnly: false,
};

function buildWithDeposit(depositPercent: string) {
  return buildPropertyAnalysisInputFromForm(
    { ...VALID_FORM, depositPercent },
    "balanced",
    2026
  );
}

describe("buildPropertyAnalysisInputFromForm deposit validation", () => {
  it.each(["-1", "100.01"])("rejects an out-of-range deposit of %s%%", (depositPercent) => {
    const result = buildWithDeposit(depositPercent);

    expect(result).toEqual({
      ok: false,
      errors: {
        depositPercent: "Deposit must be between 0% and 100% of the purchase price.",
      },
    });
  });

  it.each(["0", "100"])("accepts the boundary deposit of %s%%", (depositPercent) => {
    const result = buildWithDeposit(depositPercent);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.depositPercent).toBe(Number(depositPercent));
    }
  });
});
