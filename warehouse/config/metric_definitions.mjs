/**
 * Metric-definition registry (Warehouse Coverage Maximiser V1).
 *
 * The single source of truth for what each suburb metric IS and the rules that
 * govern it: unit, allowed geography levels, allowed property types / bedroom
 * groupings, direct→derived source precedence, calculation formula, minimum
 * sample, freshness SLA, display label, and whether contextual (postcode/SA2/
 * LGA) fallback is permitted. The Coverage Maximiser reads this to reproduce
 * coverage, generate the gap ledger, and rank opportunities. Additive config —
 * no migration required.
 *
 * `column` names the field in v_suburb_market_snapshot_v1 used to measure
 * current DIRECT coverage; derived metrics also list `derivedFrom`.
 */

export const GEOGRAPHY_LEVELS = ["suburb", "postcode", "sa2", "lga", "state"];
export const PROPERTY_TYPES = ["house", "unit", "land", "all"];

export const METRIC_DEFINITIONS = [
  {
    key: "median_house_price",
    label: "Median house price",
    unit: "AUD",
    column: "median_sale_price_detached",
    allowedGeographyLevels: ["suburb", "postcode", "sa2", "lga"],
    allowedPropertyTypes: ["house"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["propellect_suburb", "official_suburb", "postcode_context"],
    kind: "direct",
    minSample: 10,
    freshnessSlaDays: 120,
    contextualFallback: true,
  },
  {
    key: "median_unit_price",
    label: "Median unit price",
    unit: "AUD",
    column: "median_sale_price_apartment",
    allowedGeographyLevels: ["suburb", "postcode", "sa2", "lga"],
    allowedPropertyTypes: ["unit"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["propellect_suburb", "official_suburb", "postcode_context"],
    kind: "direct",
    minSample: 10,
    freshnessSlaDays: 120,
    contextualFallback: true,
  },
  {
    key: "median_house_rent",
    label: "Median house rent (weekly)",
    unit: "AUD/week",
    column: "median_weekly_rent_latest",
    allowedGeographyLevels: ["suburb", "postcode", "lga"],
    allowedPropertyTypes: ["house"],
    bedroomGroupings: ["all", "1", "2", "3", "4+"],
    sourcePrecedence: ["propellect_suburb", "official_suburb", "postcode_context"],
    kind: "direct",
    minSample: 10,
    freshnessSlaDays: 120,
    contextualFallback: true,
  },
  {
    key: "gross_yield",
    label: "Gross rental yield",
    unit: "%",
    column: "gross_yield_pct",
    allowedGeographyLevels: ["suburb", "postcode"],
    allowedPropertyTypes: ["house", "unit"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["derived_same_geo_same_type"],
    kind: "derived",
    derivedFrom: ["median_sale_price", "median_weekly_rent"],
    formula: "median_weekly_rent * 52 / median_sale_price * 100",
    minSample: 10,
    freshnessSlaDays: 120,
    contextualFallback: false, // never suburb price ÷ postcode rent
  },
  {
    key: "growth_12m",
    label: "12-month price change (cumulative)",
    unit: "%",
    column: "annual_price_change_pct",
    allowedGeographyLevels: ["suburb", "postcode"],
    allowedPropertyTypes: ["house", "unit"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["derived_rolling_windows"],
    kind: "derived",
    derivedFrom: ["rolling_12m_median_current", "rolling_12m_median_prior"],
    formula: "(current_median / prior_median - 1) * 100",
    minSample: 10,
    freshnessSlaDays: 120,
    contextualFallback: false,
  },
  ...[3, 5, 10].flatMap((y) => [
    {
      key: `growth_${y}yr_cumulative`,
      label: `${y}-year price change (cumulative)`,
      unit: "%",
      column: null, // not materialised in the snapshot — recovery target
      allowedGeographyLevels: ["suburb"],
      allowedPropertyTypes: ["house", "unit"],
      bedroomGroupings: ["all"],
      sourcePrecedence: ["derived_rolling_windows"],
      kind: "derived",
      derivedFrom: ["rolling_12m_median_current", `rolling_12m_median_${y}y_prior`],
      formula: "(current_median / prior_median - 1) * 100",
      minSample: 10,
      freshnessSlaDays: 180,
      contextualFallback: false,
    },
    {
      key: `growth_${y}yr_cagr`,
      label: `${y}-year price growth (CAGR)`,
      unit: "%/yr",
      column: null,
      allowedGeographyLevels: ["suburb"],
      allowedPropertyTypes: ["house", "unit"],
      bedroomGroupings: ["all"],
      sourcePrecedence: ["derived_rolling_windows"],
      kind: "derived",
      derivedFrom: ["rolling_12m_median_current", `rolling_12m_median_${y}y_prior`],
      formula: "(current_median / prior_median) ^ (1/years) - 1) * 100",
      minSample: 10,
      freshnessSlaDays: 180,
      contextualFallback: false,
    },
  ]),
  {
    key: "sales_volume_12m",
    label: "Sales volume (12m)",
    unit: "count",
    column: "sales_volume_12m",
    allowedGeographyLevels: ["suburb", "postcode"],
    allowedPropertyTypes: ["all"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["propellect_suburb", "official_suburb"],
    kind: "direct",
    minSample: 1,
    freshnessSlaDays: 120,
    contextualFallback: false,
  },
  {
    key: "vacancy_rate",
    label: "Rental vacancy rate",
    unit: "%",
    column: null, // NOT in the warehouse; no reusable official source found
    allowedGeographyLevels: ["suburb", "postcode"],
    allowedPropertyTypes: ["all"],
    bedroomGroupings: ["all"],
    sourcePrecedence: [],
    kind: "unsourced",
    minSample: 10,
    freshnessSlaDays: 90,
    contextualFallback: false,
    note: "No free official current-vacancy source; must NOT be estimated from bonds or Census unoccupied dwellings.",
  },
  {
    key: "days_on_market",
    label: "Days on market",
    unit: "days",
    column: null,
    allowedGeographyLevels: ["suburb", "postcode"],
    allowedPropertyTypes: ["house", "unit"],
    bedroomGroupings: ["all"],
    sourcePrecedence: [],
    kind: "unsourced",
    minSample: 10,
    freshnessSlaDays: 90,
    contextualFallback: false,
    note: "Requires listing start dates; no free official source. Must NOT be estimated without them.",
  },
  {
    key: "population",
    label: "Population",
    unit: "persons",
    column: "total_population",
    allowedGeographyLevels: ["suburb", "sa2"],
    allowedPropertyTypes: ["all"],
    bedroomGroupings: ["all"],
    sourcePrecedence: ["abs_census_sal"],
    kind: "direct",
    minSample: 0,
    freshnessSlaDays: 1825,
    contextualFallback: false,
  },
];

/** Convenience: metrics whose current DIRECT coverage is measurable from the snapshot view. */
export const SNAPSHOT_MEASURABLE = METRIC_DEFINITIONS.filter((m) => m.column);
