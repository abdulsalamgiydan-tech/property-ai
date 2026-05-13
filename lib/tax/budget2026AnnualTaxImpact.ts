import { LAST_TRANSITIONAL_NG_FY_ENDING_JUNE_YEAR } from "@/lib/tax/budget2026Constants";
import type { TaxScenarioId } from "@/lib/tax/budget2026Scenario";

/** Established post-budget: salary NG ends after FY ending June 2027 (transitional). */
export function isNegativeGearingRingFenced(
  scenario: TaxScenarioId,
  fyEndingJuneYear: number
): boolean {
  if (scenario !== "POST_BUDGET_ESTABLISHED") return false;
  return fyEndingJuneYear > LAST_TRANSITIONAL_NG_FY_ENDING_JUNE_YEAR;
}

export type AnnualTaxImpactResult = {
  taxableRentalIncome: number;
  taxRefundFromNG: number;
  lossUsedAgainstOtherRental: number;
  lossAddedToCarryForward: number;
  carryForwardBalanceEnd: number;
};

/**
 * Salary-side rental inclusion + ring-fence ledger update for one income year.
 * `propertyTaxableIncome` = pre-tax cashflow minus depreciation (same basis as existing tool).
 */
export function calculateAnnualTaxImpact(params: {
  propertyTaxableIncome: number;
  scenario: TaxScenarioId;
  fyEndingJuneYear: number;
  marginalRate: number;
  carryForwardBalance: number;
  otherRentalIncome?: number;
}): AnnualTaxImpactResult {
  const {
    propertyTaxableIncome,
    scenario,
    fyEndingJuneYear,
    marginalRate,
    carryForwardBalance,
    otherRentalIncome = 0,
  } = params;

  let cf = Math.max(0, carryForwardBalance);
  let propTax = propertyTaxableIncome;
  const otherIn = Math.max(0, otherRentalIncome);

  // Apply brought-forward losses against a positive rental taxable result first.
  if (propTax > 0) {
    const use = Math.min(cf, propTax);
    propTax -= use;
    cf -= use;
  }

  let otherRem = otherIn;
  if (otherRem > 0 && cf > 0) {
    const use2 = Math.min(cf, otherRem);
    otherRem -= use2;
    cf -= use2;
  }

  const ring = isNegativeGearingRingFenced(scenario, fyEndingJuneYear);

  if (ring && propTax < 0) {
    const loss = -propTax;
    const absorbOther = Math.min(loss, otherRem);
    const leftoverLoss = loss - absorbOther;
    cf += leftoverLoss;

    const taxRefundFromNG = 0;
    return {
      taxableRentalIncome: 0,
      taxRefundFromNG,
      lossUsedAgainstOtherRental: absorbOther,
      lossAddedToCarryForward: leftoverLoss,
      carryForwardBalanceEnd: cf,
    };
  }

  // Deductible against salary (grandfathered, new build, transitional established, or non-loss).
  const taxableRentalIncome = propTax;
  const taxOnSalaryFromProperty = taxableRentalIncome * marginalRate;
  const taxRefundFromNG = Math.max(0, -taxOnSalaryFromProperty);

  return {
    taxableRentalIncome,
    taxRefundFromNG,
    lossUsedAgainstOtherRental: 0,
    lossAddedToCarryForward: 0,
    carryForwardBalanceEnd: cf,
  };
}
