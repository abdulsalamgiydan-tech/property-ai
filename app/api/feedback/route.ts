import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { feedbackSubmissionSchema, safeFeedbackPath } from "@/lib/feedback/schema";
import { sanitiseUserText } from "@/lib/strategy/sanitiseUserText";
import { checkRateLimit } from "@/lib/security/rateLimiter";

const FEEDBACK_LIMIT = 5;
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = checkRateLimit(`feedback:${user.id}`, FEEDBACK_LIMIT, FEEDBACK_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json({ error: "rate_limit", retry_after_ms: limit.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = feedbackSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const { cleaned } = sanitiseUserText(parsed.data.message);
  if (!cleaned.trim()) {
    return NextResponse.json({ error: "validation_error" }, { status: 400 });
  }

  const technicalContext = {
    userAgent: req.headers.get("user-agent")?.slice(0, 180) ?? null,
    acceptLanguage: req.headers.get("accept-language")?.slice(0, 80) ?? null,
    route: safeFeedbackPath(parsed.data.pagePath),
  };

  const { error } = await supabase.from("user_feedback").insert({
    user_id: user.id,
    category: parsed.data.category,
    message: cleaned,
    page_path: safeFeedbackPath(parsed.data.pagePath),
    satisfaction_score: parsed.data.satisfactionScore ?? null,
    contact_permission: parsed.data.contactPermission,
    client_submission_id: parsed.data.clientSubmissionId ?? null,
    technical_context: technicalContext,
  });

  if (error) {
    if (error.code === "23505") return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
