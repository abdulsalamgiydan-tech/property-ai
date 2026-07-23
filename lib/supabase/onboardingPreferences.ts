/**
 * Supabase helpers for user_onboarding_preferences (Sprint 14 WS2).
 * Mirrors lib/supabase/notificationPreferences.ts's shape.
 *
 * getOnboardingStatus() fails OPEN: if the table doesn't exist yet
 * (migration 043 not applied — see that migration's own header comment)
 * or any other error occurs, it reports "completed" rather than
 * "not completed". This is deliberate — a status-check failure must
 * never trap a user in a redirect loop into an onboarding step that
 * can't save its result either.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type OnboardingGoal = "investor" | "first_home_buyer" | "researching";

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

export async function saveOnboardingPreferences(
  primaryGoal: OnboardingGoal | null,
  statesOfInterest: string[]
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const { error } = await supabase.from("user_onboarding_preferences").upsert(
    {
      user_id: userData.user.id,
      primary_goal: primaryGoal,
      states_of_interest: statesOfInterest,
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
