import { describe, expect, it } from "vitest";
import {
  buildAmortisationScheduleYearly,
  buildCashflowProjectionSeries,
  buildCashflowProjectionSeriesBudget2026,
} from "@/lib/projections";

const CASHFLOW_INPUTS = {
  weeklyRent: 600,
  rentalGrowthRatePercent: 0,
  annualExpenses: 6_000,
  expensesGrowthRatePercent: 0,
  buildingDepreciation: 0,
  fixturesEstimate: 0,
  marginalTaxRate: 0,
  vacancyPercent: 0,
  pmFeePercent: 0,
};

describe("cashflow projection finance costs", () => {
  it("retains interest in the final chart year for a longer interest-only loan", () => {
    const amortisation = buildAmortisationScheduleYearly(
      400_000,
      6,
      30,
      true,
      40
    );

    expect(amortisation).toHaveLength(31);
    expect(amortisation[30].nextYearAnnualInterest).toBeCloseTo(24_000, 6);

    const legacy = buildCashflowProjectionSeries({
      ...CASHFLOW_INPUTS,
      amortisation,
    });
    const budget2026 = buildCashflowProjectionSeriesBudget2026({
      ...CASHFLOW_INPUTS,
      amortisation,
      purchaseDate: new Date("2026-05-01"),
      propertyType: "established",
    });

    expect(legacy[30].preTaxCashflow).toBeCloseTo(1_200, 6);
    expect(budget2026.cashflow[30].preTaxCashflow).toBeCloseTo(1_200, 6);
  });

  it("matches a longer reference schedule for a 40-year principal-and-interest loan", () => {
    const amortisation = buildAmortisationScheduleYearly(
      400_000,
      6,
      30,
      false,
      40
    );
    const reference = buildAmortisationScheduleYearly(
      400_000,
      6,
      31,
      false,
      40
    );

    expect(amortisation[30].nextYearAnnualInterest).toBeCloseTo(
      reference[31].annualInterest,
      6
    );
    expect(amortisation[30].nextYearAnnualInterest).toBeGreaterThan(0);
  });

  it("keeps final-year interest at zero after a 30-year loan is repaid", () => {
    const amortisation = buildAmortisationScheduleYearly(
      400_000,
      6,
      30,
      false,
      30
    );

    expect(amortisation[30].closingBalance).toBeCloseTo(0, 6);
    expect(amortisation[30].nextYearAnnualInterest).toBe(0);
  });
});
