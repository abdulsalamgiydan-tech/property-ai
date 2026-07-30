import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { feedbackSubmissionSchema, type FeedbackSubmission } from "@/lib/feedback/schema";

export type { FeedbackCategory } from "@/lib/feedback/schema";

export async function submitFeedback(input: FeedbackSubmission): Promise<{ ok: boolean; message?: string; rateLimited?: boolean }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const parsed = feedbackSubmissionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please complete the required feedback fields." };

  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.data),
  });

  if (res.ok) return { ok: true };
  if (res.status === 429) return { ok: false, rateLimited: true, message: "Feedback is rate limited. Please try again in a few minutes." };
  if (res.status === 401) return { ok: false, message: "You must be signed in." };
  return { ok: false, message: "Could not send feedback. Please try again." };
}
