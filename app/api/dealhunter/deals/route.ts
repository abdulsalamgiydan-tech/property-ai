import { NextResponse } from "next/server";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchCandidateRows } from "@/lib/opportunity/candidates";
import { investmentProfileSchema } from "@/lib/opportunity/profileSchema";
import { deriveBuyBox } from "@/lib/dealhunter/buybox";
import { rankDeals } from "@/lib/dealhunter/ranking";
import { candidatesToEvidence, loadReplayListings } from "@/lib/dealhunter/feed";
import { FIXTURE_LABEL } from "@/lib/listings/providers/replay";

/**
 * Deal Hunter ranked feed (V7B). Flag-gated, auth-required. Loads the user's saved
 * investment profile → buy box, ranks the labelled REPLAY listings against real
 * official market evidence (the least-privilege candidates RPC). Read-only.
 *
 * Data source is clearly labelled `replay` until authorised live provider access
 * exists. Nothing is fabricated — a suburb with no official evidence yields a
 * low-confidence "needs review" deal, never invented figures.
 */
export async function GET() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  // Latest saved profile (RLS-scoped to this user).
  const { data: profiles, error: pErr } = await supabase
    .from("investment_profiles")
    .select("inputs")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profiles || profiles.length === 0) return NextResponse.json({ needsProfile: true, items: [] });

  const parsed = investmentProfileSchema.safeParse(profiles[0].inputs);
  if (!parsed.success) return NextResponse.json({ error: "saved profile is invalid" }, { status: 422 });
  const profile = parsed.data;

  const buyBox = deriveBuyBox(profile);
  const state = buyBox.hardGates.eligibleStates[0] ?? "SA";

  // Real official evidence via the least-privilege RPC (null when unavailable).
  const rows = (await fetchCandidateRows(state, profile.propertyType)) ?? [];
  const evidence = candidatesToEvidence(rows);
  const listings = await loadReplayListings(state, "sale");
  const out = rankDeals(listings, buyBox, evidence, { asOf: new Date().toISOString() });

  return NextResponse.json({
    dataSource: "replay",
    dataSourceLabel: FIXTURE_LABEL,
    scoreVersion: out.scoreVersion,
    buyBox: { hardGates: buyBox.hardGates, softPreferences: buyBox.softPreferences, explanations: buyBox.explanations, version: buyBox.version },
    ranked: out.ranked,
    needsReview: out.needsReview,
    ineligible: out.ineligible,
  });
}
