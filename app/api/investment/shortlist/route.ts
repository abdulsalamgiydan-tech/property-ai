import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Per-user investment shortlist. RLS guarantees a user only sees their own rows. */
async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function GET() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data, error } = await supabase
    .from("investment_shortlist_items")
    .select("id, geography_id, profile_id, note, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

const addSchema = z.object({
  geography_id: z.string().min(3).max(64),
  profile_id: z.string().uuid().optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  // Idempotent add. A supplied profile_id is DB-guaranteed to belong to this same
  // user (migration 061 composite FK); a foreign profile_id fails closed here.
  const { error } = await supabase.from("investment_shortlist_items").upsert(
    { user_id: user.id, ...parsed.data },
    { onConflict: "user_id,geography_id", ignoreDuplicates: true },
  );
  if (error) {
    // FK violation (e.g. profile_id not owned by this user) → fail closed, no leak.
    if (error.code === "23503") return NextResponse.json({ error: "invalid profile reference" }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const geographyId = req.nextUrl.searchParams.get("geography_id");
  if (!geographyId) return NextResponse.json({ error: "geography_id required" }, { status: 400 });
  // Fail-closed: an operation that deletes zero rows (missing, or owned by another
  // user and hidden by RLS) returns 404 — never a misleading {ok:true}.
  const { data, error } = await supabase
    .from("investment_shortlist_items")
    .delete()
    .eq("geography_id", geographyId)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deleted: data.length });
}
