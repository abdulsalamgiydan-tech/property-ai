import { createWarehouseClient } from "./client";
import { csvCell } from "@/lib/export/csvSafety";
import { fillMissingSnapshotFields } from "./snapshotContract";

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

export type DatasetFreshness = {
  dataset_id: string;
  jurisdiction: "NSW" | "VIC" | null;
  dataset_name: string | null;
  publisher: string | null;
  latest_source_period: string | null;
  last_retrieved_at: string | null;
  last_successful_validation_at: string | null;
  expected_cadence_days: number | null;
  freshness_status: "current" | "due" | "stale" | "failed" | "blocked" | "manual_review" | string;
  current_branch_row_count: number | null;
  last_failure_summary: string | null;
  local_only_or_branch_published: "local_only" | "branch_published" | null;
  source_url: string | null;
  computed_at: string;
};

export async function getDatasetFreshness(): Promise<DatasetFreshness[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("v_dataset_freshness_v1").select("*").order("dataset_id");
  if (error) return [];
  return (data ?? []) as DatasetFreshness[];
}

// ── Sprint 11 Workstream 16 — data operations console expansion ────────────

export type OperationsSummary = {
  total_datasets: number;
  branch_published_count: number;
  local_only_count: number;
  blocked_or_unsupported_count: number;
  branch_db_size_mb: number;
  last_run_started_at: string | null;
  last_run_status: string | null;
  runs_last_30_days: number;
  runs_failed_last_30_days: number;
};

export async function getOperationsSummary(): Promise<OperationsSummary | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_warehouse_operations_summary_v1").maybeSingle();
  if (error) return null;
  return (data as OperationsSummary) ?? null;
}

export type RefreshRunHistoryRow = {
  refresh_run_id: string;
  dataset_id: string;
  dataset_name: string | null;
  mode: string;
  status: string;
  target: string;
  started_at: string;
  completed_at: string | null;
  rows_affected: number | null;
  error_summary: string | null;
  duration_seconds: number | null;
};

export async function getRefreshRunHistory(): Promise<RefreshRunHistoryRow[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("v_refresh_run_history_v1").select("*");
  if (error) return [];
  return (data ?? []) as RefreshRunHistoryRow[];
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

// The `get_market_snapshot_v2` RPC's RETURNS TABLE contract omits ~15 columns
// that mart storage (and the `v_*_market_snapshot_v1` views) actually hold —
// investor repayment, RBA rate/period, sales turnover, direct-vs-derived, data
// quality status, etc. The suburb/postcode research pages read the RPC, so
// those render as "Unavailable" despite real values existing. Until migration
// 055 widens the RPC, this back-fills the dropped fields from the already-
// deployed view for the SAME geography (no geography mixing, no invented data).
// See lib/warehouse/snapshotContract.ts.
export async function getEnrichedMarketSnapshot(
  geographyId: string,
  geographyType: "SAL" | "POA"
): Promise<MarketSnapshotV2 | null> {
  const [v2, view] = await Promise.all([
    getMarketSnapshotV2(geographyId),
    geographyType === "SAL" ? getSuburbSnapshot(geographyId) : getPostcodeSnapshot(geographyId),
  ]);
  return fillMissingSnapshotFields(v2, view);
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

// Widened from 2-5 to 2-10 geographies in Sprint 11 Workstream 12 —
// matches the compare_market_geographies_v1 RPC's own enforced range
// (migration 021), which is the actual source of truth for this limit.
export async function compareMarketGeographies(geographyIds: string[]): Promise<CompareRow[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  if (geographyIds.length < 2 || geographyIds.length > 10) return [];
  const { data, error } = await supabase.rpc("compare_market_geographies_v1", { p_geography_ids: geographyIds });
  if (error) return [];
  return (data ?? []) as CompareRow[];
}

// ── Sprint 11 Workstream 11 — national map explorer ────────────────────────

export type MapMarker = {
  geography_id: string;
  geography_type: "SAL" | "POA" | "LGA";
  geography_code: string;
  geography_name: string;
  state_code: string | null;
  jurisdiction: "NSW" | "VIC" | "QLD" | "SA" | "WA" | null;
  centroid_lat: number;
  centroid_lon: number;
  median_sale_price_12m: number | null;
  sales_confidence: string | null;
  median_weekly_rent_latest: number | null;
  rent_confidence: string | null;
  has_full_snapshot: boolean;
};

export type MapBounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

export async function getMapMarkers(
  bounds: MapBounds,
  geographyType?: "SAL" | "POA" | "LGA",
  limit = 500
): Promise<MapMarker[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("get_market_map_markers_v1", {
    p_min_lat: bounds.minLat,
    p_max_lat: bounds.maxLat,
    p_min_lon: bounds.minLon,
    p_max_lon: bounds.maxLon,
    p_geography_type: geographyType ?? null,
    p_limit: limit,
  });
  if (error) return [];
  return (data ?? []) as MapMarker[];
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

// ── Sprint 12 WS11 — versioned public API v1: exposes WS8's per-metric
// lineage and WS9's quality summary, previously only queryable via a
// service-role warehouse script. ────────────────────────────────────────

export type MetricLineage = {
  found: boolean;
  jurisdiction: string | null;
  row_confidence: string | null;
  row_provenance: Record<string, string | null> | null;
  is_derived: boolean | null;
  transformation_method: string | null;
  correspondence_version: string | null;
  source_name: string | null;
  publisher: string | null;
  source_url: string | null;
  licence: string | null;
  dataset_name: string | null;
  lineage_complete: boolean;
};

export const METRIC_FAMILIES = ["sales", "rent", "yield", "approvals", "dwelling_stock", "demographics", "population_growth", "affordability"] as const;
export type MetricFamily = (typeof METRIC_FAMILIES)[number];

export async function getMetricLineage(
  geographyId: string,
  martTable: "suburb_market_snapshot" | "postcode_market_snapshot",
  metricFamily: MetricFamily
): Promise<MetricLineage | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc("get_metric_lineage_v1", { p_geography_id: geographyId, p_mart_table: martTable, p_metric_family: metricFamily })
    .maybeSingle();
  if (error) return null;
  return (data as MetricLineage) ?? null;
}

export type QualitySummary = {
  active_rules: number;
  blocking_rules: number;
  advisory_rules: number;
  rules_run: number | null;
  rules_passed: number | null;
  rules_failed_blocking: number | null;
  rules_failed_advisory: number | null;
  latest_run_at: string | null;
  open_incidents: number;
  open_blocking_incidents: number;
  quarantined_rows_total: number;
};

export async function getQualitySummary(): Promise<QualitySummary | null> {
  const supabase = createWarehouseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("v_quality_summary_v1").select("*").maybeSingle();
  if (error) return null;
  return (data as QualitySummary) ?? null;
}

// ── Sprint 12 WS13 — export and reproducibility ─────────────────────────
// Bundles a geography's snapshot + timeseries + per-metric-family lineage
// into one self-contained, independently-checkable export. "Reproducible"
// here means every number in the export carries enough of its own
// methodology (source, publisher, licence, transformation, confidence)
// that a reader could go re-derive it from the same public source without
// needing this application at all -- not just a raw numbers dump.

export type ExportBundle = {
  geography_id: string;
  mart_table: "suburb_market_snapshot" | "postcode_market_snapshot";
  exported_at: string;
  snapshot: MarketSnapshotV2 | null;
  timeseries: TimeseriesRowV2[];
  lineage: Partial<Record<MetricFamily, MetricLineage>>;
};

function inferMartTable(geographyId: string): "suburb_market_snapshot" | "postcode_market_snapshot" {
  return geographyId.startsWith("POA_") ? "postcode_market_snapshot" : "suburb_market_snapshot";
}

// Which METRIC_FAMILIES are worth fetching lineage for, based on which
// snapshot fields are actually populated -- avoids firing 8 lineage
// lookups when only 2-3 metric families have any data for this geography.
function populatedMetricFamilies(snapshot: MarketSnapshotV2 | null): MetricFamily[] {
  if (!snapshot) return [];
  const present: MetricFamily[] = [];
  if (snapshot.median_sale_price_12m != null) present.push("sales");
  if (snapshot.median_weekly_rent_latest != null) present.push("rent");
  if (snapshot.gross_yield_pct != null) present.push("yield");
  if (snapshot.approvals_12m != null) present.push("approvals");
  if (snapshot.dwelling_stock_total != null) present.push("dwelling_stock");
  if (snapshot.total_population != null) present.push("demographics");
  if (snapshot.population_growth_2016_2021_pct != null) present.push("population_growth");
  if (snapshot.est_monthly_repayment_owner_occupier != null) present.push("affordability");
  return present;
}

export async function getExportBundle(geographyId: string): Promise<ExportBundle> {
  const martTable = inferMartTable(geographyId);
  const [snapshot, timeseries] = await Promise.all([getMarketSnapshotV2(geographyId), getTimeseriesV2(geographyId)]);
  const families = populatedMetricFamilies(snapshot);
  const lineageResults = await Promise.all(families.map((f) => getMetricLineage(geographyId, martTable, f)));
  const lineage: Partial<Record<MetricFamily, MetricLineage>> = {};
  families.forEach((f, i) => {
    if (lineageResults[i]) lineage[f] = lineageResults[i]!;
  });
  return { geography_id: geographyId, mart_table: martTable, exported_at: new Date().toISOString(), snapshot, timeseries, lineage };
}

// ── Sprint 12 WS5 — research evidence catalogue ─────────────────────────

export type EvidenceCatalogueEntry = {
  source_id: string;
  source_name: string;
  publisher: string;
  source_category: string;
  official_or_independent: string;
  source_url: string | null;
  licence: string | null;
  access_method: string | null;
  update_frequency: string | null;
  implementation_status: string;
  known_limitations: string | null;
  dataset_count: number;
  published_metric_family_count: number;
};

export async function getEvidenceCatalogue(): Promise<EvidenceCatalogueEntry[]> {
  const supabase = createWarehouseClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("v_evidence_catalogue_v1").select("*");
  if (error) return [];
  return (data ?? []) as EvidenceCatalogueEntry[];
}

export function exportBundleToCsv(bundle: ExportBundle): string {
  const header = ["reference_period", "period_type", "dwelling_type", "metric_family", "transaction_count", "median_sale_price", "median_weekly_rent", "gross_yield_percentage", "approvals_count", "confidence_label", "source_dataset"];
  const rows = bundle.timeseries.map((r) =>
    [r.reference_period, r.period_type, r.dwelling_type ?? "", r.metric_family, r.transaction_count ?? "", r.median_sale_price ?? "", r.median_weekly_rent ?? "", r.gross_yield_percentage ?? "", r.approvals_count ?? "", r.confidence_label ?? "", r.source_dataset ?? ""]
      .map((v) => csvCell(v as string | number | null))
      .join(",")
  );
  const methodologyLines = Object.entries(bundle.lineage).map(
    ([family, l]) => `# ${family}: ${l.source_name ?? "unknown source"}${l.publisher ? ` (${l.publisher})` : ""} -- ${l.transformation_method ?? "unknown method"} -- ${l.licence ?? "licence not recorded"}`
  );
  return [`# Export: ${bundle.geography_id} (${bundle.mart_table})`, `# Exported at: ${bundle.exported_at}`, ...methodologyLines, header.join(","), ...rows].join("\n");
}
