/**
 * Supabase helpers for watchlist_change_events (Sprint 13 WS9). Mirrors
 * lib/supabase/watchlist.ts's shape: client-side calls under RLS.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type WatchlistChangeEvent = {
  id: string;
  user_id: string;
  watchlist_item_id: string;
  event_type: string;
  metric_family: string;
  description: string;
  previous_value: string | null;
  new_value: string | null;
  read: boolean;
  created_at: string;
};

export async function listChangeEvents(): Promise<
  { ok: true; events: WatchlistChangeEvent[] } | { ok: false; message: string }
> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("watchlist_change_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { ok: false, message: error.message };
  return { ok: true, events: (data ?? []) as WatchlistChangeEvent[] };
}

export async function markChangeEventRead(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase.from("watchlist_change_events").update({ read: true }).eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

export async function refreshWatchlistChanges(): Promise<
  { ok: true; itemsChecked: number; eventsGenerated: number } | { ok: false; message: string }
> {
  try {
    const res = await fetch("/api/watchlist/refresh-changes", { method: "POST" });
    if (!res.ok) return { ok: false, message: `refresh failed (${res.status})` };
    const body = (await res.json()) as { itemsChecked: number; eventsGenerated: number };
    return { ok: true, ...body };
  } catch {
    return { ok: false, message: "network error" };
  }
}
