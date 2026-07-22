/**
 * Pure reference implementations of the affordability/market-activity
 * formulas used by warehouse/scripts/market_intelligence/load_market_intelligence_to_branch.mjs
 * (which computes the same math in SQL against the branch). Kept here as
 * the canonical, documented, directly-testable version of each formula —
 * Sprint 9 Phase 11 explicitly requires unit tests for these calculations.
 *
 * Baseline scenario matches meta.metric_assumption
 * ('standard_20pct_deposit_30yr_pi'): 20% deposit, 30-year principal &
 * interest loan. This is descriptive research modelling only — not
 * financial advice or a recommendation.
 */

/** Standard amortising principal-and-interest monthly repayment. */
export function calculateMonthlyRepayment(principal: number, annualRatePercent: number, termYears: number): number {
  const monthlyRate = annualRatePercent / 100 / 12;
  const months = termYears * 12;
  if (monthlyRate === 0) return principal / months;
  const factor = Math.pow(1 + monthlyRate, months);
  return (principal * monthlyRate * factor) / (factor - 1);
}

export function calculateLoanPrincipal(salePrice: number, depositPercent: number): number {
  return salePrice * (1 - depositPercent / 100);
}

export function calculatePriceToIncomeRatio(medianSalePrice: number, medianWeeklyHouseholdIncome: number): number {
  return medianSalePrice / (medianWeeklyHouseholdIncome * 52);
}

export function calculateRentToIncomeRatio(medianWeeklyRent: number, medianWeeklyHouseholdIncome: number): number {
  return medianWeeklyRent / medianWeeklyHouseholdIncome;
}

export function calculateRepaymentToIncomePct(monthlyRepayment: number, medianWeeklyHouseholdIncome: number): number {
  return (monthlyRepayment / ((medianWeeklyHouseholdIncome * 52) / 12)) * 100;
}

export function calculateSalesTurnoverPct(salesVolume12m: number, dwellingStock: number): number | null {
  if (!dwellingStock || dwellingStock <= 0) return null;
  return (salesVolume12m / dwellingStock) * 100;
}

export function calculateApprovalsPer1000(approvals12m: number, dwellingStock: number): number | null {
  if (!dwellingStock || dwellingStock <= 0) return null;
  return (approvals12m / dwellingStock) * 1000;
}

export function calculateGrossYieldPct(medianWeeklyRent: number, medianSalePrice: number): number | null {
  if (!medianSalePrice || medianSalePrice <= 0) return null;
  return ((medianWeeklyRent * 52) / medianSalePrice) * 100;
}

/**
 * Remaining principal on a standard amortising P&I loan after a given
 * number of elapsed months — used to show a debt-paydown ("debt path")
 * over a holding period. Sprint 13 WS6 (Scenario Lab v2).
 */
export function calculateLoanBalanceAfterMonths(
  principal: number,
  annualRatePercent: number,
  termYears: number,
  monthsElapsed: number
): number {
  const totalMonths = termYears * 12;
  const elapsed = Math.min(Math.max(monthsElapsed, 0), totalMonths);
  const monthlyRate = annualRatePercent / 100 / 12;
  if (monthlyRate === 0) {
    return principal * (1 - elapsed / totalMonths);
  }
  const factor = Math.pow(1 + monthlyRate, totalMonths);
  const factorElapsed = Math.pow(1 + monthlyRate, elapsed);
  return principal * ((factor - factorElapsed) / (factor - 1));
}

/**
 * Simple net pre-tax annual cashflow: rent actually received (after an
 * assumed vacancy rate) minus loan repayments and operating expenses.
 * Descriptive scenario math only — no tax, depreciation or growth
 * assumption folded in here; those stay explicit, separate inputs.
 */
export function calculateAnnualCashflow(
  weeklyRent: number,
  vacancyPercent: number,
  monthlyRepayment: number,
  annualExpenses: number
): number {
  const grossAnnualRent = weeklyRent * 52 * (1 - vacancyPercent / 100);
  return grossAnnualRent - monthlyRepayment * 12 - annualExpenses;
}

/**
 * The weekly rent (before the same vacancy assumption) needed for annual
 * cashflow to reach exactly zero — a break-even point, not a target or a
 * recommendation. Returns null if vacancy is 100% (rent could never cover
 * costs at any price) rather than dividing by zero.
 */
export function calculateBreakEvenWeeklyRent(
  monthlyRepayment: number,
  annualExpenses: number,
  vacancyPercent: number
): number | null {
  const occupiedFraction = 1 - vacancyPercent / 100;
  if (occupiedFraction <= 0) return null;
  return (monthlyRepayment * 12 + annualExpenses) / (52 * occupiedFraction);
}
