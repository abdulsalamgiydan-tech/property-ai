/**
 * Supabase helpers for portfolio_properties table.
 */
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type PortfolioProperty = {
  id: string;
  user_id: string;
  property_report_id: string | null;
  label: string | null;
  current_value: number | null;
  loan_balance: number | null;
  weekly_rent: number | null;
  annual_expenses: number | null;
  ownership_percentage: number | null;
  created_at: string;
};

export type AddPortfolioPropertyPayload = {
  propertyReportId?: string | null;
  label?: string;
  currentValue: number;
  loanBalance: number;
  weeklyRent: number;
  annualExpenses: number;
  ownershipPercentage?: number;
};

export async function addPortfolioProperty(
  payload: AddPortfolioPropertyPayload
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "You must be signed in." };

  const { data, error } = await supabase
    .from("portfolio_properties")
    .insert({
      user_id: userData.user.id,
      property_report_id: payload.propertyReportId || null,
      label: payload.label || "Property",
      current_value: payload.currentValue,
      loan_balance: payload.loanBalance,
      weekly_rent: payload.weeklyRent,
      annual_expenses: payload.annualExpenses,
      ownership_percentage: payload.ownershipPercentage ?? 100,
    })
    .select("id")
    .single();

  if (error) return { ok: false, message: error.message };
  return { ok: true, id: data.id };
}

export async function listPortfolioProperties(): Promise<{
  ok: true;
  properties: PortfolioProperty[];
} | { ok: false; message: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("portfolio_properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: error.message };
  return { ok: true, properties: (data ?? []) as PortfolioProperty[] };
}

export async function removePortfolioProperty(id: string): Promise<{ ok: boolean; message?: string }> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured." };

  const { error } = await supabase
    .from("portfolio_properties")
    .delete()
    .eq("id", id);

  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
