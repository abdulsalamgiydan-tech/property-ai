import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Entitlement/tier architecture (Sprint 13 WS11). Schema and feature
 * architecture ONLY — no tier is currently required to use any feature
 * in the product (every route today is still gated purely by the
 * existing sign-in/preview-flag model, unchanged by this file). This
 * exists so a future sprint can wire real gates onto it without a
 * schema migration, per the guardrail against activating billing here.
 */

export type Tier = "free" | "research" | "investor_pro" | "professional";

export type Feature =
  | "deal_analysis"
  | "watchlist"
  | "portfolio"
  | "research_preview"
  | "multi_state_research"
  | "scenario_lab"
  | "saved_scenarios"
  | "public_api_v1"
  | "export_reports";

const TIER_ORDER: Tier[] = ["free", "research", "investor_pro", "professional"];

/**
 * Which tier first unlocks a feature — every higher tier also includes
 * everything a lower tier has (see hasEntitlement). This is a proposed
 * structure, not an enforced one: today, every feature listed here is
 * actually available to every signed-in user regardless of tier, gated
 * only by the existing WAREHOUSE_PREVIEW_ENABLED-style environment flags.
 */
const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  deal_analysis: "free",
  watchlist: "free",
  portfolio: "free",
  research_preview: "free",
  multi_state_research: "research",
  scenario_lab: "research",
  saved_scenarios: "research",
  public_api_v1: "investor_pro",
  export_reports: "investor_pro",
};

export function hasEntitlement(tier: Tier, feature: Feature): boolean {
  const tierRank = TIER_ORDER.indexOf(tier);
  const requiredRank = TIER_ORDER.indexOf(FEATURE_MIN_TIER[feature]);
  return tierRank >= requiredRank;
}

/**
 * Looks up a user's tier from public.user_entitlements. Absence of a row
 * means 'free' — this is the ONLY place that decides that default, so a
 * caller can never accidentally treat a missing row as a higher tier.
 * Never trust a tier value from anywhere other than this lookup (e.g.
 * never accept a tier as a client-supplied request parameter).
 */
export async function getUserTier(
  supabase: SupabaseClient,
  userId: string
): Promise<Tier> {
  const { data, error } = await supabase
    .from("user_entitlements")
    .select("tier")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return "free";
  const tier = data.tier as string;
  return (TIER_ORDER as string[]).includes(tier) ? (tier as Tier) : "free";
}
