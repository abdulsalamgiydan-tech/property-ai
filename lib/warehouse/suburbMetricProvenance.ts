/**
 * Serving bridge: a warehouse `MarketSnapshot` → per-metric provenance for the
 * `/research/suburb/[geographyCode]` UI. Composes `metricProvenance.ts` (no
 * parallel data system) so price/rent/yield/growth each render with value, unit,
 * direct/derived/unavailable status, source, period, freshness, confidence and an
 * honest missing reason.
 *
 * Honesty invariants preserved here:
 *  - a null snapshot value renders as "unavailable" with a reason, NEVER as 0;
 *  - yield & 12-month growth are DERIVED (never labelled direct);
 *  - a suburb median is never presented as a specific property's valuation.
 */
import {
  toMetricProvenance,
  type MetricObservation,
  type MetricProvenance,
  type SourceRegistryEntry,
} from "./metricProvenance";

/** Only the snapshot fields this bridge needs (a MarketSnapshot satisfies it). */
export type SnapshotForProvenance = {
  state_code?: string | null;
  median_sale_price_12m: number | null;
  annual_price_change_pct: number | null;
  median_weekly_rent_latest: number | null;
  gross_yield_pct: number | null;
  latest_sales_period: string | null;
  latest_rent_period: string | null;
  latest_yield_period: string | null;
};

/** Registered primary source per state for direct observations (from v3 registry). */
const STATE_SALES_SOURCE: Record<string, string> = {
  SA: "sa_metro_median_house_sales",
  VIC: "vic_vg_property_sales",
  NSW: "nsw_vg_bulk_psi",
};
const STATE_RENT_SOURCE: Record<string, string> = {
  SA: "sa_private_rental_report",
  VIC: "vic_dffh_moving_annual_rent",
  QLD: "qld_rta_median_rents",
  WA: "wa_rental_bonds",
  TAS: "tas_rental_bonds",
};

export type SuburbMetricProvenance = {
  salePrice: MetricProvenance;
  weeklyRent: MetricProvenance;
  grossYield: MetricProvenance;
  annualGrowth: MetricProvenance;
};

function obs(base: MetricObservation): MetricObservation {
  return base;
}

export function resolveSuburbMetricProvenance(
  snapshot: SnapshotForProvenance,
  registry: ReadonlyArray<SourceRegistryEntry>,
  now: Date,
): SuburbMetricProvenance {
  const state = (snapshot.state_code ?? "").toUpperCase();
  const salesSource = STATE_SALES_SOURCE[state] ?? null;
  const rentSource = STATE_RENT_SOURCE[state] ?? null;

  const salePrice = toMetricProvenance(
    obs({
      metric: "median_sale_price_overall",
      value: snapshot.median_sale_price_12m,
      unit: "AUD",
      propertyType: "all",
      reportingPeriod: snapshot.latest_sales_period,
      sourceId: salesSource,
      sourcePublished: snapshot.latest_sales_period,
      classification: "direct",
      missingReason: salesSource
        ? undefined
        : `No registered sale-price source for ${state || "this state"} — suburb sale medians unavailable.`,
    }),
    registry,
    now,
  );

  const weeklyRent = toMetricProvenance(
    obs({
      metric: "median_weekly_rent",
      value: snapshot.median_weekly_rent_latest,
      unit: "AUD/week",
      propertyType: "all",
      reportingPeriod: snapshot.latest_rent_period,
      sourceId: rentSource,
      sourcePublished: snapshot.latest_rent_period,
      classification: "direct",
      missingReason: rentSource
        ? undefined
        : `No registered rent source for ${state || "this state"} — suburb rent medians unavailable.`,
    }),
    registry,
    now,
  );

  const grossYield = toMetricProvenance(
    obs({
      metric: "gross_yield",
      value: snapshot.gross_yield_pct,
      unit: "%",
      propertyType: "all",
      reportingPeriod: snapshot.latest_yield_period,
      sourceId: null, // derived, not a primary source read
      sourcePublished: snapshot.latest_yield_period,
      classification: "derived",
      method: "gross_yield = median_weekly_rent × 52 ÷ median_sale_price",
      missingReason: "Gross yield needs both a sale-price and a rent observation for this suburb.",
    }),
    registry,
    now,
  );

  const annualGrowth = toMetricProvenance(
    obs({
      metric: "annual_price_growth_12m",
      value: snapshot.annual_price_change_pct,
      unit: "%",
      propertyType: "all",
      reportingPeriod: snapshot.latest_sales_period,
      sourceId: null,
      sourcePublished: snapshot.latest_sales_period,
      classification: "derived",
      method: "12-month change in median sale price vs the prior 12 months",
      missingReason: "12-month growth needs sale-price medians for two comparable periods.",
    }),
    registry,
    now,
  );

  return { salePrice, weeklyRent, grossYield, annualGrowth };
}
