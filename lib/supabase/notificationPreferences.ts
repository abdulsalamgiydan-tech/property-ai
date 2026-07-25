/**
 * Supabase helpers for notification_preferences (Sprint 13 schema,
 * Sprint 14 WS9 wiring). Mirrors lib/supabase/watchlist.ts's shape.
 * Setting a frequency here NEVER triggers a send — no email/push
 * provider is wired to this table at all; it only drives the in-app
 * digest preview (lib/notifications/digestPreview.ts).
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { normaliseDigestFrequency, type DigestFrequency } from "@/lib/notifications/digestPreview";

export async function getDigestFrequency(): Promise<
  { ok: true; frequency: DigestFrequency } | { ok: false; message: string }
> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const { data, error } = await supabase
    .from("notification_preferences")
    .select("digest_frequency")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  return { ok: true, frequency: normaliseDigestFrequency(data?.digest_frequency) };
}

export async function setDigestFrequency(
  frequency: DigestFrequency
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userData.user.id, digest_frequency: frequency }, { onConflict: "user_id" });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
