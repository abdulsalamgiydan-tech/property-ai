import { describe, expect, it } from "vitest";
import { buildStressTestRows, DEFAULT_STRESS_SHOCKS } from "./propertyAnalysisSensitivity";
import { analyzeProperty, type PropertyAnalysisInputs } from "./propertyAnalysis";

function baseInput(overrides: Partial<PropertyAnalysisInputs> = {}): PropertyAnalysisInputs {
  return {
    purchasePrice: 550_000,
    weeklyRent: 520,
    rentalGrowthRatePercent: 3,
    interestRatePercent: 6.2,
    depositPercent: 20,
    annualExpenses: 6_500,
    preTaxSalary: 120_000,
    yearBuilt: 2010,
    buildingValuePercent: 80,
    fixturesEstimate: 10_000,
    suburbGrowthPercent: 5,
    vacancyPercent: 2,
    suburb: "Calderwood",
    state: "QLD",
    isInterestOnly: false,
    loanTermYears: 30,
    pmFeePercent: 8,
    strategy: "growth",
    ...overrides,
  };
}

describe("buildStressTestRows", () => {
  it("the zero-shock row matches the unshocked analyzeProperty() result exactly", () => {
    const input = baseInput();
    const baseline = analyzeProperty(input);
    const rows = buildStressTestRows(input);
    const zeroShockRow = rows.find((r) => r.label === "Current assumptions")!;

    expect(zeroShockRow.afterTaxCashflow).toBeCloseTo(baseline.afterTaxCashflow, 6);
    expect(zeroShockRow.score).toBe(baseline.score);
    expect(zeroShockRow.status).toBe(baseline.status);
    expect(zeroShockRow.interestRatePercent).toBe(input.interestRatePercent);
    expect(zeroShockRow.vacancyPercent).toBe(input.vacancyPercent);
  });

  it("increasing interest rate shocks monotonically worsens after-tax cashflow on a leveraged deal", () => {
    const input = baseInput();
    const rows = buildStressTestRows(input, [
      { label: "0", rateDeltaPercent: 0, vacancyDeltaPercent: 0 },
      { label: "+1", rateDeltaPercent: 1, vacancyDeltaPercent: 0 },
      { label: "+2", rateDeltaPercent: 2, vacancyDeltaPercent: 0 },
      { label: "+3", rateDeltaPercent: 3, vacancyDeltaPercent: 0 },
    ]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].afterTaxCashflow).toBeLessThan(rows[i - 1].afterTaxCashflow);
    }
  });

  it("floors the shocked interest rate at 0 rather than going negative", () => {
    const input = baseInput({ interestRatePercent: 1 });
    const rows = buildStressTestRows(input, [
      { label: "big negative shock", rateDeltaPercent: -5, vacancyDeltaPercent: 0 },
    ]);
    expect(rows[0].interestRatePercent).toBe(0);
  });

  it("clamps the shocked vacancy rate to [0, 100]", () => {
    const highVacancyInput = baseInput({ vacancyPercent: 98 });
    const rows = buildStressTestRows(highVacancyInput, [
      { label: "vacancy overflow", rateDeltaPercent: 0, vacancyDeltaPercent: 10 },
    ]);
    expect(rows[0].vacancyPercent).toBe(100);

    const lowVacancyInput = baseInput({ vacancyPercent: 2 });
    const rows2 = buildStressTestRows(lowVacancyInput, [
      { label: "vacancy underflow", rateDeltaPercent: 0, vacancyDeltaPercent: -10 },
    ]);
    expect(rows2[0].vacancyPercent).toBe(0);
  });

  it("the default shock grid covers rate-only, vacancy-only, and combined shocks", () => {
    const kinds = DEFAULT_STRESS_SHOCKS.map((s) => ({
      rate: s.rateDeltaPercent > 0,
      vacancy: s.vacancyDeltaPercent > 0,
    }));
    expect(kinds.some((k) => k.rate && !k.vacancy)).toBe(true);
    expect(kinds.some((k) => !k.rate && k.vacancy)).toBe(true);
    expect(kinds.some((k) => k.rate && k.vacancy)).toBe(true);
  });

  it("never mutates the input object passed in", () => {
    const input = baseInput();
    const snapshot = { ...input };
    buildStressTestRows(input);
    expect(input).toEqual(snapshot);
  });
});
