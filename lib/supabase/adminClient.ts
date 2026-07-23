import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Sprint 14 WS20 — service-role Supabase client. Bypasses RLS entirely.
 *
 * CRITICAL: this must only ever be called from app/admin/page.tsx (or
 * another route that has ALREADY independently verified the caller is
 * an authenticated, allowlisted admin via isAdminEmail() against the
 * REGULAR RLS-scoped session first). This function performs no
 * authorization check of its own — it is a raw, unrestricted database
 * credential. Never import this into a client component (the
 * "server-only" import throws if bundled client-side, but that is a
 * backstop, not the actual authorization boundary) and never call it
 * before an admin check has already passed.
 *
 * Returns null (not a throwing client) when SUPABASE_SERVICE_ROLE_KEY
 * is not configured — this key is never set in this project's env vars
 * as of Sprint 14 WS20 shipping, so the admin page is inert by design
 * until a human operator explicitly adds it.
 */
export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
