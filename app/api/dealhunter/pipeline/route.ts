import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { foundingBetaDeniedResponse, requireFoundingBetaAccess } from "@/lib/auth/foundingBetaAccess";
import { serverErrorResponse } from "@/lib/api/safeError";

/**
 * Deal Hunter pipeline (V7B). Invite-only; RLS scopes rows to the owner; every
 * mutation is fail-closed (zero affected rows → 404, never a misleading {ok:true}).
 * Rejecting a deal requires a reason (enforced here and by the migration-063 DB
 * check).
 */
const STATUSES = ["new", "reviewing", "due_diligence", "rejected", "offer_considered"] as const;
const REASONS = ["too_expensive", "poor_cashflow", "wrong_location", "too_small", "condition_or_risk", "low_confidence", "other"] as const;

export async function GET() {
  const access = await requireFoundingBetaAccess();
  if (!access.ok) return foundingBetaDeniedResponse(access);
  const { supabase } = access;
  const { data, error } = await supabase
    .from("deal_pipeline_items")
    .select("id, listing_key, status, rejection_reason, note, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return serverErrorResponse();
  return NextResponse.json({ items: data ?? [] });
}

const upsertSchema = z
  .object({
    listing_key: z.string().min(3).max(128),
    status: z.enum(STATUSES),
    rejection_reason: z.enum(REASONS).optional(),
    note: z.string().max(1000).optional(),
  })
  .refine((v) => v.status !== "rejected" || !!v.rejection_reason, { message: "rejection_reason required when status is rejected" });

export async function POST(req: NextRequest) {
  const access = await requireFoundingBetaAccess();
  if (!access.ok) return foundingBetaDeniedResponse(access);
  const { supabase, user } = access;
  const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const row = {
    user_id: user.id,
    listing_key: parsed.data.listing_key,
    status: parsed.data.status,
    rejection_reason: parsed.data.status === "rejected" ? parsed.data.rejection_reason : null,
    note: parsed.data.note ?? null,
    updated_at: new Date().toISOString(),
  };
  // .select() proves a row actually changed (fail-closed).
  const { data, error } = await supabase
    .from("deal_pipeline_items")
    .upsert(row, { onConflict: "user_id,listing_key" })
    .select("id");
  if (error) {
    if (error.code === "23514") return NextResponse.json({ error: "rejected requires a reason" }, { status: 400 });
    return serverErrorResponse();
  }
  if (!data || data.length === 0) return NextResponse.json({ error: "not saved" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data[0].id });
}

export async function DELETE(req: NextRequest) {
  const access = await requireFoundingBetaAccess();
  if (!access.ok) return foundingBetaDeniedResponse(access);
  const { supabase, user } = access;
  const key = req.nextUrl.searchParams.get("listing_key");
  if (!key) return NextResponse.json({ error: "listing_key required" }, { status: 400 });
  const { data, error } = await supabase
    .from("deal_pipeline_items")
    .delete()
    .eq("listing_key", key)
    .eq("user_id", user.id)
    .select("id");
  if (error) return serverErrorResponse();
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: data.length });
}
