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
  // Sprint 13 WS8a — populated when a suburb/postcode was added via the
  // research warehouse search rather than typed in free-text. Older rows
  // and any locality outside NSW/VIC coverage keep these null, which is
  // valid: watchlist must stay usable nationally even where research
  // data doesn't exist yet.
  geography_id: string | null;
  geography_code: string | null;
  geography_type: "SAL" | "POA" | null;
  postcode: string | null;
  tags: string[];
  updated_at: string;
};

export type AddWatchlistPayload = {
  type: "property" | "suburb" | "note";
  propertyReportId?: string | null;
  suburb?: string | null;
  state?: string | null;
  notes?: string | null;
  geographyId?: string | null;
  geographyCode?: string | null;
  geographyType?: "SAL" | "POA" | null;
  postcode?: string | null;
  tags?: string[];
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
      geography_id: payload.geographyId || null,
      geography_code: payload.geographyCode || null,
      geography_type: payload.geographyType || null,
      postcode: payload.postcode || null,
      tags: payload.tags ?? [],
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
