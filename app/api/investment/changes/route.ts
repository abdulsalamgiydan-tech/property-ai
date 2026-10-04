import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { explainChange, type MetricChange } from "@/lib/opportunity/changes";

/**
 * Change alerts on a user's shortlisted suburbs (V7A). RLS scopes every row to
 * its owner; alerts are only ever written by the SECURITY DEFINER detector
 * (migration 062), never by a client. Every returned message is generated from
 * the stored provenance — no fabricated figures, no recommendations.
 */
async function requireUser() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

interface ChangeRow {
  id: string;
  geography_id: string;
  metric: string;
  property_type: string;
  direction: MetricChange["direction"];
  old_value: number | null;
  new_value: number | null;
  old_period_end: string | null;
  new_period_end: string | null;
  unit: string | null;
  source_id: string | null;
  attribution: string | null;
  detected_at: string;
  seen_at: string | null;
}

function rowToChange(r: ChangeRow): MetricChange {
  const pct =
    r.old_value != null && r.new_value != null && r.old_value !== 0
      ? ((r.new_value - r.old_value) / Math.abs(r.old_value)) * 100
      : null;
  return {
    metric: r.metric as MetricChange["metric"],
    direction: r.direction,
    oldValue: r.old_value,
    newValue: r.new_value,
    oldPeriodEnd: r.old_period_end,
    newPeriodEnd: r.new_period_end,
    unit: r.unit,
    sourceId: r.source_id,
    attribution: r.attribution,
    pctChange: pct,
  };
}

/** GET — list the caller's change alerts, newest first. `?unseen=1` filters to unread. */
export async function GET(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let query = supabase
    .from("investment_shortlist_change_events")
    .select(
      "id, geography_id, metric, property_type, direction, old_value, new_value, old_period_end, new_period_end, unit, source_id, attribution, detected_at, seen_at",
    )
    .order("detected_at", { ascending: false });
  if (req.nextUrl.searchParams.get("unseen") === "1") query = query.is("seen_at", null);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const items = ((data ?? []) as ChangeRow[]).map((r) => ({
    id: r.id,
    geography_id: r.geography_id,
    metric: r.metric,
    direction: r.direction,
    detected_at: r.detected_at,
    seen_at: r.seen_at,
    // Plain-English, provenance-mapped explanation (server-rendered from stored evidence).
    message: explainChange(rowToChange(r)),
  }));
  return NextResponse.json({ items });
}

/**
 * POST — run the least-privilege detector for the caller. Idempotent; returns the
 * number of newly recorded alerts. No body. (A scheduled job can call this per
 * user later; for the beta the client triggers it.)
 */
export async function POST() {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { data, error } = await supabase.rpc("detect_shortlist_change_events_v1");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, detected: typeof data === "number" ? data : 0 });
}

const patchSchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }),
  z.object({ all: z.literal(true) }),
]);

/** PATCH — mark alerts seen. `{ids:[...]}` or `{all:true}`. Fail-closed: 404 if nothing changed. */
export async function PATCH(req: NextRequest) {
  if (!isWarehousePreviewEnabled()) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const seenAt = new Date().toISOString();
  let upd = supabase
    .from("investment_shortlist_change_events")
    .update({ seen_at: seenAt })
    .is("seen_at", null); // only touch currently-unread rows
  if ("ids" in parsed.data) upd = upd.in("id", parsed.data.ids);
  // RLS guarantees only the owner's rows are visible/updatable.
  const { data, error } = await upd.select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, updated: data.length });
}
