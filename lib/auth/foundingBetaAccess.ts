import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { foundingBetaGateOpen } from "@/lib/auth/foundingBeta";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";

type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type FoundingBetaAccess =
  | { ok: true; supabase: ServerSupabaseClient; user: User }
  | { ok: false; status: 401 | 403 | 404; body: { error: string } };

/**
 * Server-side invite-only gate for Deal Hunter/BYOD beta surfaces.
 *
 * Denial contract:
 * - 404: warehouse preview / feature surface unavailable.
 * - 401: no authenticated Supabase user.
 * - 403: authenticated, but the email is missing or not allowlisted.
 */
export async function requireFoundingBetaAccess(): Promise<FoundingBetaAccess> {
  if (!isWarehousePreviewEnabled()) {
    return { ok: false, status: 404, body: { error: "not found" } };
  }

  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return { ok: false, status: 401, body: { error: "unauthenticated" } };
  }

  if (!foundingBetaGateOpen(auth.user.email)) {
    return { ok: false, status: 403, body: { error: "not in founding beta" } };
  }

  return { ok: true, supabase, user: auth.user };
}

export function foundingBetaDeniedResponse(access: Extract<FoundingBetaAccess, { ok: false }>) {
  return NextResponse.json(access.body, { status: access.status });
}
