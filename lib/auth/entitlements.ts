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
 * everything a lower tier has (see hasEntitlement). Sprint 14 WS12
 * correction: `saved_scenarios` was previously listed as "research" here,
 * but the actual live Scenario Lab save feature (built in Sprint 13) has
 * always been available to every signed-in user — that line was
 * aspirational, never enforced, and contradicted live behaviour. Fixed to
 * "free" to match reality; the tier-aware control for saved scenarios is
 * now a *volume* limit (see FEATURE_LIMITS below), not an on/off gate —
 * "every existing feature stays available at free tier" per this sprint's
 * guardrail, just with a real, generous cap once actually enforced.
 */
const FEATURE_MIN_TIER: Record<Feature, Tier> = {
  deal_analysis: "free",
  watchlist: "free",
  portfolio: "free",
  research_preview: "free",
  multi_state_research: "research",
  scenario_lab: "research",
  saved_scenarios: "free",
  public_api_v1: "investor_pro",
  export_reports: "investor_pro",
};

export function hasEntitlement(tier: Tier, feature: Feature): boolean {
  const tierRank = TIER_ORDER.indexOf(tier);
  const requiredRank = TIER_ORDER.indexOf(FEATURE_MIN_TIER[feature]);
  return tierRank >= requiredRank;
}

/**
 * Volume caps (Sprint 14 WS12) — the actual enforcement mechanism for
 * "subscription-ready" limits on features every tier can use. `null`
 * means unlimited. Mirrored exactly in migration 041's
 * enforce_scenario_lab_case_limit() trigger function (the source of
 * truth for actual enforcement, since that runs at the database level
 * and can't be bypassed by any client) — this TypeScript copy exists so
 * the UI can show "8/10 saved" and a clear upgrade prompt *before* a
 * user hits the database's hard limit, not to duplicate the enforcement
 * itself. If these two ever drift, the database trigger wins.
 */
export type LimitedFeature = "saved_scenarios";

export const FEATURE_LIMITS: Record<LimitedFeature, Record<Tier, number | null>> = {
  saved_scenarios: { free: 10, research: 25, investor_pro: 100, professional: null },
};

export function getFeatureLimit(tier: Tier, feature: LimitedFeature): number | null {
  return FEATURE_LIMITS[feature][tier];
}

export function hasReachedLimit(tier: Tier, feature: LimitedFeature, currentCount: number): boolean {
  const limit = getFeatureLimit(tier, feature);
  if (limit === null) return false;
  return currentCount >= limit;
}

/**
 * Recognises the database trigger's custom exception message (see
 * migration 041) so the UI can show a friendly "you've reached your
 * limit, upgrade to save more" prompt instead of a raw Postgres error.
 * The trigger is the real enforcement; this is purely a UX translation
 * layer on top of it.
 */
export function isScenarioLabLimitExceededError(message: string | null | undefined): boolean {
  return !!message && message.includes("scenario_lab_case_limit_exceeded");
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
