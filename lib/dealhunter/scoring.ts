/**
 * deal_score_v1 — deterministic, versioned sub-indices for the Deal Hunter (V7B).
 * Reuses the tested opportunity sub-indices (growth/yield/demand) so suburb-fit maths
 * is never re-implemented. Every index is 0..100; hard gates live in ranking.ts and
 * are applied BEFORE any weighting, so a strong score can never hide a gate failure.
 */
import { clamp, lerp, growthIndex, yieldIndex, demandIndex } from "@/lib/opportunity/scoring";
import type { RiskTolerance } from "@/lib/opportunity/types";
import type { DealSubScores } from "./types";

export const DEAL_SCORE_VERSION = "deal_score_v1";

export const DEAL_STRONG_MIN = 70;
export const DEAL_MODERATE_MIN = 45;

/** Max LVR modelled by risk appetite (used for the deposit hard gate + resilience). */
export function maxLvrFor(risk: RiskTolerance): number {
  return risk === "low" ? 0.8 : risk === "high" ? 0.9 : 0.88;
}

/** Affordability: headroom under the budget ceiling. price null → neutral (un-gated). */
export function affordabilityIndex(effectivePrice: number | null, maxPrice: number): number {
  if (effectivePrice == null || maxPrice <= 0) return 50;
  const headroom = (maxPrice - effectivePrice) / maxPrice; // >0 = under budget
  return clamp(lerp(headroom, -0.1, 0, 0.3, 100));
}

/** Cash-flow: positive → 100; within holding budget scales down as it approaches the limit. */
export function cashflowIndex(weeklyPreTaxCashflow: number | null, acceptableWeeklyHoldingCost: number): number {
  if (weeklyPreTaxCashflow == null) return 50;
  if (weeklyPreTaxCashflow >= 0) return 100;
  const outOfPocket = -weeklyPreTaxCashflow;
  if (acceptableWeeklyHoldingCost <= 0) return outOfPocket <= 0 ? 100 : 0;
  const ratio = outOfPocket / acceptableWeeklyHoldingCost; // 0 = free, 1 = at limit
  return clamp(lerp(ratio, 0, 90, 1, 20));
}

/** Yield index reuses the opportunity yield curve; null yield → neutral-low. */
export function dealYieldIndex(grossYieldPct: number | null): number {
  return grossYieldPct == null ? 40 : yieldIndex(grossYieldPct);
}

/** Suburb fit blends growth/demand/yield by the buy box's growth↔yield lean. */
export function suburbFitIndex(
  ev: { growth: number | null; demand: number | null; grossYield: number | null },
  growthVsYield: number,
): number {
  const g = ev.growth == null ? 40 : growthIndex(ev.growth);
  const d = ev.demand == null ? 40 : demandIndex(ev.demand);
  const y = ev.grossYield == null ? 40 : yieldIndex(ev.grossYield);
  // growthVsYield in [-1,1]: +1 favours growth, -1 favours yield; demand always contributes.
  const wGrowth = 0.34 + 0.16 * growthVsYield;
  const wYield = 0.34 - 0.16 * growthVsYield;
  const wDemand = 0.32;
  return clamp(wGrowth * g + wYield * y + wDemand * d);
}

/** Property fit vs preferences. Bedrooms/land unset → neutral; explicit prefs move it. */
export function propertyFitIndex(params: {
  bedrooms: number | null;
  minBedrooms: number | null;
  landAreaSqm: number | null;
  landPreference: "prefer_land" | "indifferent";
}): number {
  let score = 60; // neutral baseline when no preferences bite
  if (params.minBedrooms != null && params.bedrooms != null) {
    score += params.bedrooms >= params.minBedrooms ? 20 : -30;
  }
  if (params.landPreference === "prefer_land") {
    if (params.landAreaSqm == null) score -= 5;
    else score += params.landAreaSqm >= 500 ? 20 : params.landAreaSqm >= 300 ? 10 : 0;
  }
  return clamp(score);
}

/** Downside resilience: cash-flow buffer + data confidence + price disclosed. */
export function downsideResilienceIndex(params: {
  weeklyPreTaxCashflow: number | null;
  acceptableWeeklyHoldingCost: number;
  confidence: number; // 0..1
  priceUndisclosed: boolean;
}): number {
  let score = 40 + 40 * clamp(params.confidence, 0, 1);
  if (params.weeklyPreTaxCashflow != null) {
    if (params.weeklyPreTaxCashflow >= 0) score += 20;
    else if (-params.weeklyPreTaxCashflow > params.acceptableWeeklyHoldingCost * 0.8) score -= 20;
  }
  if (params.priceUndisclosed) score -= 15;
  return clamp(score);
}

/** Evidence completeness: fraction of mandatory metrics present and fresh. */
export function evidenceCompletenessIndex(presentFreshCount: number, totalMandatory: number): number {
  if (totalMandatory <= 0) return 0;
  return clamp((presentFreshCount / totalMandatory) * 100);
}

/** Strategy-weighted total. Weights sum to 1; growth↔yield shifts suburb/yield emphasis. */
export function dealScoreV1(sub: DealSubScores, growthVsYield: number): number {
  const w = {
    affordability: 0.2,
    cashflow: 0.18,
    yield: 0.12 - 0.04 * growthVsYield,
    suburbFit: 0.2 + 0.04 * growthVsYield,
    propertyFit: 0.1,
    downsideResilience: 0.12,
    evidenceCompleteness: 0.08,
  };
  const total =
    w.affordability * sub.affordability +
    w.cashflow * sub.cashflow +
    w.yield * sub.yield +
    w.suburbFit * sub.suburbFit +
    w.propertyFit * sub.propertyFit +
    w.downsideResilience * sub.downsideResilience +
    w.evidenceCompleteness * sub.evidenceCompleteness;
  return Math.round(clamp(total) * 10) / 10;
}

export function dealBand(score: number): "strong" | "moderate" | "weak" {
  return score >= DEAL_STRONG_MIN ? "strong" : score >= DEAL_MODERATE_MIN ? "moderate" : "weak";
}
