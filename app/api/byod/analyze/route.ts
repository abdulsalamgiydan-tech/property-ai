import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { foundingBetaDeniedResponse, requireFoundingBetaAccess } from "@/lib/auth/foundingBetaAccess";
import { serverErrorResponse } from "@/lib/api/safeError";
import { investmentProfileSchema } from "@/lib/opportunity/profileSchema";
import { deriveBuyBox } from "@/lib/dealhunter/buybox";
import { fetchCandidateRows } from "@/lib/opportunity/candidates";
import { candidatesToEvidence } from "@/lib/dealhunter/feed";
import { byodListingSchema, assessCompleteness } from "@/lib/byod/schema";
import { analyzeUserEnteredDeal } from "@/lib/byod/userListing";

/**
 * V8 Bring Your Own Deal — analyse a USER-ENTERED listing (never scraped) against the
 * user's saved buy box + official market evidence, reusing the tested V7 engine.
 *
 * INVITE-ONLY: requires the warehouse-preview flag AND founding-beta membership.
 * Incomplete user facts must be explicitly confirmed (`confirmIncomplete`) before a
 * score is produced — we never silently assume missing facts. Read-only w.r.t. the DB
 * (persistence is a separate, explicit "save" via /api/byod/submissions).
 */
const bodySchema = z.object({
  listing: byodListingSchema,
  confirmIncomplete: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const access = await requireFoundingBetaAccess();
  if (!access.ok) return foundingBetaDeniedResponse(access);
  const { supabase } = access;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { listing, confirmIncomplete } = parsed.data;

  // Never score incomplete user-entered facts without explicit confirmation.
  const completeness = assessCompleteness(listing);
  if (!completeness.complete && !confirmIncomplete) {
    return NextResponse.json({ needsConfirmation: true, completeness });
  }

  // Buy box from the user's latest saved investment profile (RLS-scoped).
  const { data: profiles, error: pErr } = await supabase
    .from("investment_profiles")
    .select("inputs")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (pErr) return serverErrorResponse();
  if (!profiles || profiles.length === 0) return NextResponse.json({ needsProfile: true });
  const pf = investmentProfileSchema.safeParse(profiles[0].inputs);
  if (!pf.success) return NextResponse.json({ error: "saved profile is invalid" }, { status: 422 });

  const buyBox = deriveBuyBox(pf.data);
  const now = new Date().toISOString();
  const rows = (await fetchCandidateRows(listing.address.state, pf.data.propertyType)) ?? [];
  const evidence = candidatesToEvidence(rows);
  const submissionId = randomUUID();

  const analysis = analyzeUserEnteredDeal({
    input: { ...listing, sourceCapturedAt: listing.sourceCapturedAt ?? now },
    buyBox,
    evidenceByGeo: evidence,
    now,
    submissionId,
  });

  return NextResponse.json({
    dataSource: "user-entered",
    dataSourceLabel: "Entered by you — not verified by Propellect",
    scoreVersion: analysis.deal.scoreVersion,
    bucket: analysis.bucket,
    submissionId,
    listingKey: analysis.listingKey,
    completeness,
    deal: analysis.deal,
    brief: analysis.brief,
    buyBox: { hardGates: buyBox.hardGates, explanations: buyBox.explanations, version: buyBox.version },
  });
}
