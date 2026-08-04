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
  const { error } = await supabase.from("investment_shortlist_items").upsert(
    { user_id: user.id, ...parsed.data },
    { onConflict: "user_id,geography_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const geographyId = req.nextUrl.searchParams.get("geography_id");
  if (!geographyId) return NextResponse.json({ error: "geography_id required" }, { status: 400 });
  const { error } = await supabase.from("investment_shortlist_items").delete().eq("geography_id", geographyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
