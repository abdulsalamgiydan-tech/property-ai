/**
 * Supabase helpers for property_reports table.
 * All operations are client-side (browser) and require a signed-in user.
 */
import type { PropertyAnalysisInputs, PropertyAnalysisResult } from "@/lib/propertyAnalysis";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type SavedPropertyReport = {
  id: string;
  user_id: string;
  property_name: string | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  property_type: string | null;
  purchase_price: number | null;
  weekly_rent: number | null;
  score: number | null;
  status_colour: string | null;
  inputs_json: PropertyAnalysisInputs | null;
  results_json: PropertyAnalysisResult | null;
  created_at: string;
  updated_at: string;
};

export type SaveReportPayload = {
  propertyName?: string;
  address?: string;
  inputs: PropertyAnalysisInputs;
  results: PropertyAnalysisResult;
};

export async function savePropertyReport(
  payload: SaveReportPayload
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in to save a report." };

  const { data, error } = await supabase
    .from("property_reports")
    .insert({
      user_id: userData.user.id,
      property_name: payload.propertyName || payload.inputs.suburb || "Untitled property",
      address: payload.address || null,
      suburb: payload.inputs.suburb || null,
      state: payload.inputs.state || null,
      property_type: "residential",
      purchase_price: payload.inputs.purchasePrice,
      weekly_rent: payload.inputs.weeklyRent,
      score: payload.results.score,
      status_colour: payload.results.status,
      inputs_json: payload.inputs as unknown as Record<string, unknown>,
      results_json: payload.results as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

export async function listPropertyReports(): Promise<{
  ok: true;
  reports: SavedPropertyReport[];
} | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("property_reports")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: error.message };
  return { ok: true, reports: (data ?? []) as SavedPropertyReport[] };
}

export async function getPropertyReport(id: string): Promise<{
  ok: true;
  report: SavedPropertyReport;
} | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("property_reports")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, report: data as SavedPropertyReport };
}

export async function deletePropertyReport(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase
    .from("property_reports")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
