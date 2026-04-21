import type { PropertyAnalysisResult } from "@/lib/propertyAnalysis";
import { formatAud, formatPercent } from "@/lib/formatCurrency";

/**
 * Up to three bullets: income position, holding/tax, growth vs risk.
 * Calm, investor-focused; no recommendation language.
 */
export function whatDealLooksLikeBullets(r: PropertyAnalysisResult): string[] {
  const s = r.strategy;
  const bullets: string[] = [];
  const y = r.grossYieldPercent;

  if (y < 3.5) {
    if (s === "yield") {
      bullets.push(
        `Gross yield is ${formatPercent(y, 2)} — thin for an income-led read; rental income is not carrying much of the return at this price.`
      );
    } else if (s === "growth") {
      bullets.push(
        `Gross yield is ${formatPercent(y, 2)} — light on rent versus price, which is more common when you are backing meaningful long-term growth (still stress-test costs and rates).`
      );
    } else {
      bullets.push(
        `Gross yield is ${formatPercent(y, 2)} — income is modest relative to price, so growth and cost assumptions both need to stack up.`
      );
    }
  } else if (y < 5) {
    bullets.push(
      `Gross yield is ${formatPercent(y, 2)} — rental income is in a middle band; finance and running costs still decide how comfortable the hold feels.`
    );
  } else {
    bullets.push(
      `Gross yield is ${formatPercent(y, 2)} — rent is doing more of the work before growth is counted.`
    );
  }

  if (r.preTaxCashflow >= 0) {
    bullets.push(
      `After interest and operating costs, pre-tax cashflow is about ${formatAud(r.preTaxCashflow)} for the year — you are not depending on tax alone to fund the property.`
    );
  } else if (r.afterTaxCashflow >= 0) {
    bullets.push(
      `Pre-tax cashflow is negative, but estimated tax outcomes lift the year to roughly ${formatAud(r.afterTaxCashflow)} after tax — day-to-day liquidity can still feel tight if rates or rents move the wrong way.`
    );
  } else {
    bullets.push(
      `Pre- and after-tax cashflow are both negative on these inputs — the property draws cash in year one unless rent, costs, or debt change.`
    );
  }

  const g = r.suburbGrowthPercent;
  const v = r.vacancyPercent;
  if (g >= 5.5) {
    bullets.push(
      `Long-range projections use ${formatPercent(g, 1)} p.a. capital growth — an editable assumption, not something the model guarantees; softer markets would narrow the margin for error.`
    );
  } else if (g <= 3) {
    bullets.push(
      `Capital growth is set at a subdued ${formatPercent(g, 1)} p.a. — equity builds slowly, so rental strength and your ${formatPercent(v, 1)} vacancy assumption matter more to how the deal feels.`
    );
  } else {
    bullets.push(
      `Capital growth is ${formatPercent(g, 1)} p.a. and vacancy ${formatPercent(v, 1)} — both are editable; together they set how optimistic the long-term picture is.`
    );
  }

  return bullets.slice(0, 3);
}

export function keyRiskBullets(r: PropertyAnalysisResult): string[] {
  const risks: string[] = [];

  if (r.grossYieldPercent < 4 && r.suburbGrowthPercent >= 4.5) {
    risks.push(
      "Yield is modest relative to the purchase price — the deal leans more on capital growth than rental income."
    );
  } else if (r.grossYieldPercent < 4) {
    risks.push(
      "Gross yield is low versus price — small shifts in rent, rates, or running costs move the numbers quickly."
    );
  }

  if (r.netYieldPercent < 2 && r.grossYieldPercent >= 4) {
    risks.push(
      "Operating costs absorb a large share of rent — expense creep would hit net cashflow faster than gross rent suggests."
    );
  }

  if (r.suburbGrowthPercent >= 5.5) {
    risks.push(
      "The long-term case depends on a strong growth assumption — it may not hold in flatter market conditions."
    );
  }

  if (r.interestRatePercent >= 6) {
    risks.push(
      "Interest is set at a firm level — after-tax cashflow may still feel tight if refinancing lands higher than modelled."
    );
  }

  if (r.preTaxCashflow < 0 && r.afterTaxCashflow > r.preTaxCashflow + 500) {
    risks.push(
      "After-tax cashflow improves the position, but the deal may still feel tight on pre-tax liquidity if rates stay elevated."
    );
  }

  if (r.vacancyPercent < 1.5) {
    risks.push("Vacancy is modelled very low — even short voids change effective rent.");
  }

  if (risks.length === 0) {
    risks.push(
      "Nothing obvious jumps out as a single red flag on these inputs — still stress-test rates, rent, and growth to match your comfort."
    );
  }

  risks.push(
    "Tax and depreciation here are illustrative only — confirm with a qualified tax adviser and quantity surveyor."
  );

  return risks.slice(0, 6);
}

/** Deposit % that would give ~zero pre-tax cashflow at same rent, rate, expenses (illustrative). */
export function neutralPreTaxDepositPercent(
  r: PropertyAnalysisResult
): number | null {
  const rate = r.interestRatePercent / 100;
  if (rate <= 1e-9) return null;
  const net = r.effectiveAnnualRent - r.effectiveAnnualExpenses;
  if (net <= 0) return null;
  const loanNeeded = net / rate;
  if (!Number.isFinite(loanNeeded) || loanNeeded <= 0) return null;
  if (loanNeeded >= r.purchasePrice) return null;
  const dep = 100 * (1 - loanNeeded / r.purchasePrice);
  if (dep < 0 || dep > 100) return null;
  return dep;
}

/** Interest rate % that would give ~zero pre-tax cashflow at same loan and cashflows (illustrative). */
export function neutralPreTaxInterestRatePercent(
  r: PropertyAnalysisResult
): number | null {
  if (r.loan <= 1e-6) return null;
  const net = r.effectiveAnnualRent - r.effectiveAnnualExpenses;
  if (net <= 0) return null;
  return (net / r.loan) * 100;
}
