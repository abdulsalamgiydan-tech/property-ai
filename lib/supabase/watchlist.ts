/**
 * Supabase helpers for watchlist_items table.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type WatchlistItem = {
  id: string;
  user_id: string;
  type: "property" | "suburb" | "note";
  property_report_id: string | null;
  suburb: string | null;
  state: string | null;
  notes: string | null;
  created_at: string;
};

export type AddWatchlistPayload = {
  type: "property" | "suburb" | "note";
  propertyReportId?: string | null;
  suburb?: string | null;
  state?: string | null;
  notes?: string | null;
};

export async function addToWatchlist(
  payload: AddWatchlistPayload
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in to add to watchlist." };

  const { data, error } = await supabase
    .from("watchlist_items")
    .insert({
      user_id: userData.user.id,
      type: payload.type,
      property_report_id: payload.propertyReportId || null,
      suburb: payload.suburb || null,
      state: payload.state || null,
      notes: payload.notes || null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

export async function listWatchlistItems(): Promise<{
  ok: true;
  items: WatchlistItem[];
} | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("watchlist_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: error.message };
  return { ok: true, items: (data ?? []) as WatchlistItem[] };
}

export async function removeFromWatchlist(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("watchlist_items")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) {
    return {
      ok: false,
      message: "Watchlist item not found or you do not have permission to remove it.",
    };
  }
  return { ok: true };
}
