import { describe, expect, it } from "vitest";
import {
  analyzeProperty,
  DEAL_ANALYSER_DEFAULT_PURCHASE_DATE,
  type PropertyAnalysisInputs,
} from "@/lib/propertyAnalysis";
import { calculateAnnualTaxImpact } from "@/lib/tax/budget2026AnnualTaxImpact";
import { calculateCGT } from "@/lib/tax/budget2026Cgt";
import { fyEndingJuneYearForProjectionRow } from "@/lib/tax/budget2026FinancialYear";
import {
  buildCashflowProjectionSeries,
  buildCashflowProjectionSeriesBudget2026,
  buildAmortisationScheduleYearly,
} from "@/lib/projections";
import { classifyTaxScenario } from "@/lib/tax/budget2026Scenario";

const NSW_BASELINE_INPUT: PropertyAnalysisInputs = {
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
  expensesGrowthRatePercent: 2.5,
  purchaseDate: new Date("2026-05-01T12:00:00+10:00"),
  propertyType: "established",
};

describe("classifyTaxScenario", () => {
  it("grandfathered before budget night", () => {
    expect(
      classifyTaxScenario({
        purchaseDate: new Date("2026-05-01"),
        propertyType: "established",
      })
    ).toBe("GRANDFATHERED");
  });
  it("post-budget established", () => {
    expect(
      classifyTaxScenario({
        purchaseDate: new Date("2026-06-01"),
        propertyType: "established",
      })
    ).toBe("POST_BUDGET_ESTABLISHED");
  });
  it("post-budget new build", () => {
    expect(
      classifyTaxScenario({
        purchaseDate: new Date("2026-06-01"),
        propertyType: "new_build",
      })
    ).toBe("POST_BUDGET_NEW_BUILD");
  });
});

describe("Test 1 — Grandfathered NSW baseline", () => {
  it("matches legacy marginal tax on rental taxable income (grandfathered)", () => {
    const r = analyzeProperty(NSW_BASELINE_INPUT);
    const legacyTaxEffect = r.taxablePropertyResult * r.marginalRate;
    const legacyAfterTax = r.preTaxCashflow - legacyTaxEffect;
    expect(r.taxScenarioId).toBe("GRANDFATHERED");
    expect(r.afterTaxCashflow).toBeCloseTo(legacyAfterTax, 6);
  });

  it("default purchase date matches explicit pre-budget purchase date numerically", () => {
    const rest = { ...NSW_BASELINE_INPUT };
    delete rest.purchaseDate;
    const implicit = analyzeProperty({
      ...rest,
    });
    const explicit = analyzeProperty({
      ...NSW_BASELINE_INPUT,
      purchaseDate: new Date(DEAL_ANALYSER_DEFAULT_PURCHASE_DATE.getTime()),
    });
    expect(implicit.afterTaxCashflow).toBe(explicit.afterTaxCashflow);
    expect(implicit.score).toBe(explicit.score);
  });

  it("projection series legacy vs budget2026 identical for grandfathered", () => {
    const r = analyzeProperty(NSW_BASELINE_INPUT);
    const schedule = buildAmortisationScheduleYearly(
      r.loan,
      r.interestRatePercent,
      30,
      r.isInterestOnly,
      r.loanTermYears
    );
    const legacy = buildCashflowProjectionSeries({
      weeklyRent: r.weeklyRent,
      rentalGrowthRatePercent: r.rentalGrowthRatePercent,
      annualExpenses: r.annualExpenses,
      expensesGrowthRatePercent: 2.5,
      amortisation: schedule,
      buildingDepreciation: r.depreciation.buildingDepreciation,
      fixturesEstimate: r.fixturesEstimate,
      marginalTaxRate: r.marginalRate,
      vacancyPercent: r.vacancyPercent,
      pmFeePercent: r.pmFeePercent,
    });
    const bud = buildCashflowProjectionSeriesBudget2026({
      weeklyRent: r.weeklyRent,
      rentalGrowthRatePercent: r.rentalGrowthRatePercent,
      annualExpenses: r.annualExpenses,
      expensesGrowthRatePercent: 2.5,
      amortisation: schedule,
      buildingDepreciation: r.depreciation.buildingDepreciation,
      fixturesEstimate: r.fixturesEstimate,
      marginalTaxRate: r.marginalRate,
      vacancyPercent: r.vacancyPercent,
      pmFeePercent: r.pmFeePercent,
      purchaseDate: r.purchaseDate,
      propertyType: r.propertyType,
      otherRentalIncome: 0,
    });
    for (let i = 0; i < legacy.length; i++) {
      expect(bud.cashflow[i].afterTaxCashflow).toBeCloseTo(legacy[i].afterTaxCashflow, 6);
      expect(bud.cashflow[i].preTaxCashflow).toBeCloseTo(legacy[i].preTaxCashflow, 6);
    }
  });
});

describe("Test 2 — Post-budget established ring-fencing", () => {
  it("accumulates carry-forward $45k over 10 years at constant $5k ring-fenced loss", () => {
    const purchaseDate = new Date("2026-06-01");
    let cf = 0;
    let y0Refund = 0;
    for (let i = 0; i < 10; i++) {
      const fy = fyEndingJuneYearForProjectionRow(purchaseDate, i);
      const impact = calculateAnnualTaxImpact({
        propertyTaxableIncome: -5000,
        scenario: "POST_BUDGET_ESTABLISHED",
        fyEndingJuneYear: fy,
        marginalRate: 0.39,
        carryForwardBalance: cf,
        otherRentalIncome: 0,
      });
      cf = impact.carryForwardBalanceEnd;
      if (i === 0) y0Refund = impact.taxRefundFromNG;
    }
    expect(y0Refund).toBeCloseTo(1950, 6);
    expect(cf).toBeCloseTo(45_000, 6);
  });
});

describe("Test 3 — Post-budget new build retains NG", () => {
  it("keeps zero carry-forward and annual refund when loss is constant", () => {
    const purchaseDate = new Date("2026-06-01");
    let cf = 0;
    for (let i = 0; i < 10; i++) {
      const fy = fyEndingJuneYearForProjectionRow(purchaseDate, i);
      const impact = calculateAnnualTaxImpact({
        propertyTaxableIncome: -5000,
        scenario: "POST_BUDGET_NEW_BUILD",
        fyEndingJuneYear: fy,
        marginalRate: 0.39,
        carryForwardBalance: cf,
        otherRentalIncome: 0,
      });
      cf = impact.carryForwardBalanceEnd;
      expect(impact.taxRefundFromNG).toBeCloseTo(1950, 6);
    }
    expect(cf).toBe(0);
  });

  it("new build CGT election returns both comparisons when sold after commencement", () => {
    const r = calculateCGT({
      purchaseDate: new Date("2026-06-01"),
      purchasePrice: 600_000,
      saleDate: new Date("2032-06-30"),
      salePrice: 900_000,
      scenario: "POST_BUDGET_NEW_BUILD",
      propertyType: "new_build",
      holdingCostsCapitalised: 0,
      marginalRate: 0.39,
      carryForwardLossesAtSale: 0,
      cpiAnnualPercent: 3,
    });
    expect(r.newBuildComparison).toBeDefined();
    expect(r.regimeApplied.startsWith("NEW_BUILD_ELECTION")).toBe(true);
  });
});

describe("Test 4 — Apportionment mixed gain", () => {
  it("matches specified intermediate figures (approx)", () => {
    const r = calculateCGT({
      purchaseDate: new Date("2026-06-01"),
      purchasePrice: 600_000,
      saleDate: new Date("2031-06-30"),
      salePrice: 900_000,
      scenario: "POST_BUDGET_ESTABLISHED",
      propertyType: "established",
      holdingCostsCapitalised: 0,
      marginalRate: 0.39,
      carryForwardLossesAtSale: 0,
      cpiAnnualPercent: 3,
    });
    expect(r.nominalGain).toBeCloseTo(300_000, 0);
    expect(r.preCommencementGain).toBeGreaterThan(60_000);
    expect(r.preCommencementGain).toBeLessThan(70_000);
    expect(r.regimeApplied).toBe("APPORTIONMENT");
    expect(r.postCommencementRealGain).toBeGreaterThan(140_000);
    expect(r.postCommencementRealGain).toBeLessThan(165_000);
  });
});

describe("Test 5 — Pre-1985 asset cost base reset", () => {
  it("taxes real gain after indexation from July 2027 market value", () => {
    const r = calculateCGT({
      purchaseDate: new Date("1980-01-01"),
      purchasePrice: 50_000,
      saleDate: new Date("2032-06-30"),
      salePrice: 2_000_000,
      scenario: "GRANDFATHERED",
      propertyType: "established",
      holdingCostsCapitalised: 0,
      marginalRate: 0.39,
      carryForwardLossesAtSale: 0,
      cpiAnnualPercent: 3,
      isPreCGTAsset: true,
      marketValueAt1July2027: 1_500_000,
    });
    expect(r.cgtPayable).toBeGreaterThan(80_000);
    expect(r.regimeApplied).toBe("FULL_NEW_REGIME");
    expect(r.postCommencementRealGain).toBeGreaterThan(240_000);
  });
});

describe("Test 6 — Other rental income absorbs ring-fenced loss", () => {
  it("keeps carry-forward at zero when other income covers loss", () => {
    const purchaseDate = new Date("2026-06-01");
    let cf = 0;
    for (let i = 0; i < 5; i++) {
      const fy = fyEndingJuneYearForProjectionRow(purchaseDate, i);
      const impact = calculateAnnualTaxImpact({
        propertyTaxableIncome: -3000,
        scenario: "POST_BUDGET_ESTABLISHED",
        fyEndingJuneYear: fy,
        marginalRate: 0.39,
        carryForwardBalance: cf,
        otherRentalIncome: 4000,
      });
      cf = impact.carryForwardBalanceEnd;
      if (fy >= 2028) {
        expect(cf).toBe(0);
        expect(impact.lossUsedAgainstOtherRental).toBe(3000);
      }
    }
  });
});

describe("Test 7 — Scenario comparison ordering", () => {
  it("grandfathered cumulative after-tax cashflow >= established post-budget on same synthetic series", () => {
    const schedule = buildAmortisationScheduleYearly(400_000, 6, 15, false, 30);
    const params = {
      weeklyRent: 400,
      rentalGrowthRatePercent: 3,
      annualExpenses: 8000,
      expensesGrowthRatePercent: 2.5,
      amortisation: schedule,
      buildingDepreciation: 5000,
      fixturesEstimate: 10_000,
      marginalTaxRate: 0.37,
      vacancyPercent: 2,
      pmFeePercent: 8,
      purchaseDate: new Date("2026-06-01"),
      propertyType: "established" as const,
      otherRentalIncome: 0,
    };
    const gf = buildCashflowProjectionSeriesBudget2026({
      ...params,
      scenarioOverride: "GRANDFATHERED",
    });
    const est = buildCashflowProjectionSeriesBudget2026({
      ...params,
      scenarioOverride: "POST_BUDGET_ESTABLISHED",
    });
    const nb = buildCashflowProjectionSeriesBudget2026({
      ...params,
      scenarioOverride: "POST_BUDGET_NEW_BUILD",
    });
    const sum = (x: typeof gf.cashflow) =>
      x.reduce((s, p) => s + p.afterTaxCashflow, 0);
    expect(sum(gf.cashflow)).toBeGreaterThanOrEqual(sum(est.cashflow));
    expect(sum(nb.cashflow)).toBeGreaterThanOrEqual(sum(est.cashflow));
  });
});
