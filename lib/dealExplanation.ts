/**
 * Deal explanation — structured for a future LLM/API backend.
 *
 * Contract: POST body matches {@link DealExplanationInput}; response should be
 * `{ "bullets": string[] }` (max 3 lines, Australian property investor tone).
 */

import { formatAud } from "@/lib/formatCurrency";
import { DEAL_SCORE_AMBER_MIN, DEAL_SCORE_GREEN_MIN } from "@/lib/propertyAnalysis";

export type DealExplanationInput = {
  yieldPercent: number;
  preTaxCashflow: number;
  afterTaxCashflow: number;
  score: number;
  suburb: string | null;
  suburbGrowthPercent: number;
  vacancyPercent: number;
  totalDepreciation: number;
  taxBenefit: number;
};

/**
 * Local stand-in for AI — rule-based, same shape as a future API.
 * Max **3** bullets; confident Australian analyst tone.
 */
export function generateDealExplanationLocal(
  input: DealExplanationInput
): string[] {
  const {
    yieldPercent,
    preTaxCashflow,
    afterTaxCashflow,
    score,
    suburb,
    suburbGrowthPercent,
    vacancyPercent,
    totalDepreciation,
    taxBenefit,
  } = input;

  const place =
    suburb && suburb.trim().length > 0 ? suburb.trim() : "This location";
  const y = yieldPercent.toFixed(2);
  const g = suburbGrowthPercent.toFixed(1);
  const v = vacancyPercent.toFixed(1);
  const band =
    score >= DEAL_SCORE_GREEN_MIN
      ? "strong"
      : score >= DEAL_SCORE_AMBER_MIN
        ? "borderline"
        : "weak";

  const growthTone =
    suburbGrowthPercent >= 6
      ? "**strong growth narrative**—but price that into entry, not hope."
      : suburbGrowthPercent >= 4
        ? "**balanced growth**—neither a headwind nor a free option."
        : "**muted growth**—income and tax offsets must do more work.";

  const vacTone =
    vacancyPercent <= 2
      ? "**tight rental market** on these inputs."
      : vacancyPercent <= 4
        ? "**workable vacancy**—still watch letting risk."
        : "**looser vacancy**—prioritise yield and tenant quality.";

  const bullet1 = `**${place} — ${band} profile (score ${score}).** **${y}%** gross yield with **${g}%** p.a. growth and **${v}%** vacancy: ${growthTone} ${vacTone}`;

  const bullet2 = `**Cashflow:** **${formatAud(preTaxCashflow)}/yr** pre-tax vs **${formatAud(afterTaxCashflow)}/yr** after-tax in the model—**~${formatAud(totalDepreciation)}/yr** depreciation (estimate only); **~${formatAud(taxBenefit)}/yr** signed tax cashflow effect at this bracket (negative = extra tax on taxable property income).`;

  let bullet3: string;
  if (score >= DEAL_SCORE_GREEN_MIN) {
    bullet3 = `**Assessment:** The **after-tax stack sits in the upper model band**—stress-test rates and rent, and avoid relying on paper losses to rescue a thin yield.`;
  } else if (score >= DEAL_SCORE_AMBER_MIN) {
    bullet3 = `**Assessment:** The file is **borderline**—growth or tax does not yet justify full conviction; wait for a cleaner line on rent or entry price.`;
  } else {
    bullet3 = `**Assessment:** The profile remains **weak**; even with negative gearing optics, risk-adjusted economics look thin relative to alternative uses of capital.`;
  }

  return [bullet1, bullet2, bullet3];
}

export async function generateDealExplanation(
  input: DealExplanationInput
): Promise<string[]> {
  return generateDealExplanationLocal(input);
}
