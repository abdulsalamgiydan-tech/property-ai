/**
 * Cash-flow scenario for a suburb candidate. Reuses the tested deal engine
 * (lib/propertyAnalysis.ts analyzeProperty) — the maths is never re-implemented
 * here. price and rent are WAREHOUSE values; everything else is a documented,
 * labelled assumption. Outputs are SCENARIOS, not financial advice.
 */
import { analyzeProperty } from "@/lib/propertyAnalysis";
import type { CashflowScenario, Strategy } from "./types";

/** Documented modelling assumptions (shown in the evidence drawer). */
export const SCENARIO_ASSUMPTIONS = {
  investorInterestRatePct: 6.2,
  annualHoldingExpenses: 3500,
  propertyManagementFeePct: 7,
  vacancyPct: 2,
  loanTermYears: 30,
  isInterestOnly: false,
  /** Taxable-income assumption used for after-tax modelling (labelled). */
  assumedTaxableSalary: 120_000,
  /** Depreciation modelling inputs (illustrative). */
  yearBuilt: 2005,
  buildingValuePercent: 55,
  fixturesEstimate: 12_000,
  /** Growth/rent growth carried forward for projection context. */
  rentalGrowthRatePct: 3,
} as const;

/**
 * Build a deterministic cash-flow scenario from warehouse price + rent.
 * The holding-cost gate uses `weeklyHoldingCost` (pre-tax out-of-pocket).
 */
export function scenarioFor(params: {
  medianPrice: number;
  weeklyRent: number;
  deposit: number;
  state: string;
  strategy: Strategy;
  suburbName?: string | null;
}): CashflowScenario {
  const { medianPrice, weeklyRent, deposit, state, strategy } = params;
  const depositPercent = medianPrice > 0 ? Math.min(100, Math.max(0, (deposit / medianPrice) * 100)) : 0;

  const r = analyzeProperty({
    purchasePrice: medianPrice,
    weeklyRent,
    rentalGrowthRatePercent: SCENARIO_ASSUMPTIONS.rentalGrowthRatePct,
    interestRatePercent: SCENARIO_ASSUMPTIONS.investorInterestRatePct,
    depositPercent,
    annualExpenses: SCENARIO_ASSUMPTIONS.annualHoldingExpenses,
    preTaxSalary: SCENARIO_ASSUMPTIONS.assumedTaxableSalary,
    yearBuilt: SCENARIO_ASSUMPTIONS.yearBuilt,
    buildingValuePercent: SCENARIO_ASSUMPTIONS.buildingValuePercent,
    fixturesEstimate: SCENARIO_ASSUMPTIONS.fixturesEstimate,
    suburbGrowthPercent: 0, // growth evidence is scored separately; not assumed here
    vacancyPercent: SCENARIO_ASSUMPTIONS.vacancyPct,
    suburb: params.suburbName ?? "",
    state,
    isInterestOnly: SCENARIO_ASSUMPTIONS.isInterestOnly,
    loanTermYears: SCENARIO_ASSUMPTIONS.loanTermYears,
    pmFeePercent: SCENARIO_ASSUMPTIONS.propertyManagementFeePct,
    strategy,
  });

  const weeklyPreTaxCashflow = r.preTaxCashflow / 52;
  const weeklyAfterTaxCashflow = r.afterTaxCashflow / 52;
  const weeklyHoldingCost = Math.max(0, -weeklyPreTaxCashflow);

  return {
    grossYieldPct: r.grossYieldPercent,
    weeklyPreTaxCashflow,
    weeklyAfterTaxCashflow,
    annualAfterTaxCashflow: r.afterTaxCashflow,
    weeklyHoldingCost,
    lvr: r.lvr,
    totalCashRequired: r.totalCashRequired,
    assumptions: {
      interest_rate_pct: SCENARIO_ASSUMPTIONS.investorInterestRatePct,
      annual_expenses: SCENARIO_ASSUMPTIONS.annualHoldingExpenses,
      pm_fee_pct: SCENARIO_ASSUMPTIONS.propertyManagementFeePct,
      vacancy_pct: SCENARIO_ASSUMPTIONS.vacancyPct,
      deposit_pct: Math.round(depositPercent * 10) / 10,
      assumed_taxable_salary: SCENARIO_ASSUMPTIONS.assumedTaxableSalary,
    },
  };
}
