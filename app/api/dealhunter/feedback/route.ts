import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { investmentProfileSchema } from "@/lib/opportunity/profileSchema";
import { proposePreferenceAdjustments, type FeedbackSignal } from "@/lib/dealhunter/feedback";

/**
 * Deal Hunter feedback (V7B). POST appends an explicit signal (append-only table,
 * migration 063). GET returns TRANSPARENT preference proposals computed from the
 * user's own signals + saved profile — proposals only; nothing is auto-applied and
 * no ranking is silently changed.
 */
async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

const KINDS = ["saved", "passed", "rejected", "compared", "brief_opened", "dd_status"] as const;
const REASONS = ["too_expensive", "poor_cashflow", "wrong_location", "too_small", "condition_or_risk", "low_confidence", "other"] as const;

const signalSchema = z.object({
  listing_key: z.string().min(3).max(128),
  kind: z.enum(KINDS),
  reason: z.enum(REASONS).optional(),
});

export async function POST(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = signalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { error } = await supabase.from("deal_listing_feedback").insert({
    user_id: user.id,
    listing_key: parsed.data.listing_key,
    kind: parsed.data.kind,
    reason: parsed.data.reason ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [{ data: profiles }, { data: signals, error }] = await Promise.all([
    supabase.from("investment_profiles").select("inputs").order("updated_at", { ascending: false }).limit(1),
    supabase.from("deal_listing_feedback").select("listing_key, kind, reason, created_at"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!profiles || profiles.length === 0) return NextResponse.json({ proposals: [] });
  const parsed = investmentProfileSchema.safeParse(profiles[0].inputs);
  if (!parsed.success) return NextResponse.json({ proposals: [] });

  const fs: FeedbackSignal[] = (signals ?? []).map((s) => ({ listingKey: s.listing_key, kind: s.kind, reason: s.reason ?? undefined, at: s.created_at }));
  return NextResponse.json({ proposals: proposePreferenceAdjustments(parsed.data, fs) });
}
