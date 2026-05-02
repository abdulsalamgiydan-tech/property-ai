import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const STRATEGY_FREE_TIER_LIMIT = 3;
export const STRATEGY_RATE_WINDOW_DAYS = 7;

function windowStartIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - STRATEGY_RATE_WINDOW_DAYS);
  return d.toISOString();
}

export async function countRecentGenerations(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { count, error } = await supabase
    .from("strategy_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStartIso());

  if (error) throw error;
  return count ?? 0;
}

/**
 * Days until the user can generate again (rolling window), at least 1 when over limit.
 */
export async function retryAfterDaysForRateLimit(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from("strategy_generations")
    .select("created_at")
    .eq("user_id", userId)
    .gte("created_at", windowStartIso())
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  const oldest = data?.[0]?.created_at;
  if (!oldest) return STRATEGY_RATE_WINDOW_DAYS;

  const expiresAt =
    new Date(oldest).getTime() + STRATEGY_RATE_WINDOW_DAYS * 86_400_000;
  const msLeft = expiresAt - Date.now();
  return Math.max(1, Math.ceil(msLeft / 86_400_000));
}

export async function recordGeneration(
  userId: string,
  sanitisationFlag: boolean,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase.from("strategy_generations").insert({
    user_id: userId,
    sanitisation_flag: sanitisationFlag,
  });
  if (error) throw error;
}
