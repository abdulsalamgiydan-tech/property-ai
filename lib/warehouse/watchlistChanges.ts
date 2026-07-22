/**
 * Pure, idempotent change-detection logic for watchlist geographies
 * (Sprint 13 WS9). Given a previously-recorded snapshot and the current
 * one, returns the list of meaningful changes — the caller is
 * responsible for persisting them exactly once per real transition
 * (natural-key upsert, see app/api/watchlist/refresh-changes/route.ts).
 *
 * Calling detectWatchlistChanges(a, b) twice with the same a/b always
 * returns the same events (pure function, no I/O, no clock reads except
 * where explicitly passed in) — that's what makes downstream persistence
 * idempotent, not this function itself.
 */

export type SnapshotDiffInput = {
  latest_sales_period: string | null;
  latest_rent_period: string | null;
  latest_yield_period: string | null;
  latest_approvals_period: string | null;
  median_sale_price_12m: number | null;
  median_weekly_rent_latest: number | null;
  gross_yield_pct: number | null;
  approvals_12m: number | null;
  sales_sample_confidence: string | null;
  rent_confidence: string | null;
  yield_confidence: string | null;
  supply_confidence: string | null;
};

export type ChangeEventType =
  | "new_source_period"
  | "median_price_movement"
  | "median_rent_movement"
  | "yield_movement"
  | "approvals_movement"
  | "confidence_upgrade"
  | "confidence_downgrade"
  | "metric_newly_available"
  | "metric_newly_unavailable";

export type ChangeEvent = {
  event_type: ChangeEventType;
  metric_family: "sales" | "rent" | "yield" | "approvals";
  description: string;
  previous_value: string | null;
  new_value: string | null;
};

/** Meaningful-movement thresholds — below this, don't surface noise as a "change". */
const MOVEMENT_THRESHOLD_PCT = 1;

const CONFIDENCE_RANK: Record<string, number> = {
  insufficient_data: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function pctChange(previous: number, current: number): number {
  if (previous === 0) return current === 0 ? 0 : Infinity;
  return ((current - previous) / previous) * 100;
}

function movementEvent(
  family: ChangeEvent["metric_family"],
  type: ChangeEventType,
  label: string,
  previous: number | null,
  current: number | null,
  isPercent: boolean
): ChangeEvent | null {
  if (previous == null || current == null) return null;
  const change = pctChange(previous, current);
  if (!Number.isFinite(change) || Math.abs(change) < MOVEMENT_THRESHOLD_PCT) return null;
  const direction = change >= 0 ? "rose" : "fell";
  return {
    event_type: type,
    metric_family: family,
    description: `${label} ${direction} ${Math.abs(change).toFixed(1)}%`,
    previous_value: isPercent ? `${previous.toFixed(2)}%` : String(previous),
    new_value: isPercent ? `${current.toFixed(2)}%` : String(current),
  };
}

function periodEvent(
  family: ChangeEvent["metric_family"],
  label: string,
  previous: string | null,
  current: string | null
): ChangeEvent | null {
  if (current == null || previous === current) return null;
  if (previous == null) return null; // first time this period is seen at all — availability event covers it, not a "new period"
  return {
    event_type: "new_source_period",
    metric_family: family,
    description: `New ${label} data available (${current})`,
    previous_value: previous,
    new_value: current,
  };
}

function confidenceEvent(
  family: ChangeEvent["metric_family"],
  previous: string | null,
  current: string | null
): ChangeEvent | null {
  if (previous == null || current == null || previous === current) return null;
  const prevRank = CONFIDENCE_RANK[previous];
  const curRank = CONFIDENCE_RANK[current];
  if (prevRank == null || curRank == null) return null;
  const upgraded = curRank > prevRank;
  return {
    event_type: upgraded ? "confidence_upgrade" : "confidence_downgrade",
    metric_family: family,
    description: `${family[0].toUpperCase()}${family.slice(1)} confidence ${upgraded ? "improved" : "dropped"} from ${previous} to ${current}`,
    previous_value: previous,
    new_value: current,
  };
}

function availabilityEvent(
  family: ChangeEvent["metric_family"],
  label: string,
  previous: number | null,
  current: number | null
): ChangeEvent | null {
  if (previous == null && current != null) {
    return {
      event_type: "metric_newly_available",
      metric_family: family,
      description: `${label} is now available`,
      previous_value: null,
      new_value: String(current),
    };
  }
  if (previous != null && current == null) {
    return {
      event_type: "metric_newly_unavailable",
      metric_family: family,
      description: `${label} is no longer available`,
      previous_value: String(previous),
      new_value: null,
    };
  }
  return null;
}

export function detectWatchlistChanges(
  previous: SnapshotDiffInput | null,
  current: SnapshotDiffInput
): ChangeEvent[] {
  // No prior snapshot means this is the first check — it establishes the
  // baseline, it is not itself a "change" (nothing to compare against).
  if (!previous) return [];

  const events: (ChangeEvent | null)[] = [
    periodEvent("sales", "sales", previous.latest_sales_period, current.latest_sales_period),
    periodEvent("rent", "rent", previous.latest_rent_period, current.latest_rent_period),
    periodEvent("yield", "yield", previous.latest_yield_period, current.latest_yield_period),
    periodEvent("approvals", "building approvals", previous.latest_approvals_period, current.latest_approvals_period),

    movementEvent("sales", "median_price_movement", "Median sale price", previous.median_sale_price_12m, current.median_sale_price_12m, false),
    movementEvent("rent", "median_rent_movement", "Median weekly rent", previous.median_weekly_rent_latest, current.median_weekly_rent_latest, false),
    movementEvent("yield", "yield_movement", "Gross yield", previous.gross_yield_pct, current.gross_yield_pct, true),
    movementEvent("approvals", "approvals_movement", "Building approvals (12m)", previous.approvals_12m, current.approvals_12m, false),

    confidenceEvent("sales", previous.sales_sample_confidence, current.sales_sample_confidence),
    confidenceEvent("rent", previous.rent_confidence, current.rent_confidence),
    confidenceEvent("yield", previous.yield_confidence, current.yield_confidence),
    confidenceEvent("approvals", previous.supply_confidence, current.supply_confidence),

    availabilityEvent("sales", "Median sale price", previous.median_sale_price_12m, current.median_sale_price_12m),
    availabilityEvent("rent", "Median weekly rent", previous.median_weekly_rent_latest, current.median_weekly_rent_latest),
    availabilityEvent("yield", "Gross yield", previous.gross_yield_pct, current.gross_yield_pct),
    availabilityEvent("approvals", "Building approvals", previous.approvals_12m, current.approvals_12m),
  ];

  return events.filter((e): e is ChangeEvent => e !== null);
}
