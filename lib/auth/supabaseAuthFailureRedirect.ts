import { safeInternalNextPath } from "@/lib/auth/safeNextPath";

/**
 * When Supabase cannot complete a magic link / OAuth return, it often appends
 * `error`, `error_code`, and `error_description` to the redirect URL. If that
 * URL is the project Site URL, users land on `/` with those query params.
 * This helper builds a clean `/auth/error` URL and detects when to use it.
 */
export function isLikelySupabaseAuthFailureUrl(url: URL): boolean {
  if (url.pathname.startsWith("/auth/error")) return false;

  const error = url.searchParams.get("error");
  if (!error) return false;

  const errorCode = url.searchParams.get("error_code");
  return Boolean(errorCode) || error === "access_denied";
}

export function buildAuthErrorPageUrlFromIncoming(url: URL): URL {
  const dest = new URL("/auth/error", url.origin);

  const errorCode = url.searchParams.get("error_code");
  if (errorCode) dest.searchParams.set("error_code", errorCode);

  const desc = url.searchParams.get("error_description");
  if (desc) dest.searchParams.set("error_description", desc);

  const nextRaw = url.searchParams.get("next");
  const nextPath = safeInternalNextPath(nextRaw);
  if (nextPath !== "/") dest.searchParams.set("next", nextPath);

  return dest;
}

export function getSupabaseAuthFailureRedirectTarget(url: URL): URL | null {
  if (!isLikelySupabaseAuthFailureUrl(url)) return null;
  return buildAuthErrorPageUrlFromIncoming(url);
}

/** Callback handler errors (no `error` query from Supabase). */
export function buildAuthErrorUrl(
  origin: string,
  errorCode: string,
  nextRaw: string | null | undefined
): string {
  const dest = new URL("/auth/error", origin);
  dest.searchParams.set("error_code", errorCode);
  const nextPath = safeInternalNextPath(nextRaw);
  if (nextPath !== "/") dest.searchParams.set("next", nextPath);
  return dest.toString();
}
