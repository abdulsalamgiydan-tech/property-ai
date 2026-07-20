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
