/**
 * Supabase helpers for user_onboarding_preferences (Sprint 14 WS2,
 * expanded in Sprint 17). Onboarding remains optional and user-owned.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  normaliseOnboardingPreferences,
  onboardingDefaults,
  type OnboardingPreferences,
  type OnboardingPreferencesInput,
} from "@/lib/onboarding/preferences";

export type { OnboardingGoal, OnboardingPreferences } from "@/lib/onboarding/preferences";

export async function getOnboardingStatus(): Promise<{ completed: boolean }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { completed: true };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { completed: true };

  const { data, error } = await supabase
    .from("user_onboarding_preferences")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) return { completed: true };
  return { completed: data != null };
}

export async function getOnboardingPreferences(): Promise<
  { ok: true; preferences: OnboardingPreferences; exists: boolean } | { ok: false; message: string; preferences: OnboardingPreferences; exists: false }
> {
  const fallback = onboardingDefaults();
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured.", preferences: fallback, exists: false };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in.", preferences: fallback, exists: false };

  const { data, error } = await supabase
    .from("user_onboarding_preferences")
    .select("*")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error || !data) return { ok: !error, message: error?.message ?? "No preferences yet.", preferences: fallback, exists: false };

  return {
    ok: true,
    exists: true,
    preferences: normaliseOnboardingPreferences({
      primaryGoal: data.primary_goal ?? null,
      strategyFocus: data.strategy_focus ?? "balanced",
      investmentTimeframe: data.investment_timeframe ?? null,
      budgetRange: data.budget_range ?? null,
      depositRange: data.deposit_range ?? null,
      statesOfInterest: data.states_of_interest ?? [],
      preferredPropertyTypes: data.preferred_property_types ?? [],
      riskTolerance: data.risk_tolerance ?? "balanced",
      buyerContext: data.buyer_context ?? null,
      portfolioStatus: data.portfolio_status ?? null,
      guidanceLevel: data.guidance_level ?? "guided",
      notificationFrequency: data.notification_frequency ?? "monthly",
      completionStep: data.completion_step ?? 4,
      skipped: Boolean(data.skipped_at),
      editedFrom: "settings",
    }),
  };
}

export async function saveOnboardingPreferences(input: OnboardingPreferencesInput): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const preferences = normaliseOnboardingPreferences(input);
  const now = new Date().toISOString();

  const { error } = await supabase.from("user_onboarding_preferences").upsert(
    {
      user_id: userData.user.id,
      primary_goal: preferences.primaryGoal,
      strategy_focus: preferences.strategyFocus,
      investment_timeframe: preferences.investmentTimeframe,
      budget_range: preferences.budgetRange,
      deposit_range: preferences.depositRange,
      states_of_interest: preferences.statesOfInterest,
      preferred_property_types: preferences.preferredPropertyTypes,
      risk_tolerance: preferences.riskTolerance,
      buyer_context: preferences.buyerContext,
      portfolio_status: preferences.portfolioStatus,
      guidance_level: preferences.guidanceLevel,
      notification_frequency: preferences.notificationFrequency,
      completion_step: preferences.completionStep,
      skipped_at: preferences.skipped ? now : null,
      last_edited_from: preferences.editedFrom,
      completed_at: now,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
