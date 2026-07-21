import { createWarehouseClient } from "./client";

export type GeographySearchResult = {
  geography_id: string;
  geography_type: "SAL" | "POA";
  geography_code: string;
  geography_name: string;
  state_code: string | null;
  has_suburb_snapshot: boolean;
  has_postcode_snapshot: boolean;
};

export type MarketSnapshot = {
  geography_id: string;
  geography_code: string;
  geography_name: string;
  state_code: string | null;
  latest_sales_period: string | null;
  latest_rent_period: string | null;
  latest_yield_period: string | null;
  latest_approvals_period: string | null;
  latest_demographics_period: number | null;
  snapshot_generated_at: string | null;
  coverage_status: "full" | "partial" | "insufficient" | null;
  sales_volume_12m: number | null;
  median_sale_price_12m: number | null;
  median_sale_price_prev_12m: number | null;
  annual_price_change_pct: number | null;
  median_sale_price_detached: number | null;
  median_sale_price_apartment: number | null;
  median_sale_price_townhouse: number | null;
  sales_sample_confidence: string | null;
  median_weekly_rent_latest: number | null;
  median_weekly_rent_prev: number | null;
  annual_rent_change_pct: number | null;
  rent_confidence: string | null;
  gross_yield_pct: number | null;
  yield_confidence: string | null;
  yield_sale_period_used: string | null;
  yield_rent_period_used: string | null;
  dwelling_stock_total: number | null;
  approvals_12m: number | null;
  approvals_per_1000_dwellings: number | null;
  approvals_detached_12m: number | null;
  approvals_other_residential_12m: number | null;
  supply_confidence: string | null;
  sales_turnover_pct: number | null;
  renter_household_pct: number | null;
  owner_occupier_pct: number | null;
  total_population: number | null;
  population_growth_2016_2021_pct: number | null;
  total_households: number | null;
  median_weekly_household_income: number | null;
  renter_share: number | null;
  owner_with_mortgage_share: number | null;
  price_to_income_ratio: number | null;
  rent_to_income_ratio: number | null;
  est_monthly_repayment_owner_occupier: number | null;
  est_monthly_repayment_investor: number | null;
  repayment_to_income_pct: number | null;
  rba_rate_used: number | null;
  rba_rate_period: string | null;
  assumption_scenario_code: string | null;
  affordability_confidence: string | null;
  confidence_label: string | null;
  data_quality_status: string | null;
  direct_or_derived: string | null;
  missing_metric_reasons: Record<string, string> | null;
};

export type DemographicProfile = {
  geography_id: string;
  geography_code: string;
  geography_name: string;
  state_code: string | null;
  census_year: number;
  total_population: number | null;
  population_2016: number | null;
  population_2021: number | null;
  population_growth_2016_2021_pct: number | null;
  median_age: number | null;
  total_households: number | null;
  family_households: number | null;
  lone_person_households: number | null;
  average_household_size: number | null;
  median_weekly_household_income: number | null;
  median_weekly_personal_income: number | null;
  median_weekly_family_income: number | null;
  census_median_weekly_rent: number | null;
  census_median_monthly_mortgage: number | null;
  renter_household_pct: number | null;
  owner_with_mortgage_pct: number | null;
  owner_outright_pct: number | null;
  occupied_dwelling_count: number | null;
  unoccupied_dwelling_count: number | null;
  detached_house_pct: number | null;
  apartment_unit_pct: number | null;
  geography_method: string | null;
  confidence_label: string | null;
  data_quality_status: string | null;
  missing_metric_reasons: Record<string, string> | null;
};

export type TimeseriesRow = {
  geography_id: string;
  geography_type: string;
  reference_period: string;
  period_type: string;
  dwelling_type: string | null;
  metric_family: "sales" | "rent" | "yield" | "approvals";
  transaction_count: number | null;
  median_sale_price: number | null;
  median_weekly_rent: number | null;
  gross_yield_percentage: number | null;
  approvals_count: number | null;
  rate_percent: number | null;
  confidence_label: string | null;
  source_dataset: string | null;
};

export type MetricAssumption = {
  scenario_code: string;
  assumption_name: string;
  numeric_value: number | null;
  text_value: string | null;
  unit: string | null;
  effective_from: string;
  effective_to: string | null;
  source_notes: string | null;
};

export async function searchGeography(query: string): Promise<GeographySearchResult[]> {
  const supabase = createWarehouseClient();
  if (!supabase || !query.trim()) return [];
  const { data, error } = await supabase
    .from("v_market_geography_search_v1")
    .select("*")
    .or(`geography_name.ilike.%${query}%,geography_code.ilike.${query}%`)
    .limit(25);
  if (error) return [];
  return (data ?? []) as GeographySearchResult[];
}

export async function getSuburbSnapshot(geographyId: string): Promise<MarketSnapshot | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("v_suburb_market_snapshot_v1").select("*").eq("geography_id", geographyId).maybeSingle();
  return (data as MarketSnapshot) ?? null;
}

export async function getPostcodeSnapshot(geographyId: string): Promise<MarketSnapshot | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("v_postcode_market_snapshot_v1").select("*").eq("geography_id", geographyId).maybeSingle();
  return (data as MarketSnapshot) ?? null;
}

export async function getSuburbDemographics(geographyId: string): Promise<DemographicProfile | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("v_suburb_demographic_profile_v1").select("*").eq("geography_id", geographyId).maybeSingle();
  return (data as DemographicProfile) ?? null;
}

export async function getPostcodeDemographics(geographyId: string): Promise<DemographicProfile | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data } = await supabase.from("v_postcode_demographic_profile_v1").select("*").eq("geography_id", geographyId).maybeSingle();
  return (data as DemographicProfile) ?? null;
}

// Display-layer recency window. NOTE: mart.suburb_market_timeseries /
// mart.postcode_market_timeseries turned out to hold more history than
// intended for the 'sales' metric family (inherited from
// mart.suburb_sales_monthly, which on this branch spans 1996-2026, not the
// trailing-12-months this sprint's capacity plan assumed — see
// market_intelligence_branch_load_report.md's "known discrepancy" note).
// This sprint's hard rules forbid DELETE, so the extra historical rows stay
// in the table; this client-side slice keeps the UI's "recent trend"
// promise honest without touching the database.
const SALES_TREND_MONTHS = 12;
const RENT_YIELD_TREND_MONTHS = 24;

export async function getTimeseries(geographyId: string): Promise<TimeseriesRow[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_market_timeseries_v1", { p_geography_id: geographyId });
  if (error) return [];
  const rows = (data ?? []) as TimeseriesRow[];
  const now = Date.now();
  const salesCutoff = now - SALES_TREND_MONTHS * 31 * 24 * 60 * 60 * 1000;
  const rentYieldCutoff = now - RENT_YIELD_TREND_MONTHS * 31 * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    const t = new Date(r.reference_period).getTime();
    if (r.metric_family === "sales") return t >= salesCutoff;
    if (r.metric_family === "rent" || r.metric_family === "yield") return t >= rentYieldCutoff;
    return true;
  });
}

export async function getMetricAssumptions(): Promise<MetricAssumption[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("v_metric_assumptions_v1").select("*");
  if (error) return [];
  return (data ?? []) as MetricAssumption[];
}

export async function resolveGeographyByCode(type: "SAL" | "POA", code: string): Promise<GeographySearchResult | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("v_market_geography_search_v1")
    .select("*")
    .eq("geography_type", type)
    .eq("geography_code", code)
    .maybeSingle();
  return (data as GeographySearchResult) ?? null;
}

// ── Sprint 10 — multi-state (NSW + VIC) v2 interfaces ──────────────────────

export type GeographySearchResultV2 = {
  geography_id: string;
  geography_type: "SAL" | "POA";
  geography_code: string;
  geography_name: string;
  jurisdiction: "NSW" | "VIC" | null;
  has_suburb_snapshot: boolean;
  has_postcode_snapshot: boolean;
};

export async function searchGeographiesV2(params: {
  query?: string;
  jurisdiction?: "NSW" | "VIC";
  geographyType?: "SAL" | "POA";
  limit?: number;
}): Promise<GeographySearchResultV2[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("search_market_geographies_v2", {
    p_query: params.query ?? null,
    p_jurisdiction: params.jurisdiction ?? null,
    p_geography_type: params.geographyType ?? null,
    p_limit: params.limit ?? 20,
  });
  if (error) return [];
  return (data ?? []) as GeographySearchResultV2[];
}

export type MarketSnapshotV2 = MarketSnapshot & { jurisdiction: "NSW" | "VIC" | null; geography_method: string | null };

export async function getMarketSnapshotV2(geographyId: string): Promise<MarketSnapshotV2 | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_market_snapshot_v2", { p_geography_id: geographyId }).maybeSingle();
  if (error) return null;
  return (data as MarketSnapshotV2) ?? null;
}

export type CompareRow = {
  geography_id: string;
  geography_code: string;
  geography_name: string;
  jurisdiction: "NSW" | "VIC" | null;
  geography_type: "SAL" | "POA" | null;
  latest_sales_period: string | null;
  latest_rent_period: string | null;
  median_sale_price_12m: number | null;
  annual_price_change_pct: number | null;
  sales_sample_confidence: string | null;
  median_weekly_rent_latest: number | null;
  annual_rent_change_pct: number | null;
  rent_confidence: string | null;
  gross_yield_pct: number | null;
  yield_confidence: string | null;
  dwelling_stock_total: number | null;
  approvals_per_1000_dwellings: number | null;
  total_population: number | null;
  median_weekly_household_income: number | null;
  price_to_income_ratio: number | null;
  est_monthly_repayment_owner_occupier: number | null;
  confidence_label: string | null;
  missing_metric_reasons: Record<string, string> | null;
};

export async function compareMarketGeographies(geographyIds: string[]): Promise<CompareRow[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  if (geographyIds.length < 2 || geographyIds.length > 5) return [];
  const { data, error } = await supabase.rpc("compare_market_geographies_v1", { p_geography_ids: geographyIds });
  if (error) return [];
  return (data ?? []) as CompareRow[];
}

export type TimeseriesRowV2 = TimeseriesRow & { jurisdiction: "NSW" | "VIC" | null; state_code: string | null };

export async function getTimeseriesV2(geographyId: string): Promise<TimeseriesRowV2[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_market_timeseries_v2", { p_geography_id: geographyId });
  if (error) return [];
  const rows = (data ?? []) as TimeseriesRowV2[];
  const now = Date.now();
  const salesCutoff = now - SALES_TREND_MONTHS * 31 * 24 * 60 * 60 * 1000;
  const rentYieldCutoff = now - RENT_YIELD_TREND_MONTHS * 31 * 24 * 60 * 60 * 1000;
  return rows.filter((r) => {
    const t = new Date(r.reference_period).getTime();
    if (r.metric_family === "sales") return t >= salesCutoff;
    if (r.metric_family === "rent" || r.metric_family === "yield") return t >= rentYieldCutoff;
    return true;
  });
}
