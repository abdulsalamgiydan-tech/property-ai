/**
 * Supabase helper for user_feedback (Sprint 14 WS21). Mirrors
 * lib/supabase/notificationPreferences.ts's shape. Reuses
 * sanitiseUserText (already used for /strategy inputs and the research
 * copilot's question text) for the free-text message — general hygiene
 * against script/HTML injection into stored, later-read text, not just
 * LLM-prompt-specific.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { sanitiseUserText } from "@/lib/strategy/sanitiseUserText";

export type FeedbackCategory = "bug" | "idea" | "other";

export async function submitFeedback(
  category: FeedbackCategory,
  message: string,
  pagePath: string
): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const { cleaned } = sanitiseUserText(message);
  if (!cleaned.trim()) return { ok: false, message: "Please enter some feedback before sending." };

  const { error } = await supabase.from("user_feedback").insert({
    user_id: userData.user.id,
    category,
    message: cleaned,
    page_path: pagePath,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
