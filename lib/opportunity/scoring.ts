/**
 * Pure scoring functions for opportunity_score_v1.
 * Numbers here MUST match docs/scoring/opportunity_score_v1.md — the spec is
 * the contract and the tests assert this module against it.
 *
 * This is a NEW suburb-level score, separate from the per-deal
 * combineDealModelScore in lib/propertyAnalysis.ts (unchanged).
 */
import type { ConfidenceBand, OpportunityBand, Strategy } from "./types";

export const OPPORTUNITY_SCORE_VERSION = "opportunity_score_v1";

export function clamp(x: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Linear interpolation between (x0,y0)-(x1,y1), result clamped to [0,100]. */
export function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return clamp(y0);
  return clamp(y0 + ((y1 - y0) * (x - x0)) / (x1 - x0));
}

/** Signed 12-month price growth (%) → 0–100. Spec §2. */
export function growthIndex(g: number): number {
  if (g <= -5) return 0;
  if (g < 0) return lerp(g, -5, 0, 0, 30);
  if (g < 5) return lerp(g, 0, 30, 5, 60);
  if (g < 12) return lerp(g, 5, 60, 12, 90);
  if (g < 20) return lerp(g, 12, 90, 20, 100);
  return 100;
}

/** Gross yield (%) → 0–100. Spec §2. */
export function yieldIndex(y: number): number {
  if (y <= 2.5) return 0;
  if (y < 3.5) return lerp(y, 2.5, 0, 3.5, 45);
  if (y < 5.0) return lerp(y, 3.5, 45, 5.0, 80);
  if (y < 6.5) return lerp(y, 5.0, 80, 6.5, 100);
  return 100;
}

/** Sales volume (12m count) → 0–100. Spec §2. */
export function demandIndex(v: number): number {
  if (v <= 5) return 0;
  if (v < 15) return lerp(v, 5, 0, 15, 50);
  if (v < 40) return lerp(v, 15, 50, 40, 85);
  if (v < 80) return lerp(v, 40, 85, 80, 100);
  return 100;
}

/** Strategy weights over the three opportunity sub-indices (sum = 100). Spec §3. */
export const OPPORTUNITY_WEIGHTS: Record<Strategy, { growth: number; demand: number; yield: number }> = {
  growth: { growth: 60, demand: 25, yield: 15 },
  balanced: { growth: 40, demand: 25, yield: 35 },
  yield: { growth: 20, demand: 20, yield: 60 },
};

export interface SubIndices {
  growth: number;
  demand: number;
  yield: number;
}

/** Weighted, integer 0–100. No renormalisation — all three dims are mandatory. Spec §3. */
export function opportunityScoreV1(sub: SubIndices, strategy: Strategy): number {
  const w = OPPORTUNITY_WEIGHTS[strategy];
  return Math.round((w.growth / 100) * sub.growth + (w.demand / 100) * sub.demand + (w.yield / 100) * sub.yield);
}

export const OPPORTUNITY_STRONG_MIN = 70;
export const OPPORTUNITY_MODERATE_MIN = 45;
export function opportunityBand(score: number): OpportunityBand {
  if (score >= OPPORTUNITY_STRONG_MIN) return "strong";
  if (score >= OPPORTUNITY_MODERATE_MIN) return "moderate";
  return "weak";
}

/** Data confidence — a SEPARATE axis. Spec §6. Never folded into opportunity. */
export interface ConfidenceInput {
  /** One flag per mandatory metric currently in the soft-stale window (400–540d). */
  softStaleCount: number;
  salesVolumeSample: number | null;
  grossYieldSample: number | null;
  hasSupplyEvidence: boolean;
  hasDemographicEvidence: boolean;
}

export function dataConfidence(input: ConfidenceInput): number {
  let c = 100;
  c -= 15 * Math.max(0, input.softStaleCount);
  if (input.salesVolumeSample != null) {
    if (input.salesVolumeSample < 10) c -= 10;
    if (input.salesVolumeSample < 5) c -= 10;
  }
  if (input.grossYieldSample != null && input.grossYieldSample < 10) c -= 10;
  if (!input.hasSupplyEvidence) c -= 10;
  if (!input.hasDemographicEvidence) c -= 10;
  return clamp(c, 0, 100);
}

export function confidenceBand(c: number): ConfidenceBand {
  if (c >= 75) return "high";
  if (c >= 50) return "medium";
  if (c >= 30) return "low";
  return "insufficient";
}

/** Affordability fit 0–100 — a SEPARATE axis (secondary sort only). Spec §7. */
export function affordabilityFit(medianPrice: number, maxPrice: number, depositPct: number): number {
  const headroom = maxPrice > 0 ? clamp01((maxPrice - medianPrice) / maxPrice) : 0;
  const depositComfort = clamp01((depositPct - 5) / 15);
  return Math.round(100 * (0.5 * headroom + 0.5 * depositComfort));
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
