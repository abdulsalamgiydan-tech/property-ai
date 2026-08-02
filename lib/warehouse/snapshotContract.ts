import type { MarketSnapshot, MarketSnapshotV2 } from "@/lib/warehouse/queries";

/**
 * Fields that live in `mart.{suburb,postcode}_market_snapshot` (and are already
 * exposed by the deployed, RLS-granted `v_{suburb,postcode}_market_snapshot_v1`
 * views) but are NOT in the `get_market_snapshot_v2` RPC's `RETURNS TABLE`
 * contract. Because `/research/suburb|postcode/[id]` reads the snapshot from the
 * v2 RPC, every one of these renders as "Unavailable" in the UI even though the
 * warehouse holds a real value — e.g. for Calderwood (SAL_10749_ASGS3_2021) the
 * view returns est_monthly_repayment_investor=5632.99, rba_rate_used=6.2,
 * rba_rate_period=2026-05-31, sales_turnover_pct=16.8, direct_or_derived=direct.
 *
 * This list is the authoritative record of the contract gap; migration
 * `055_widen_get_market_snapshot_v2` (prepared, unapplied) widens the RPC to
 * return them, and until that is applied `fillMissingSnapshotFields` back-fills
 * them from the view at query time so the fix works without a schema change.
 */
export const V2_OMITTED_SNAPSHOT_FIELDS = [
  "median_sale_price_prev_12m",
  "yield_sale_period_used",
  "yield_rent_period_used",
  "approvals_detached_12m",
  "approvals_other_residential_12m",
  "sales_turnover_pct",
  "renter_household_pct",
  "owner_occupier_pct",
  "rent_to_income_ratio",
  "est_monthly_repayment_investor",
  "rba_rate_used",
  "rba_rate_period",
  "assumption_scenario_code",
  "data_quality_status",
  "direct_or_derived",
] as const satisfies readonly (keyof MarketSnapshot)[];

/**
 * Merges a snapshot fetched from the jurisdiction-aware `get_market_snapshot_v2`
 * RPC (`primary`) with the same geography's row from the full
 * `v_*_market_snapshot_v1` view (`fallback`), filling ONLY fields that are
 * absent/null on the primary. Both come from the identical underlying mart row,
 * so this never mixes geographies or invents values — it only recovers fields
 * the RPC contract drops. Populated primary values are always preserved.
 */
export function fillMissingSnapshotFields(
  primary: MarketSnapshotV2 | null,
  fallback: MarketSnapshot | null
): MarketSnapshotV2 | null {
  if (!primary && !fallback) return null;
  // If the RPC returned nothing, fall back to the view row entirely (it lacks
  // only jurisdiction/geography_method, which the UI does not read).
  if (!primary) {
    return { ...(fallback as MarketSnapshot), jurisdiction: null, geography_method: null } as MarketSnapshotV2;
  }
  if (!fallback) return primary;

  const merged: MarketSnapshotV2 = { ...primary };
  for (const key of Object.keys(fallback) as (keyof MarketSnapshot)[]) {
    const current = (merged as Record<string, unknown>)[key];
    const fromView = (fallback as Record<string, unknown>)[key];
    if ((current === undefined || current === null) && fromView !== undefined && fromView !== null) {
      (merged as Record<string, unknown>)[key] = fromView;
    }
  }
  return merged;
}
