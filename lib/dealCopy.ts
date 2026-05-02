import {
  DEAL_SCORE_AMBER_MIN,
  DEAL_SCORE_GREEN_MIN,
  type PropertyAnalysisResult,
} from "@/lib/propertyAnalysis";
import { formatAud } from "@/lib/formatCurrency";

function fmtInline(n: number): string {
  return formatAud(n).replace(/\u00a0/g, " ");
}

export function negativeGearingSummaryBullets(
  r: PropertyAnalysisResult
): string[] {
  const neg = r.taxablePropertyResult < 0;
  const dep = r.depreciation.totalDepreciation;
  const benefit = r.taxBenefit;
  const lift = r.afterTaxCashflow - r.preTaxCashflow;
  const material =
    r.preTaxCashflow < 0 &&
    r.afterTaxCashflow > r.preTaxCashflow + 1 &&
    benefit >= 2000;

  return [
    neg
      ? `**Negatively geared** on this estimate—taxable property **result** is **${formatAud(r.taxablePropertyResult)}** (a paper loss before other offsets); check eligibility with a tax adviser—this model is **not** lodgement advice.`
      : `**Not negatively geared** here—taxable property **result** is **${formatAud(r.taxablePropertyResult)}**; **no loss stream** from this line item in the stub.`,

    `**Estimated depreciation (illustrative):** **${formatAud(dep)}/yr** combined building + plant—confirm with a quantity surveyor; do not rely on this figure for lodgement.`,

    `**Model tax cashflow effect** (signed) at **${(r.marginalRate * 100).toFixed(0)}%** marginal: **${formatAud(benefit)}/yr**—positive lifts after-tax cashflow vs pre-tax; **negative is extra tax owed** on taxable property income; **not** comprehensive tax advice.`,

    material
      ? `**After-tax cashflow** is **${formatAud(r.afterTaxCashflow)}/yr** versus **${formatAud(r.preTaxCashflow)}/yr** pre-tax—tax materially softens the annual hit (**~${formatAud(lift)}/yr**), but verify with an adviser.`
      : r.preTaxCashflow >= 0
        ? lift < -1
          ? `**After-tax** (**${formatAud(r.afterTaxCashflow)}/yr**) is **below pre-tax** (**${formatAud(r.preTaxCashflow)}/yr**)—the model applies tax on taxable property income (**~${formatAud(-lift)}/yr** drag vs pre-tax on these numbers).`
          : lift > 1
            ? `**After-tax** (**${formatAud(r.afterTaxCashflow)}/yr**) **improves on pre-tax** (**${formatAud(r.preTaxCashflow)}/yr**) via deductions in this stub (**~${formatAud(lift)}/yr**).`
            : `**After-tax** (**${formatAud(r.afterTaxCashflow)}/yr**) **is close to pre-tax** (**${formatAud(r.preTaxCashflow)}/yr**) on these inputs.`
        : `**After-tax** (**${formatAud(r.afterTaxCashflow)}/yr**) **still underwater** versus pre-tax (**${formatAud(r.preTaxCashflow)}/yr**); **tax helps but does not fix** a weak rental stack on these numbers.`,
  ];
}

export function whatNeedsImprovementBullets(
  r: PropertyAnalysisResult
): string[] {
  const dx = r.diagnostics;
  const w = r.weeklyRent;
  const fmtW = (n: number) => fmtInline(n);

  const preBe = dx.breakEvenWeeklyPreTax;
  const postBe = dx.breakEvenWeeklyAfterTax;

  let priceLine: string;
  if (dx.priceForZeroNote) {
    priceLine = `**Break-even purchase price (pre-tax):** **n/a** — ${dx.priceForZeroNote}`;
  } else if (dx.priceForZeroPreTaxCashflow !== null) {
    priceLine = `**Break-even purchase price (pre-tax, at this rent):** **~${formatAud(dx.priceForZeroPreTaxCashflow)}** vs **${formatAud(r.purchasePrice)}** paid.`;
  } else {
    priceLine = `**Break-even purchase price:** unavailable—check interest rate and deposit.`;
  }

  let note: string;
  if (r.afterTaxCashflow < 0 && r.score < DEAL_SCORE_AMBER_MIN) {
    note = `**Still weak after tax**—negative carry and a low score mean deductions are not enough; re-price or step away.`;
  } else if (r.afterTaxCashflow < 0) {
    note = `**After-tax still red**—tax **helps** but **does not clear** the model; **lift rent or cut entry** to improve both cash and score.`;
  } else if (r.preTaxCashflow < 0 && r.afterTaxCashflow >= 0) {
    note = `**Tax bridges the gap** to positive annual cash—**watch pre-tax liquidity** if rates or rents move against you.`;
  } else if (!dx.isStrong) {
    note = `**Target upper band (≥${DEAL_SCORE_GREEN_MIN}):** ~**${dx.targetYieldPercentForBuy?.toFixed(2) ?? "—"}%** yield (**~${fmtW(dx.targetWeeklyForBuy ?? w)}/week** at this price), other inputs held.`;
  } else {
    note = `**Strong profile at present**—hold discipline on rent, operating costs, and debt so after-tax headroom survives stress.`;
  }

  return [
    `**Required weekly rent (pre-tax break-even):** **~${fmtW(preBe)}** (you: **${fmtW(w)}**).`,
    `**Required weekly rent (after-tax break-even, model):** **~${fmtW(postBe)}**—marginal **${(r.marginalRate * 100).toFixed(0)}%** and **estimated depreciation**.`,
    priceLine,
    note,
  ];
}
