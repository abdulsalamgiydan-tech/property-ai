import type { InvestmentStrategyId } from "@/lib/investmentStrategy";
import type { PropertyAnalysisInputs } from "@/lib/propertyAnalysis";

function parseNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function parseIntStrict(value: string): number {
  const n = parseInt(value.replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : NaN;
}

export type AnalysePropertyFormFields = {
  purchasePrice: string;
  weeklyRent: string;
  rentalGrowthRate: string;
  interestRate: string;
  depositPercent: string;
  annualExpenses: string;
  expensesGrowthRate: string;
  suburbGrowthPercent: string;
  vacancyPercent: string;
  preTaxSalary: string;
  yearBuilt: string;
  buildingValuePercent: string;
  fixturesEstimate: string;
  pmFeePercent: string;
  loanTermYears: string;
  suburb: string;
  state: string;
  isInterestOnly: boolean;
};

export type AnalyseFormBuildResult =
  | { ok: true; input: PropertyAnalysisInputs }
  | { ok: false; errors: Record<string, string> };

/** Shared validation + input build for Analyse a Property (financial fields only). */
export function buildPropertyAnalysisInputFromForm(
  f: AnalysePropertyFormFields,
  strategy: InvestmentStrategyId,
  currentYear: number
): AnalyseFormBuildResult {
  const price = parseNumber(f.purchasePrice);
  const weekly = parseNumber(f.weeklyRent);
  const rentalGrowth = parseNumber(f.rentalGrowthRate);
  const rate = parseNumber(f.interestRate);
  const deposit = parseNumber(f.depositPercent);
  const expenses = parseNumber(f.annualExpenses);
  const expensesGrowth = parseNumber(f.expensesGrowthRate);
  const growth = parseNumber(f.suburbGrowthPercent);
  const vacancy = parseNumber(f.vacancyPercent);
  const salary = parseNumber(f.preTaxSalary);
  const yb = parseIntStrict(f.yearBuilt);
  const bvp = parseNumber(f.buildingValuePercent);
  const fix = parseNumber(f.fixturesEstimate);
  const pmFee = parseNumber(f.pmFeePercent);
  const loanYears = parseIntStrict(f.loanTermYears);

  const nextErrors: Record<string, string> = {};
  if (!(price > 0)) {
    nextErrors.purchasePrice =
      f.purchasePrice.trim() === ""
        ? "Please enter a purchase price."
        : "Purchase price must be a number greater than zero.";
  }
  if (!Number.isFinite(weekly) || weekly < 0) {
    nextErrors.weeklyRent =
      f.weeklyRent.trim() === ""
        ? "Please enter expected weekly rent (use 0 only if you are modelling no rent)."
        : "Weekly rent needs to be a valid number.";
  }
  if (!Number.isFinite(deposit)) {
    nextErrors.depositPercent =
      "Enter your deposit as a percentage of the purchase price (e.g. 20 for 20%).";
  }
  if (!Number.isFinite(rate) || rate < 0) {
    nextErrors.interestRate =
      f.interestRate.trim() === ""
        ? "Please enter the loan interest rate."
        : "Interest rate must be zero or higher.";
  }
  if (!Number.isFinite(loanYears) || loanYears < 1 || loanYears > 40) {
    nextErrors.loanTermYears =
      f.loanTermYears.trim() === ""
        ? "Please enter the loan term in whole years."
        : "Loan term must be between 1 and 40 years.";
  }
  if (!Number.isFinite(expenses) || expenses < 0) {
    nextErrors.annualExpenses =
      f.annualExpenses.trim() === ""
        ? "Please enter estimated annual holding costs (excluding the loan)."
        : "Annual expenses must be a valid amount (0 or higher).";
  }
  if (!Number.isFinite(salary) || salary < 0) {
    nextErrors.preTaxSalary =
      f.preTaxSalary.trim() === ""
        ? "Pre-tax salary is needed to estimate your marginal tax rate."
        : "Salary must be a valid amount (0 or higher).";
  }
  if (!Number.isFinite(yb) || yb < 1800 || yb > currentYear + 2) {
    nextErrors.yearBuilt =
      f.yearBuilt.trim() === ""
        ? "Please enter the year the property was built."
        : `Year built should be between 1800 and ${currentYear + 2}.`;
  }
  if (!Number.isFinite(rentalGrowth)) {
    nextErrors.rentalGrowthRate =
      "Enter an annual rental growth rate for projections (e.g. 3 for 3% p.a.).";
  }
  if (!Number.isFinite(expensesGrowth)) {
    nextErrors.expensesGrowthRate =
      "Enter an annual expenses growth rate (e.g. 2.5 for 2.5% p.a.).";
  }
  if (!Number.isFinite(growth)) {
    nextErrors.suburbGrowthPercent =
      "Enter an annual capital growth assumption for long-term projections (e.g. 4).";
  }
  if (!Number.isFinite(vacancy) || vacancy < 0) {
    nextErrors.vacancyPercent = "Vacancy rate must be zero or higher (e.g. 2 for 2%).";
  }
  if (!Number.isFinite(bvp) || bvp < 0 || bvp > 100) {
    nextErrors.buildingValuePercent =
      "Building value must be between 0% and 100% of the purchase price.";
  }
  if (!Number.isFinite(fix) || fix < 0) {
    nextErrors.fixturesEstimate = "Enter an estimate for fixtures and plant (0 or higher).";
  }
  if (!Number.isFinite(pmFee) || pmFee < 0) {
    nextErrors.pmFeePercent =
      "Enter the management fee as a percentage of rent collected (0 or higher).";
  }

  if (Object.keys(nextErrors).length > 0) {
    return { ok: false, errors: nextErrors };
  }

  return {
    ok: true,
    input: {
      purchasePrice: price,
      weeklyRent: weekly,
      rentalGrowthRatePercent: rentalGrowth,
      interestRatePercent: rate,
      depositPercent: deposit,
      annualExpenses: expenses,
      preTaxSalary: salary,
      yearBuilt: yb,
      buildingValuePercent: bvp,
      fixturesEstimate: fix,
      suburbGrowthPercent: growth,
      vacancyPercent: vacancy,
      suburb: f.suburb.trim(),
      state: f.state,
      isInterestOnly: f.isInterestOnly,
      loanTermYears: loanYears,
      pmFeePercent: pmFee,
      strategy,
    },
  };
}
