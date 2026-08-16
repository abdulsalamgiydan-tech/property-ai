/**
 * Supabase helpers for property_comparisons table.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type SavedComparison = {
  id: string;
  user_id: string;
  report_a_id: string | null;
  report_b_id: string | null;
  label: string | null;
  comparison_json: Record<string, unknown> | null;
  created_at: string;
};

export type SaveComparisonPayload = {
  reportAId?: string | null;
  reportBId?: string | null;
  label?: string;
  comparisonData: Record<string, unknown>;
};

export async function saveComparison(
  payload: SaveComparisonPayload
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in to save a comparison." };

  const { data, error } = await supabase
    .from("property_comparisons")
    .insert({
      user_id: userData.user.id,
      report_a_id: payload.reportAId || null,
      report_b_id: payload.reportBId || null,
      label: payload.label || "Saved comparison",
      comparison_json: payload.comparisonData,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

export async function listComparisons(): Promise<{
  ok: true;
  comparisons: SavedComparison[];
} | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("property_comparisons")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: error.message };
  return { ok: true, comparisons: (data ?? []) as SavedComparison[] };
}

export async function deleteComparison(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("property_comparisons")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, message: error.message };
  if (!data) {
    return {
      ok: false,
      message: "Comparison not found or you do not have permission to delete it.",
    };
  }
  return { ok: true };
}
