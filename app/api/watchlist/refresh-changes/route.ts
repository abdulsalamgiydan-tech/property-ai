import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getMarketSnapshotV2 } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { detectWatchlistChanges, type SnapshotDiffInput } from "@/lib/warehouse/watchlistChanges";

function toDiffInput(snapshot: Awaited<ReturnType<typeof getMarketSnapshotV2>>): SnapshotDiffInput | null {
  if (!snapshot) return null;
  return {
    latest_sales_period: snapshot.latest_sales_period,
    latest_rent_period: snapshot.latest_rent_period,
    latest_yield_period: snapshot.latest_yield_period,
    latest_approvals_period: snapshot.latest_approvals_period,
    median_sale_price_12m: snapshot.median_sale_price_12m,
    median_weekly_rent_latest: snapshot.median_weekly_rent_latest,
    gross_yield_pct: snapshot.gross_yield_pct,
    approvals_12m: snapshot.approvals_12m,
    sales_sample_confidence: snapshot.sales_sample_confidence,
    rent_confidence: snapshot.rent_confidence,
    yield_confidence: snapshot.yield_confidence,
    supply_confidence: snapshot.supply_confidence,
  };
}

/**
 * Signed-in, on-demand watchlist change detection (Sprint 13 WS9). Runs
 * against the caller's own geography-linked watchlist items only (RLS via
 * createServerSupabaseClient, never a service-role key). There is no cron
 * job or scheduled function here — this route is triggered when the user
 * visits their watchlist, which is the guardrail-safe way to demonstrate
 * the full detect-and-persist flow without adding paid/scheduled
 * infrastructure. Idempotent: the unique constraint on
 * watchlist_change_events (item, event_type, metric_family, new_value)
 * means re-running against an unchanged snapshot inserts nothing new.
 */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }
  if (!isWarehousePreviewEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: items, error: itemsError } = await supabase
    .from("watchlist_items")
    .select("id, geography_id, last_known_snapshot_json")
    .eq("user_id", user.id)
    .not("geography_id", "is", null);

  if (itemsError) {
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  let eventsGenerated = 0;
  let itemsChecked = 0;

  for (const item of items ?? []) {
    if (!item.geography_id) continue;
    itemsChecked += 1;
    const snapshot = await getMarketSnapshotV2(item.geography_id);
    const current = toDiffInput(snapshot);
    if (!current) continue;

    const previous = (item.last_known_snapshot_json as SnapshotDiffInput | null) ?? null;
    const events = detectWatchlistChanges(previous, current);

    for (const event of events) {
      // Idempotent by construction: the unique constraint means a repeat
      // insert of the same (item, type, family, new_value) is a no-op
      // conflict, not a duplicate row or an error.
      const { error: insertError } = await supabase
        .from("watchlist_change_events")
        .upsert(
          {
            user_id: user.id,
            watchlist_item_id: item.id,
            event_type: event.event_type,
            metric_family: event.metric_family,
            description: event.description,
            previous_value: event.previous_value,
            new_value: event.new_value,
          },
          { onConflict: "watchlist_item_id,event_type,metric_family,new_value", ignoreDuplicates: true }
        );
      if (!insertError) eventsGenerated += 1;
    }

    await supabase
      .from("watchlist_items")
      .update({ last_known_snapshot_json: current, last_checked_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  return NextResponse.json({ itemsChecked, eventsGenerated });
}
