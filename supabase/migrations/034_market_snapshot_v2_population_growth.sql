-- Sprint 12, Workstream 12 — research interface rebuild.
--
-- Real finding: public.get_market_snapshot_v2() never selected
-- population_growth_2016_2021_pct, even though Sprint 12 WS4 built a
-- genuine 2016-2021 boundary reconciliation and WS6 rolled it into
-- mart.suburb_market_snapshot / postcode_market_snapshot for 10,935 +
-- 2,596 rows. The UI (components/research/MarketSnapshotView.tsx)
-- carried stale copy claiming this metric was structurally unavailable
-- ("2016 and 2021 boundaries do not align") -- true before WS4, false
-- since. Adding the column here so the UI can finally display it.
--
-- Return type change requires DROP + CREATE (Postgres does not allow
-- CREATE OR REPLACE to alter a function's RETURNS TABLE column list).

drop function if exists public.get_market_snapshot_v2(text);

create function public.get_market_snapshot_v2(p_geography_id text)
returns table (
  geography_id text, geography_code text, geography_name text, jurisdiction text, state_code text, geography_method text,
  latest_sales_period date, latest_rent_period date, latest_yield_period date, latest_approvals_period date, latest_demographics_period integer,
  snapshot_generated_at timestamptz, coverage_status text,
  sales_volume_12m integer, median_sale_price_12m numeric, annual_price_change_pct numeric,
  median_sale_price_detached numeric, median_sale_price_apartment numeric, median_sale_price_townhouse numeric, sales_sample_confidence text,
  median_weekly_rent_latest numeric, median_weekly_rent_prev numeric, annual_rent_change_pct numeric, rent_confidence text,
  gross_yield_pct numeric, yield_confidence text,
  dwelling_stock_total integer, approvals_12m integer, approvals_per_1000_dwellings numeric, supply_confidence text,
  total_population integer, total_households integer, median_weekly_household_income integer, renter_share numeric, owner_with_mortgage_share numeric,
  population_growth_2016_2021_pct numeric,
  price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, repayment_to_income_pct numeric, affordability_confidence text,
  confidence_label text, missing_metric_reasons jsonb
)
language sql
stable security definer
set search_path to 'public', 'mart'
as $function$
  select
    coalesce(s.geography_id, p.geography_id), coalesce(s.geography_code, p.geography_code), coalesce(s.geography_name, p.geography_name),
    coalesce(s.jurisdiction, p.jurisdiction), coalesce(s.state_code, p.state_code), coalesce(s.geography_method, p.geography_method),
    coalesce(s.latest_sales_period, p.latest_sales_period), coalesce(s.latest_rent_period, p.latest_rent_period), coalesce(s.latest_yield_period, p.latest_yield_period),
    coalesce(s.latest_approvals_period, p.latest_approvals_period), coalesce(s.latest_demographics_period, p.latest_demographics_period),
    coalesce(s.snapshot_generated_at, p.snapshot_generated_at), coalesce(s.coverage_status, p.coverage_status),
    coalesce(s.sales_volume_12m, p.sales_volume_12m), coalesce(s.median_sale_price_12m, p.median_sale_price_12m), coalesce(s.annual_price_change_pct, p.annual_price_change_pct),
    coalesce(s.median_sale_price_detached, p.median_sale_price_detached), coalesce(s.median_sale_price_apartment, p.median_sale_price_apartment), coalesce(s.median_sale_price_townhouse, p.median_sale_price_townhouse), coalesce(s.sales_sample_confidence, p.sales_sample_confidence),
    coalesce(s.median_weekly_rent_latest, p.median_weekly_rent_latest), coalesce(s.median_weekly_rent_prev, p.median_weekly_rent_prev), coalesce(s.annual_rent_change_pct, p.annual_rent_change_pct), coalesce(s.rent_confidence, p.rent_confidence),
    coalesce(s.gross_yield_pct, p.gross_yield_pct), coalesce(s.yield_confidence, p.yield_confidence),
    coalesce(s.dwelling_stock_total, p.dwelling_stock_total), coalesce(s.approvals_12m, p.approvals_12m), coalesce(s.approvals_per_1000_dwellings, p.approvals_per_1000_dwellings), coalesce(s.supply_confidence, p.supply_confidence),
    coalesce(s.total_population, p.total_population), coalesce(s.total_households, p.total_households), coalesce(s.median_weekly_household_income, p.median_weekly_household_income), coalesce(s.renter_share, p.renter_share), coalesce(s.owner_with_mortgage_share, p.owner_with_mortgage_share),
    coalesce(s.population_growth_2016_2021_pct, p.population_growth_2016_2021_pct),
    coalesce(s.price_to_income_ratio, p.price_to_income_ratio), coalesce(s.est_monthly_repayment_owner_occupier, p.est_monthly_repayment_owner_occupier), coalesce(s.repayment_to_income_pct, p.repayment_to_income_pct), coalesce(s.affordability_confidence, p.affordability_confidence),
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons)
  from (select * from mart.suburb_market_snapshot where geography_id = p_geography_id and dwelling_type is null) s
  full outer join (select * from mart.postcode_market_snapshot where geography_id = p_geography_id and dwelling_type is null) p
    on false;
$function$;

grant execute on function public.get_market_snapshot_v2(text) to anon, authenticated, service_role;
