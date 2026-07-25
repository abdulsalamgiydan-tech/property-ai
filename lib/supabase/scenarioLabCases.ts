/**
 * Supabase helpers for scenario_lab_cases table (Sprint 13 WS6).
 * Mirrors lib/supabase/watchlist.ts's shape: client-side calls under RLS,
 * user_id always taken from the authenticated session, never client-supplied.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type ScenarioLabCase = {
  id: string;
  user_id: string;
  geography_id: string;
  geography_code: string;
  geography_label: string;
  label: string | null;
  deposit_percent: number;
  loan_term_years: number;
  interest_rate_percent: number;
  vacancy_percent: number | null;
  annual_expenses: number | null;
  scenario_json: unknown;
  created_at: string;
  updated_at: string;
};

export type SaveScenarioCasePayload = {
  geographyId: string;
  geographyCode: string;
  geographyLabel: string;
  label?: string | null;
  depositPercent: number;
  loanTermYears: number;
  interestRatePercent: number;
  vacancyPercent?: number | null;
  annualExpenses?: number | null;
  scenarioJson?: unknown;
};

export async function saveScenarioCase(
  payload: SaveScenarioCasePayload
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in to save a scenario." };

  const { data, error } = await supabase
    .from("scenario_lab_cases")
    .insert({
      user_id: userData.user.id,
      geography_id: payload.geographyId,
      geography_code: payload.geographyCode,
      geography_label: payload.geographyLabel,
      label: payload.label || null,
      deposit_percent: payload.depositPercent,
      loan_term_years: payload.loanTermYears,
      interest_rate_percent: payload.interestRatePercent,
      vacancy_percent: payload.vacancyPercent ?? null,
      annual_expenses: payload.annualExpenses ?? null,
      scenario_json: payload.scenarioJson ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

export async function listScenarioCases(): Promise<
  { ok: true; cases: ScenarioLabCase[] } | { ok: false; message: string }
> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("scenario_lab_cases")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: error.message };
  return { ok: true, cases: (data ?? []) as ScenarioLabCase[] };
}

export async function deleteScenarioCase(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase.from("scenario_lab_cases").delete().eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
