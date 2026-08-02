-- 055 — widen public.get_market_snapshot_v2 to the full snapshot contract.
--
-- STATUS: PREPARED, NOT APPLIED. Do not apply as part of this task.
--
-- Why: the suburb/postcode research pages read the snapshot from
-- get_market_snapshot_v2, but its RETURNS TABLE (migration 052) omits ~15
-- columns that mart storage and the v_*_market_snapshot_v1 views already hold —
-- investor repayment, RBA rate/period, sales turnover, direct/derived, data
-- quality status, etc. Those render as "Unavailable" in the UI despite real
-- values existing (e.g. Calderwood SAL_10749_ASGS3_2021:
-- est_monthly_repayment_investor=5632.99, rba_rate_used=6.2,
-- rba_rate_period=2026-05-31, sales_turnover_pct=16.8, direct_or_derived=direct).
--
-- The application-layer fix (lib/warehouse/snapshotContract.ts +
-- getEnrichedMarketSnapshot) already back-fills these from the view at query
-- time, so the UI is correct without this migration. This migration brings the
-- RPC — and therefore the public /api/v1/snapshot surface, which cannot read
-- the view merge — to parity. This body is reproduced from 052 with 15 columns
-- appended (verified against the live function; no drift).
--
-- MUST DROP FIRST: widening the RETURNS TABLE changes the function's OUT-parameter
-- row type, which CREATE OR REPLACE cannot do (Postgres 42P13: "cannot change
-- return type of existing function"). So drop the existing narrow function first,
-- then recreate the widened contract. DROP without CASCADE — it fails closed if
-- any object depends on the function (none do: it is only reached via PostgREST
-- RPC). IF EXISTS keeps the migration valid on a blank database (no-op) while
-- behaving identically on Production, where the narrow function exists. DROP also
-- removes the ACL, so the intended EXECUTE grants are restored immediately after
-- (anon, authenticated, service_role; PUBLIC stays revoked per the migration 046
-- hardening). Ownership/SECURITY DEFINER/STABLE/search_path are unchanged from 052.
-- The whole migration runs in one transaction, so a failure during recreation
-- rolls back and leaves the narrow function intact.
--
-- Reversible: re-running migration 052's definition of get_market_snapshot_v2
-- (plus 046's revoke-from-public / grant-to-anon,authenticated) restores the
-- narrower contract and ACL.

DROP FUNCTION IF EXISTS public.get_market_snapshot_v2(text);

CREATE OR REPLACE FUNCTION public.get_market_snapshot_v2(p_geography_id text)
 RETURNS TABLE(geography_id text, geography_code text, geography_name text, jurisdiction text, state_code text, geography_method text, latest_sales_period date, latest_rent_period date, latest_yield_period date, latest_approvals_period date, latest_demographics_period integer, snapshot_generated_at timestamp with time zone, coverage_status text, sales_volume_12m integer, median_sale_price_12m numeric, annual_price_change_pct numeric, median_sale_price_detached numeric, median_sale_price_apartment numeric, median_sale_price_townhouse numeric, sales_sample_confidence text, median_weekly_rent_latest numeric, median_weekly_rent_prev numeric, annual_rent_change_pct numeric, rent_confidence text, gross_yield_pct numeric, yield_confidence text, dwelling_stock_total integer, approvals_12m integer, approvals_per_1000_dwellings numeric, supply_confidence text, total_population integer, total_households integer, median_weekly_household_income integer, renter_share numeric, owner_with_mortgage_share numeric, population_growth_2016_2021_pct numeric, price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, repayment_to_income_pct numeric, affordability_confidence text, confidence_label text, missing_metric_reasons jsonb,
  -- appended in 055 to restore the columns dropped from the v2 contract:
  median_sale_price_prev_12m numeric, yield_sale_period_used date, yield_rent_period_used date, approvals_detached_12m integer, approvals_other_residential_12m integer, sales_turnover_pct numeric, renter_household_pct numeric, owner_occupier_pct numeric, rent_to_income_ratio numeric, est_monthly_repayment_investor numeric, rba_rate_used numeric, rba_rate_period date, assumption_scenario_code text, data_quality_status text, direct_or_derived text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart'
AS $function$
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
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons),
    -- appended columns (055):
    coalesce(s.median_sale_price_prev_12m, p.median_sale_price_prev_12m), coalesce(s.yield_sale_period_used, p.yield_sale_period_used), coalesce(s.yield_rent_period_used, p.yield_rent_period_used),
    coalesce(s.approvals_detached_12m, p.approvals_detached_12m), coalesce(s.approvals_other_residential_12m, p.approvals_other_residential_12m),
    coalesce(s.sales_turnover_pct, p.sales_turnover_pct), coalesce(s.renter_household_pct, p.renter_household_pct), coalesce(s.owner_occupier_pct, p.owner_occupier_pct), coalesce(s.rent_to_income_ratio, p.rent_to_income_ratio),
    coalesce(s.est_monthly_repayment_investor, p.est_monthly_repayment_investor), coalesce(s.rba_rate_used, p.rba_rate_used), coalesce(s.rba_rate_period, p.rba_rate_period),
    coalesce(s.assumption_scenario_code, p.assumption_scenario_code), coalesce(s.data_quality_status, p.data_quality_status), coalesce(s.direct_or_derived, p.direct_or_derived)
  from (select * from mart.suburb_market_snapshot where geography_id = p_geography_id and dwelling_type is null) s
  full outer join (select * from mart.postcode_market_snapshot where geography_id = p_geography_id and dwelling_type is null) p
    on false;
$function$;

-- Restore the intended ACL after the drop/recreate (matches the post-046 state:
-- PUBLIC revoked; EXECUTE for anon, authenticated and service_role).
REVOKE ALL ON FUNCTION public.get_market_snapshot_v2(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_market_snapshot_v2(text) TO anon, authenticated, service_role;
