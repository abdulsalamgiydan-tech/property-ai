/** How the deal score blends growth, cashflow, risk, and yield — does not change financial maths. */

export type InvestmentStrategyId = "growth" | "balanced" | "yield";

export type StrategyWeights = {
  capitalGrowth: number;
  afterTaxCashflow: number;
  risk: number;
  rentalYield: number;
};

export type InvestmentStrategyConfig = {
  id: InvestmentStrategyId;
  /** Short label for UI (e.g. results line). */
  label: string;
  weights: StrategyWeights;
  /** Copy shown under the score breakdown for this strategy. */
  scoreBreakdownNote: string;
};

export const INVESTMENT_STRATEGIES: Record<
  InvestmentStrategyId,
  InvestmentStrategyConfig
> = {
  growth: {
    id: "growth",
    label: "Growth",
    weights: {
      capitalGrowth: 40,
      afterTaxCashflow: 30,
      risk: 20,
      rentalYield: 10,
    },
    scoreBreakdownNote:
      "Weights favour long-term capital growth over rental yield. Sub-indices are 0–100 before blending; dollar amounts in the snapshot are unchanged.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    weights: {
      capitalGrowth: 30,
      afterTaxCashflow: 30,
      risk: 20,
      rentalYield: 20,
    },
    scoreBreakdownNote:
      "Weights balance growth, holding cost, and income more evenly. Sub-indices are 0–100 before blending; dollar amounts in the snapshot are unchanged.",
  },
  yield: {
    id: "yield",
    label: "Yield",
    weights: {
      capitalGrowth: 20,
      afterTaxCashflow: 35,
      risk: 20,
      rentalYield: 25,
    },
    scoreBreakdownNote:
      "Weights lean toward rental return and after-tax holding performance. Sub-indices are 0–100 before blending; dollar amounts in the snapshot are unchanged.",
  },
};

export const DEFAULT_INVESTMENT_STRATEGY: InvestmentStrategyId = "growth";

export function getInvestmentStrategy(
  id: InvestmentStrategyId
): InvestmentStrategyConfig {
  return INVESTMENT_STRATEGIES[id];
}

/** Weighted deal score 0–100 from normalised components (each 0–100). */
export function combineStrategyWeightedScore(
  weights: StrategyWeights,
  normYield: number,
  normAfterTaxCashflow: number,
  normGrowth: number,
  normRisk: number
): number {
  const { capitalGrowth, afterTaxCashflow, risk, rentalYield } = weights;
  return Math.round(
    (capitalGrowth / 100) * normGrowth +
      (afterTaxCashflow / 100) * normAfterTaxCashflow +
      (risk / 100) * normRisk +
      (rentalYield / 100) * normYield
  );
}
