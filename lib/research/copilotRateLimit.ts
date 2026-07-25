import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate limiting for the research copilot (Sprint 14 WS5), mirroring
 * lib/strategy/rateLimit.ts's shape against a new research_copilot_queries
 * table (supabase/migrations/042_research_copilot_queries.sql). A tighter
 * window than the strategy generator's, since this feature is meant for
 * quick, occasional lookups, not a chat loop — and every call costs real
 * money against the shared ANTHROPIC_API_KEY.
 */
export const COPILOT_FREE_TIER_LIMIT = 5;
export const COPILOT_RATE_WINDOW_HOURS = 24;

function windowStartIso(): string {
  const d = new Date();
  d.setUTCHours(d.getUTCHours() - COPILOT_RATE_WINDOW_HOURS);
  return d.toISOString();
}

/**
 * Returns the recent query count, or null if the count could not be
 * determined because the table does not exist yet (migration 042 not
 * yet applied to this environment) — callers must treat null as "rate
 * limiting is not currently enforceable" rather than "0 = allow", so the
 * caller can decide how conservative to be, rather than this function
 * silently pretending the limit doesn't apply.
 */
export async function countRecentQueries(userId: string, supabase: SupabaseClient): Promise<number | null> {
  const { count, error } = await supabase
    .from("research_copilot_queries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStartIso());

  if (error) {
    // Postgres undefined_table — the migration hasn't been applied yet.
    if (error.code === "42P01") return null;
    throw error;
  }
  return count ?? 0;
}

export async function recordQuery(
  userId: string,
  geographyId: string,
  question: string,
  grounded: boolean,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase.from("research_copilot_queries").insert({
    user_id: userId,
    geography_id: geographyId,
    question,
    grounded,
  });
  // Best-effort: a missing table (migration not yet applied) must not
  // break the user-facing answer that was already generated — the only
  // consequence is that this particular query isn't counted toward the
  // rate limit or audit trail.
  if (error && error.code !== "42P01") throw error;
}
