import { NextRequest, NextResponse } from "next/server";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { fetchCandidateRows } from "@/lib/opportunity/candidates";
import { rankInvestments, RANKABLE_JURISDICTIONS } from "@/lib/opportunity/engine";
import { parseProfile } from "@/lib/opportunity/profileSchema";
import type { CandidateRow } from "@/lib/opportunity/types";

/**
 * POST /api/investment/candidates
 * Body: InvestmentProfile. Returns the deterministic RankOutput.
 *
 * Gated behind the existing warehouse-preview flag so Production behaviour is
 * unchanged until the feature is enabled. Scores are computed server-side by the
 * deterministic engine; no AI and no synthetic values enter the ranking.
 */
export async function POST(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = parseProfile(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const profile = parsed.profile;

  const rankableStates = profile.states.filter((s) => (RANKABLE_JURISDICTIONS as readonly string[]).includes(s));

  // National honestly blocked: if the user picked only not-yet-offered states.
  if (rankableStates.length === 0) {
    const out = rankInvestments(profile, [], { asOf: new Date() });
    return NextResponse.json({
      ...out,
      dataUnavailable: false,
      offeredStates: RANKABLE_JURISDICTIONS,
    });
  }

  let dataUnavailable = false;
  const rows: CandidateRow[] = [];
  for (const st of rankableStates) {
    const c = await fetchCandidateRows(st, profile.propertyType);
    if (c === null) dataUnavailable = true;
    else rows.push(...c);
  }

  const out = rankInvestments(profile, rows, { asOf: new Date() });
  return NextResponse.json({ ...out, dataUnavailable, offeredStates: RANKABLE_JURISDICTIONS });
}
