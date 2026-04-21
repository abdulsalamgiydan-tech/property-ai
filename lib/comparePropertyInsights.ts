import { INVESTMENT_STRATEGIES, type InvestmentStrategyId } from "@/lib/investmentStrategy";
import type { PropertyAnalysisResult } from "@/lib/propertyAnalysis";

export type CategoryWinner = "a" | "b" | "draw";

export type ComparisonCategory = {
  id: string;
  label: string;
  winner: CategoryWinner;
};

function nearlyEqual(a: number, b: number, eps: number): boolean {
  return Math.abs(a - b) <= eps;
}

function winnerByHigher(a: number, b: number, eps: number): CategoryWinner {
  if (nearlyEqual(a, b, eps)) return "draw";
  return a > b ? "a" : "b";
}

function winnerByLower(a: number, b: number, eps: number): CategoryWinner {
  if (nearlyEqual(a, b, eps)) return "draw";
  return a < b ? "a" : "b";
}

export function buildComparisonCategories(
  ra: PropertyAnalysisResult,
  rb: PropertyAnalysisResult
): ComparisonCategory[] {
  return [
    {
      id: "yield",
      label: "Better yield",
      winner: winnerByHigher(ra.grossYieldPercent, rb.grossYieldPercent, 0.02),
    },
    {
      id: "afterTaxCf",
      label: "Better after-tax cashflow",
      winner: winnerByHigher(ra.afterTaxCashflow, rb.afterTaxCashflow, 50),
    },
    {
      id: "risk",
      label: "Lower holding risk",
      winner: winnerByHigher(ra.normRisk, rb.normRisk, 0.5),
    },
    {
      id: "growth",
      label: "Higher growth outlook",
      winner: winnerByHigher(ra.suburbGrowthPercent, rb.suburbGrowthPercent, 0.05),
    },
    {
      id: "upfront",
      label: "Lower upfront cash required",
      winner: winnerByLower(ra.totalCashRequired, rb.totalCashRequired, 100),
    },
    {
      id: "score",
      label: "Stronger overall score",
      winner: winnerByHigher(ra.score, rb.score, 0.5),
    },
  ];
}

function labelFor(w: CategoryWinner, aName: string, bName: string): string {
  if (w === "draw") return "Draw";
  return w === "a" ? aName : bName;
}

export function buildComparisonInsightBullets(
  ra: PropertyAnalysisResult,
  rb: PropertyAnalysisResult,
  strategy: InvestmentStrategyId
): string[] {
  const a = "Property A";
  const b = "Property B";
  const bullets: string[] = [];
  const strat = INVESTMENT_STRATEGIES[strategy].label;

  const cfDiff = ra.afterTaxCashflow - rb.afterTaxCashflow;
  if (Math.abs(cfDiff) < 200) {
    bullets.push(
      `${a} and ${b} sit close on modelled year-one after-tax cashflow — small input changes could swing the picture.`
    );
  } else if (cfDiff > 0) {
    bullets.push(
      `${a} appears stronger on year-one after-tax cashflow in this model, before any personal tax nuances.`
    );
  } else {
    bullets.push(
      `${b} appears stronger on year-one after-tax cashflow in this model, before any personal tax nuances.`
    );
  }

  const gDiff = ra.suburbGrowthPercent - rb.suburbGrowthPercent;
  if (Math.abs(gDiff) < 0.15) {
    bullets.push(
      "Capital growth assumptions are similar — neither side is leaning heavily on a higher long-term growth story in this comparison."
    );
  } else if (gDiff > 0) {
    bullets.push(
      `${a} is more reliant on the capital growth assumption you entered; ${b} is comparatively less growth-weighted at the same salary and finance settings.`
    );
  } else {
    bullets.push(
      `${b} is more reliant on the capital growth assumption you entered; ${a} is comparatively less growth-weighted at the same salary and finance settings.`
    );
  }

  const upDiff = ra.totalCashRequired - rb.totalCashRequired;
  if (Math.abs(upDiff) < 500) {
    bullets.push("Upfront cash required is in the same ballpark once deposit, duty and allowances are included.");
  } else if (upDiff > 0) {
    bullets.push(
      `${a} requires more upfront cash in this illustration; ${b} leaves a little more liquidity at settlement on these inputs.`
    );
  } else {
    bullets.push(
      `${b} requires more upfront cash in this illustration; ${a} leaves a little more liquidity at settlement on these inputs.`
    );
  }

  const scDiff = ra.score - rb.score;
  if (Math.abs(scDiff) < 3) {
    bullets.push(
      `Under the ${strat} strategy weighting, overall scores are tight — the trade-off is more about what you emphasise (income vs growth vs equity buffer) than a single clear leader.`
    );
  } else if (scDiff > 0) {
    bullets.push(
      `Under the ${strat} strategy weighting, ${a} shows the higher blended score — ${b} may still suit if your priorities lean away from what that weighting rewards.`
    );
  } else {
    bullets.push(
      `Under the ${strat} strategy weighting, ${b} shows the higher blended score — ${a} may still suit if your priorities lean away from what that weighting rewards.`
    );
  }

  const yDiff = ra.grossYieldPercent - rb.grossYieldPercent;
  if (Math.abs(yDiff) >= 0.35) {
    if (yDiff > 0) {
      bullets.push(`${a} carries the higher gross yield on the purchase prices entered; ${b} is comparatively more yield-light at this rent level.`);
    } else {
      bullets.push(`${b} carries the higher gross yield on the purchase prices entered; ${a} is comparatively more yield-light at this rent level.`);
    }
  }

  return bullets.slice(0, 5);
}

export function buildWhatWouldChangeBullets(
  ra: PropertyAnalysisResult,
  rb: PropertyAnalysisResult,
  strategy: InvestmentStrategyId
): string[] {
  const a = "Property A";
  const b = "Property B";
  const strat = INVESTMENT_STRATEGIES[strategy].label;
  const out: string[] = [];

  const priceGap = ra.purchasePrice - rb.purchasePrice;
  if (Math.abs(priceGap) > 25_000) {
    if (priceGap > 0) {
      out.push(
        `If ${a} had a lower purchase price, yield and upfront cash would both ease — the gap to ${b} on those measures would narrow.`
      );
    } else {
      out.push(
        `If ${b} had a lower purchase price, yield and upfront cash would both ease — the gap to ${a} on those measures would narrow.`
      );
    }
  }

  const rentGap = ra.weeklyRent * 52 - rb.weeklyRent * 52;
  if (Math.abs(rentGap) > 1_500) {
    if (rentGap < 0) {
      out.push(
        `If ${a} achieved higher gross rent, its holding position and yield would improve — useful if ${b} currently looks stronger on income.`
      );
    } else {
      out.push(
        `If ${b} achieved higher gross rent, its holding position and yield would improve — useful if ${a} currently looks stronger on income.`
      );
    }
  }

  const growthGap = ra.suburbGrowthPercent - rb.suburbGrowthPercent;
  if (Math.abs(growthGap) >= 0.25) {
    out.push(
      "Shifting the suburb growth assumption on either side would change long-term equity charts — it does not alter year-one cashflow, but it does change how the story looks over decades."
    );
  }

  out.push(
    `If you prioritise yield over growth, switching toward the Yield strategy may tilt the score toward the property with stronger rent relative to price; Growth does the opposite for higher assumed appreciation. You are on ${strat} today.`
  );

  return out.slice(0, 4);
}

export function categoryWinnerLabel(
  w: CategoryWinner,
  aLabel: string = "Property A",
  bLabel: string = "Property B"
): string {
  return labelFor(w, aLabel, bLabel);
}
