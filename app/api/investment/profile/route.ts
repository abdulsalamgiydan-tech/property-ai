import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { investmentProfileSchema } from "@/lib/opportunity/profileSchema";

/**
 * Saved Find My Investment profiles. RLS scopes every row to its owner; every
 * mutation is fail-closed — an operation that affects zero rows returns 404
 * (never a misleading {ok:true}), and never reveals another user's ownership.
 */
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
    .from("investment_profiles")
    .select("id, name, inputs, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profiles: data ?? [] });
}

const saveSchema = z.object({ name: z.string().min(1).max(120), inputs: investmentProfileSchema });

export async function POST(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { data, error } = await supabase
    .from("investment_profiles")
    .insert({ user_id: user.id, name: parsed.data.name, inputs: parsed.data.inputs })
    .select("id")
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  inputs: investmentProfileSchema.optional(),
});

export async function PATCH(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.inputs !== undefined) patch.inputs = parsed.data.inputs;
  // RLS restricts the row to the owner; .select() lets us prove a row actually changed.
  const { data, error } = await supabase
    .from("investment_profiles")
    .update(patch)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id: parsed.data.id });
}

export async function DELETE(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const { data, error } = await supabase.from("investment_profiles").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  // Documented orphan behaviour: shortlist rows that referenced this profile keep
  // their row with profile_id set to null (migration 059/061 ON DELETE SET NULL).
  return NextResponse.json({ ok: true, deleted: data.length });
}
