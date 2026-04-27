import { safeInternalNextPath } from "@/lib/auth/safeNextPath";

/** Canonical production origin for Propellect magic links (must match Supabase redirect allowlist). */
const PROPELLECT_CANONICAL_ORIGIN = "https://www.propellect.com.au";

function isLocalDevOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function isPropellectProductionHost(hostname: string): boolean {
  return hostname === "www.propellect.com.au" || hostname === "propellect.com.au";
}

function originFromEnv(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (isPropellectProductionHost(u.hostname)) {
      return PROPELLECT_CANONICAL_ORIGIN;
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Origin used to build `emailRedirectTo` → `{origin}/auth/callback?next=…`
 *
 * - **Local dev** (`localhost`, `127.0.0.1`): always the current browser origin (keeps port, http).
 * - **Propellect production** (apex or www): always `https://www.propellect.com.au` so magic links
 *   never mix hosts.
 * - **`NEXT_PUBLIC_SITE_URL`**: when set, used after the same Propellect normalisation; otherwise
 *   for non-Propellect hosts (e.g. preview deploys) the current browser origin is used.
 */
export function getMagicLinkRedirectOrigin(clientFallbackOrigin: string): string {
  // 1. If we are on localhost, stay on localhost
  if (clientFallbackOrigin && isLocalDevOrigin(clientFallbackOrigin)) {
    return clientFallbackOrigin;
  }

  // 2. If we are on propellect.com.au (apex or www), always use the canonical www origin
  try {
    if (clientFallbackOrigin) {
      const host = new URL(clientFallbackOrigin).hostname;
      if (isPropellectProductionHost(host)) {
        return PROPELLECT_CANONICAL_ORIGIN;
      }
    }
  } catch {
    /* ignore */
  }

  // 3. Fallback to env or provided origin
  const fromEnv = originFromEnv();
  if (fromEnv) return fromEnv;

  return clientFallbackOrigin || PROPELLECT_CANONICAL_ORIGIN;
}

/**
 * Full `emailRedirectTo` passed to `signInWithOtp` — always `{origin}/auth/callback?next=…`
 * with `origin` from {@link getMagicLinkRedirectOrigin} (www Propellect in prod, localhost in dev).
 */
export function buildMagicLinkEmailRedirectTo(
  clientFallbackOrigin: string,
  redirectPathRaw: string | null | undefined
): string {
  const base = getMagicLinkRedirectOrigin(clientFallbackOrigin);
  const returnPath = safeInternalNextPath(redirectPathRaw || "/");
  const callback = new URL("/auth/callback", base);
  callback.searchParams.set("next", returnPath);
  return callback.toString();
}
