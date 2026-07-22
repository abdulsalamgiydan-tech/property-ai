-- ============================================================
-- Propellect — Advanced comparison workspace, 2-10 geographies
-- (Sprint 11, Workstream 12)
--
-- Widens compare_market_geographies_v1's row limit from 2-5 to 2-10 —
-- same function signature, same security model (SECURITY DEFINER, pinned
-- search_path, limit enforced INSIDE the function), just a larger cap.
-- Not a new function: existing callers are unaffected, they simply gain
-- the ability to pass more geography_ids.
-- ============================================================

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
  if array_length(p_geography_ids, 1) < 2 or array_length(p_geography_ids, 1) > 10 then
    raise exception 'compare_market_geographies_v1 supports 2-10 geographies, got %', array_length(p_geography_ids, 1);
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
  'Side-by-side comparison of 2-10 geographies (NSW and/or VIC, suburb and/or postcode) for the /research/compare UI. Row count strictly enforced (2-10) inside the function. Widened from 2-5 in Sprint 11 Workstream 12. No composite score, no ranking, no buy/pass output — raw metric comparison only, with confidence and missing_metric_reasons preserved per row.';
