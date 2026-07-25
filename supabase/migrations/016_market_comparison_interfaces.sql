-- ============================================================
-- Propellect — Cross-State Market Comparison Interfaces (Sprint 10, Phase 11)
--
-- v2 additions alongside (not replacing) the existing v1 interfaces from
-- migration 014, adding jurisdiction awareness and a new compare RPC.
-- Same security model as migration 014: SECURITY DEFINER functions / views
-- with security_invoker=false and a pinned search_path, SELECT/EXECUTE
-- granted to anon/authenticated only, zero direct grants on core/mart/meta.
--
-- Row limits and input validation are enforced INSIDE the functions (not
-- just documented) so anon/authenticated cannot bypass them by calling the
-- RPC directly with unexpected arguments.
-- ============================================================

-- ── 1. search_market_geographies_v2 — jurisdiction-aware search ──
create or replace function public.search_market_geographies_v2(
  p_query text default null,
  p_jurisdiction text default null,
  p_geography_type text default null,
  p_limit integer default 20
)
returns table (
  geography_id text, geography_type text, geography_code text, geography_name text,
  jurisdiction text, has_suburb_snapshot boolean, has_postcode_snapshot boolean
)
language plpgsql
security definer
stable
set search_path = public, core, mart, meta
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50); -- clamp 1..50
begin
  if p_geography_type is not null and p_geography_type not in ('SAL', 'POA') then
    raise exception 'invalid geography_type: must be SAL or POA';
  end if;
  if p_jurisdiction is not null and not exists (select 1 from meta.jurisdiction j where j.jurisdiction_code = p_jurisdiction) then
    raise exception 'invalid jurisdiction: not found in meta.jurisdiction';
  end if;

  return query
  select
    g.geography_id, g.geography_type, g.geography_code, g.geography_name,
    j.jurisdiction_code as jurisdiction,
    (s.geography_id is not null) as has_suburb_snapshot,
    (p.geography_id is not null) as has_postcode_snapshot
  from core.dim_geography g
  left join meta.jurisdiction j on j.asgs_state_code = g.state_code
  left join mart.suburb_market_snapshot s on s.geography_id = g.geography_id and s.dwelling_type is null
  left join mart.postcode_market_snapshot p on p.geography_id = g.geography_id and p.dwelling_type is null
  where g.geography_type in ('SAL', 'POA')
    and g.is_current
    and (p_geography_type is null or g.geography_type = p_geography_type)
    and (p_jurisdiction is null or j.jurisdiction_code = p_jurisdiction)
    and (p_query is null or p_query = '' or g.geography_name ilike '%' || p_query || '%' or g.geography_code = p_query)
  order by g.geography_name
  limit v_limit;
end;
$$;
comment on function public.search_market_geographies_v2 is
  'Jurisdiction-aware suburb/postcode search for the multi-state research explore/compare UI. Row limit clamped to 1-50 inside the function (cannot be bypassed by callers). No rankings, no scores — plain search matching only.';

-- ── 2. get_market_snapshot_v2 — single geography, jurisdiction-aware ──
create or replace function public.get_market_snapshot_v2(p_geography_id text)
returns table (
  geography_id text, geography_code text, geography_name text, jurisdiction text, state_code text,
  geography_method text, latest_sales_period date, latest_rent_period date, latest_yield_period date,
  latest_approvals_period date, latest_demographics_period integer, snapshot_generated_at timestamptz, coverage_status text,
  sales_volume_12m integer, median_sale_price_12m numeric, annual_price_change_pct numeric,
  median_sale_price_detached numeric, median_sale_price_apartment numeric, median_sale_price_townhouse numeric, sales_sample_confidence text,
  median_weekly_rent_latest numeric, median_weekly_rent_prev numeric, annual_rent_change_pct numeric, rent_confidence text,
  gross_yield_pct numeric, yield_confidence text,
  dwelling_stock_total integer, approvals_12m integer, approvals_per_1000_dwellings numeric, supply_confidence text,
  total_population integer, total_households integer, median_weekly_household_income integer, renter_share numeric, owner_with_mortgage_share numeric,
  price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, repayment_to_income_pct numeric, affordability_confidence text,
  confidence_label text, missing_metric_reasons jsonb
)
language sql
security definer
stable
set search_path = public, mart
as $$
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
    coalesce(s.price_to_income_ratio, p.price_to_income_ratio), coalesce(s.est_monthly_repayment_owner_occupier, p.est_monthly_repayment_owner_occupier), coalesce(s.repayment_to_income_pct, p.repayment_to_income_pct), coalesce(s.affordability_confidence, p.affordability_confidence),
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons)
  from (select * from mart.suburb_market_snapshot where geography_id = p_geography_id and dwelling_type is null) s
  full outer join (select * from mart.postcode_market_snapshot where geography_id = p_geography_id and dwelling_type is null) p
    on false; -- geography_id is either a SAL or a POA, never both — this just unions the two possible sources into one row shape
$$;
comment on function public.get_market_snapshot_v2 is
  'Jurisdiction-aware single-geography snapshot lookup (SAL or POA), superseding v_suburb_market_snapshot_v1/v_postcode_market_snapshot_v1 for the multi-state UI. v1 views remain available for backward compatibility.';

-- ── 3. compare_market_geographies_v1 — 2-5 geographies, side by side ──
create or replace function public.compare_market_geographies_v1(p_geography_ids text[])
returns table (
  geography_id text, geography_code text, geography_name text, jurisdiction text, geography_type text,
  latest_sales_period date, latest_rent_period date,
  median_sale_price_12m numeric, annual_price_change_pct numeric, sales_sample_confidence text,
  median_weekly_rent_latest numeric, annual_rent_change_pct numeric, rent_confidence text,
  gross_yield_pct numeric, yield_confidence text,
  dwelling_stock_total integer, approvals_per_1000_dwellings numeric,
  total_population integer, median_weekly_household_income integer,
  price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric,
  confidence_label text, missing_metric_reasons jsonb
)
language plpgsql
security definer
stable
set search_path = public, mart
as $$
begin
  if p_geography_ids is null or array_length(p_geography_ids, 1) is null then
    raise exception 'p_geography_ids must contain at least 2 geography ids';
  end if;
  if array_length(p_geography_ids, 1) < 2 or array_length(p_geography_ids, 1) > 5 then
    raise exception 'compare_market_geographies_v1 supports 2-5 geographies, got %', array_length(p_geography_ids, 1);
  end if;

  return query
  select
    coalesce(s.geography_id, p.geography_id), coalesce(s.geography_code, p.geography_code), coalesce(s.geography_name, p.geography_name),
    coalesce(s.jurisdiction, p.jurisdiction),
    case when s.geography_id is not null then 'SAL' when p.geography_id is not null then 'POA' else null end,
    coalesce(s.latest_sales_period, p.latest_sales_period), coalesce(s.latest_rent_period, p.latest_rent_period),
    coalesce(s.median_sale_price_12m, p.median_sale_price_12m), coalesce(s.annual_price_change_pct, p.annual_price_change_pct), coalesce(s.sales_sample_confidence, p.sales_sample_confidence),
    coalesce(s.median_weekly_rent_latest, p.median_weekly_rent_latest), coalesce(s.annual_rent_change_pct, p.annual_rent_change_pct), coalesce(s.rent_confidence, p.rent_confidence),
    coalesce(s.gross_yield_pct, p.gross_yield_pct), coalesce(s.yield_confidence, p.yield_confidence),
    coalesce(s.dwelling_stock_total, p.dwelling_stock_total), coalesce(s.approvals_per_1000_dwellings, p.approvals_per_1000_dwellings),
    coalesce(s.total_population, p.total_population), coalesce(s.median_weekly_household_income, p.median_weekly_household_income),
    coalesce(s.price_to_income_ratio, p.price_to_income_ratio), coalesce(s.est_monthly_repayment_owner_occupier, p.est_monthly_repayment_owner_occupier),
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons)
  from unnest(p_geography_ids) as req(geography_id)
  left join (select * from mart.suburb_market_snapshot where dwelling_type is null) s on s.geography_id = req.geography_id
  left join (select * from mart.postcode_market_snapshot where dwelling_type is null) p on p.geography_id = req.geography_id;
end;
$$;
comment on function public.compare_market_geographies_v1 is
  'Side-by-side comparison of 2-5 geographies (NSW and/or VIC, suburb and/or postcode) for the /research/compare UI. Row count strictly enforced (2-5) inside the function. No composite score, no ranking, no buy/pass output — raw metric comparison only, with confidence and missing_metric_reasons preserved per row.';

-- ── 4. get_market_timeseries_v2 — adds jurisdiction/state_code ──
create or replace function public.get_market_timeseries_v2(p_geography_id text)
returns table (
  geography_id text, geography_type text, jurisdiction text, state_code text, reference_period date, period_type text,
  dwelling_type text, metric_family text, transaction_count integer, median_sale_price numeric,
  median_weekly_rent numeric, gross_yield_percentage numeric, approvals_count integer,
  confidence_label text, source_dataset text
)
language sql
security definer
stable
set search_path = public, mart
as $$
  select geography_id, geography_type, jurisdiction, state_code, reference_period, period_type, dwelling_type, metric_family,
         transaction_count, median_sale_price, median_weekly_rent, gross_yield_percentage,
         approvals_count, confidence_label, source_dataset
  from mart.suburb_market_timeseries where geography_id = p_geography_id
  union all
  select geography_id, geography_type, jurisdiction, state_code, reference_period, period_type, dwelling_type, metric_family,
         transaction_count, median_sale_price, median_weekly_rent, gross_yield_percentage,
         approvals_count, confidence_label, source_dataset
  from mart.postcode_market_timeseries where geography_id = p_geography_id
  order by reference_period desc;
$$;
comment on function public.get_market_timeseries_v2 is
  'Jurisdiction-aware time-series lookup for a single geography_id, superseding get_market_timeseries_v1 for the multi-state UI. v1 remains available for backward compatibility.';

-- ── 5. Grants — SELECT/EXECUTE only, explicit and minimal ────
grant execute on function public.search_market_geographies_v2(text, text, text, integer) to anon, authenticated;
grant execute on function public.get_market_snapshot_v2(text) to anon, authenticated;
grant execute on function public.compare_market_geographies_v1(text[]) to anon, authenticated;
grant execute on function public.get_market_timeseries_v2(text) to anon, authenticated;

-- meta.jurisdiction is read via the search function only (SECURITY
-- DEFINER) — no direct grant on meta.jurisdiction to anon/authenticated.
revoke all on meta.jurisdiction from anon, authenticated;
