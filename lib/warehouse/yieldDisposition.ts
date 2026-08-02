/**
 * Quality-gate rules for materialising a suburb gross yield from an existing
 * price+rent candidate. This is the canonical TypeScript encoding of the exact
 * rules the DuckDB pipeline applies in SQL
 * (warehouse/scripts/coverage/materialise_nsw_yield.mjs) — kept in lockstep so
 * the gates are unit-tested. Thresholds are NEVER lowered to inflate coverage.
 */

export const ACCEPTED_SAMPLE_TIERS = ["medium", "high"] as const; // ≥ registry minSample 10
export const MAX_PERIOD_GAP_DAYS = 400; // annual rent vs trailing-12m sales window

export type YieldCandidate = {
  median_sale_price_12m: number | null;
  median_weekly_rent_latest: number | null;
  latest_sales_period: string | null;
  latest_rent_period: string | null;
  sales_sample_confidence: string | null;
  rent_confidence: string | null;
  direct_or_derived: string | null;
};

export type YieldDisposition =
  | "materialised"
  | "invalid_value"
  | "context_only"
  | "incompatible_period"
  | "insufficient_sample";

function gapDays(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

/** Single primary disposition for one candidate (order matters — first failing gate wins). */
export function classifyYieldCandidate(c: YieldCandidate): YieldDisposition {
  if (c.median_sale_price_12m == null || c.median_sale_price_12m <= 0 || c.median_weekly_rent_latest == null || c.median_weekly_rent_latest <= 0) {
    return "invalid_value";
  }
  if (c.direct_or_derived !== "direct") return "context_only";
  if (c.latest_sales_period && c.latest_rent_period && gapDays(c.latest_sales_period, c.latest_rent_period) > MAX_PERIOD_GAP_DAYS) {
    return "incompatible_period";
  }
  const tiers: readonly string[] = ACCEPTED_SAMPLE_TIERS;
  if (!tiers.includes(c.sales_sample_confidence ?? "") || !tiers.includes(c.rent_confidence ?? "")) {
    return "insufficient_sample";
  }
  return "materialised";
}

/** Gross yield for a materialised candidate (caller must have classified it first). */
export function computeCandidateYield(c: YieldCandidate): number {
  return Number(((c.median_weekly_rent_latest! * 52) / c.median_sale_price_12m!) * 100).valueOf();
}
