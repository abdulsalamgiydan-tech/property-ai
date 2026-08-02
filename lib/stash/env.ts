/**
 * Server-only Stash Property API configuration. NEVER import from a
 * "use client" module — the API key must never reach the browser, and there is
 * no `server-only` package guard in this repo (enforced by convention, same as
 * lib/warehouse/client.ts).
 *
 * Required environment variables (documented in
 * warehouse/docs/STASH_ACCESS_REQUIREMENTS.md; none currently set — the
 * integration ships disabled and fixture-tested until licensed access exists):
 *   STASH_ENABLED         "true" to enable live calls (default: off)
 *   STASH_API_BASE_URL    base URL of the licensed Stash v2 data API
 *   STASH_API_KEY         server-side API credential (never NEXT_PUBLIC_*)
 *
 * Never place STASH_API_KEY in NEXT_PUBLIC_* vars, logs, fixtures, or git.
 */

export type StashConfig = {
  baseUrl: string;
  apiKey: string;
};

/** Reads config by env-var name only. Returns null if incompletely configured. Never logs values. */
export function getStashConfig(): StashConfig | null {
  const baseUrl = process.env.STASH_API_BASE_URL;
  const apiKey = process.env.STASH_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

/**
 * The single gate for making any live Stash request. Requires BOTH the explicit
 * feature flag AND complete credentials — so a stray flag alone, or stray
 * credentials alone, can never trigger a live call. Off by default.
 */
export function isStashEnabled(): boolean {
  return process.env.STASH_ENABLED === "true" && getStashConfig() !== null;
}
