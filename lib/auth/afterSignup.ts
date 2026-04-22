import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type EarlyAccessSignupPayload = {
  email: string;
  firstName?: string;
};

/**
 * Persists interest after a magic-link is sent (user is not signed in yet).
 * Inserts into the `waitlist` table (`email`, `created_at`).
 *
 * Supabase: enable RLS on `waitlist` and add a policy allowing `INSERT` for `anon`
 * (and optionally `authenticated`) so this client call succeeds.
 */
export async function notifyEarlyAccessInterest(
  payload: EarlyAccessSignupPayload
): Promise<void> {
  const email = payload.email?.trim().toLowerCase();
  if (!email) return;

  if (!isSupabaseConfigured()) return;

  const supabase = createBrowserSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase.from("waitlist").insert({
    email,
    created_at: new Date().toISOString(),
  });

  if (error) {
    // Duplicate email, RLS, or network — never block the auth flow
    if (process.env.NODE_ENV === "development") {
      console.warn("[waitlist]", error.message);
    }
  }
}
