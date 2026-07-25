import type { NextRequest } from "next/server";

/**
 * Best-effort caller identity for rate limiting unauthenticated routes.
 * Vercel sets x-forwarded-for on every request; falls back to a shared
 * bucket key when absent (e.g. local dev without a proxy) rather than
 * throwing — a shared fallback bucket is a known, accepted limitation
 * for local/dev use, not a production gap (production always has the
 * header).
 */
export function clientIpKey(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim();
  return ip || "unknown-client";
}
