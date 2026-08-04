import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { CandidateRow, PropertyType } from "./types";

/**
 * Server-side fetch of scoring candidates via the least-privilege consumer RPC
 * `get_investment_candidates_v1`. Uses the anon/authenticated client on purpose —
 * the RPC is SECURITY DEFINER and is the ONLY path to the internal scoring inputs.
 *
 * Returns null when the RPC is unavailable (e.g. migration 059 not yet applied to
 * this environment), so callers can honestly surface a "coverage not yet available"
 * state rather than inventing data.
 */
export async function fetchCandidateRows(
  jurisdiction: string,
  propertyType: PropertyType,
): Promise<CandidateRow[] | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("get_investment_candidates_v1", {
    p_jurisdiction: jurisdiction,
    p_property_type: propertyType,
  });
  if (error) return null;
  const rows = (data ?? []) as Array<{
    geography_id: string;
    jurisdiction: string;
    property_type: PropertyType;
    metrics: CandidateRow["metrics"];
  }>;
  return rows.map((r) => ({
    geography_id: r.geography_id,
    jurisdiction: r.jurisdiction,
    property_type: r.property_type,
    suburb_name: null,
    metrics: r.metrics,
    // Optional evidence is surfaced in the drawer via get_market_snapshot_v2;
    // v1 does not fold it into ranked confidence (documented in the scoring spec).
    hasSupplyEvidence: false,
    hasDemographicEvidence: false,
  }));
}
