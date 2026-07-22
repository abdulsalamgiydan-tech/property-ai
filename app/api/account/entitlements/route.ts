import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getUserTier, hasEntitlement, type Feature } from "@/lib/auth/entitlements";

const ALL_FEATURES: Feature[] = [
  "deal_analysis",
  "watchlist",
  "portfolio",
  "research_preview",
  "multi_state_research",
  "scenario_lab",
  "saved_scenarios",
  "public_api_v1",
  "export_reports",
];

/**
 * Returns the caller's own tier and feature list. Demonstrates the
 * server-side enforcement pattern for Sprint 13 WS11: the tier always
 * comes from getUserTier()'s database lookup under the caller's own RLS
 * session — any client-supplied ?tier= query param is intentionally
 * ignored, never trusted, and never even read for this decision.
 */
export async function GET(req: NextRequest) {
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

  // Deliberately not read: req.nextUrl.searchParams.get("tier") — a
  // client cannot elevate its own tier by passing a query param. The
  // request object above only exists in this function's signature so the
  // route shape matches the rest of the API; nothing from it is used to
  // decide the tier.
  void req;

  const tier = await getUserTier(supabase, user.id);
  const features = Object.fromEntries(ALL_FEATURES.map((f) => [f, hasEntitlement(tier, f)]));

  return NextResponse.json({ tier, features });
}
