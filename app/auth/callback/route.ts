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
      console.error("[auth/callback] exchangeCodeForSession returned error:", {
        message: error.message,
        status: error.status,
        name: error.name,
        code_prefix: code.substring(0, 12) + "...",
      });
      return NextResponse.redirect(buildAuthErrorUrl(origin, "session_exchange_failed", nextRaw));
    }
  } catch (e) {
    const err = e as Error;
    console.error("[auth/callback] exchangeCodeForSession threw:", {
      message: err?.message,
      name: err?.name,
      stack: err?.stack,
    });
    return NextResponse.redirect(buildAuthErrorUrl(origin, "session_exchange_failed", nextRaw));
  }

  return NextResponse.redirect(completeRedirectUrl(origin, nextPath));
}
