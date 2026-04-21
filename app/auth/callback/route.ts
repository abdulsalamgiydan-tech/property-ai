import { buildAuthErrorUrl, getSupabaseAuthFailureRedirectTarget } from "@/lib/auth/supabaseAuthFailureRedirect";
import { safeInternalNextPath } from "@/lib/auth/safeNextPath";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function completeRedirectUrl(origin: string, nextPath: string): string {
  const url = new URL("/auth/complete", origin);
  if (nextPath && nextPath !== "/") {
    url.searchParams.set("next", nextPath);
  }
  return url.toString();
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(buildAuthErrorUrl(origin, "not_configured", searchParams.get("next")));
  }

  const failureRedirect = getSupabaseAuthFailureRedirectTarget(requestUrl);
  if (failureRedirect) {
    return NextResponse.redirect(failureRedirect.toString());
  }

  const code = searchParams.get("code");
  const nextRaw = searchParams.get("next");
  const nextPath = safeInternalNextPath(nextRaw);

  if (!code) {
    return NextResponse.redirect(buildAuthErrorUrl(origin, "missing_token", nextRaw));
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(buildAuthErrorUrl(origin, "session_exchange_failed", nextRaw));
    }
  } catch {
    return NextResponse.redirect(buildAuthErrorUrl(origin, "session_exchange_failed", nextRaw));
  }

  return NextResponse.redirect(completeRedirectUrl(origin, nextPath));
}
