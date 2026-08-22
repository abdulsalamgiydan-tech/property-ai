import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Per-user notification preferences for shortlist change alerts (V7A). RLS scopes
 * every row to its owner. Defaults are returned when the user has no row yet, so
 * the UI never has to special-case "first visit".
 */
async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

const DEFAULTS = { alerts_enabled: true, min_change_pct: 0 };

export async function GET() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data, error } = await supabase
    .from("investment_notification_prefs")
    .select("alerts_enabled, min_change_pct, updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prefs: data ?? DEFAULTS });
}

const putSchema = z.object({
  alerts_enabled: z.boolean().optional(),
  min_change_pct: z.number().min(0).max(100).optional(),
});

/** PUT — upsert the caller's preferences. */
export async function PUT(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  const row = {
    user_id: user.id,
    alerts_enabled: parsed.data.alerts_enabled ?? DEFAULTS.alerts_enabled,
    min_change_pct: parsed.data.min_change_pct ?? DEFAULTS.min_change_pct,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("investment_notification_prefs")
    .upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
