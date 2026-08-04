import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { investmentProfileSchema } from "@/lib/opportunity/profileSchema";

/** Saved Find My Investment profiles. RLS scopes every row to its owner. */
export async function GET() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
  const supabase = await createServerSupabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = saveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const { error } = await supabase
    .from("investment_profiles")
    .insert({ user_id: auth.user.id, name: parsed.data.name, inputs: parsed.data.inputs });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
