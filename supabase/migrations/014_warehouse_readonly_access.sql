-- ============================================================
-- Propellect — Warehouse Read-Only Access Layer (Sprint 9, Phase 9)
--
-- Resolves the RLS/read-access decision documented in
-- warehouse/docs/WAREHOUSE_READONLY_ACCESS_DESIGN.md WITHOUT retrofitting
-- RLS policies across the 35 existing core/staging/meta/mart tables (out
-- of scope for this sprint — see the design doc). Instead: core and mart
-- schemas stay un-exposed to PostgREST; a minimal set of public.* views
-- and one RPC function expose ONLY the fields the internal /research
-- interface needs.
--
-- Security model (deliberate choice, not the default recommendation):
-- views use security_invoker = false (Postgres's classic view behaviour —
-- the view runs with its OWNER's privileges on the underlying mart/meta
-- tables) and the RPC function uses SECURITY DEFINER with an explicit
-- search_path. This is intentional: anon/authenticated are granted SELECT/
-- EXECUTE on the views/function ONLY, with zero direct grants on the
-- underlying schemas (enforced by the REVOKE statements below) — so the
-- curated view/function is the ONLY path to this data. security_invoker
-- would require granting anon direct SELECT on mart.*/meta.* to work at
-- all, which defeats the purpose of keeping those schemas un-exposed.
-- There are no RLS policies on the underlying tables for security_invoker
-- to usefully compose with here (see the design doc for why RLS retrofit
-- is out of scope this sprint) — so the definer-privilege view pattern is
-- the correct, safer choice for this specific use case.
--
-- Idempotent and non-destructive: `create or replace view`, `create table
-- if not exists`, no DROP / TRUNCATE / DELETE, no data loads, no secrets.
-- Grants SELECT/EXECUTE only — INSERT/UPDATE/DELETE/TRUNCATE are never
-- granted to anon/authenticated on anything this migration touches.
-- Branch database only until approved for production.
-- ============================================================

-- ── 1. Suburb market snapshot (public, minimal projection) ───
create or replace view public.v_suburb_market_snapshot_v1
  with (security_invoker = false) as
select
  geography_id, geography_code, geography_name, state_code,
  latest_sales_period, latest_rent_period, latest_yield_period, latest_approvals_period, latest_demographics_period,
  snapshot_generated_at, coverage_status,
  sales_volume_12m, median_sale_price_12m, median_sale_price_prev_12m, annual_price_change_pct,
  median_sale_price_detached, median_sale_price_apartment, median_sale_price_townhouse, sales_sample_confidence,
  median_weekly_rent_latest, median_weekly_rent_prev, annual_rent_change_pct, rent_confidence,
  gross_yield_pct, yield_confidence, yield_sale_period_used, yield_rent_period_used,
  dwelling_stock_total, approvals_12m, approvals_per_1000_dwellings, approvals_detached_12m, approvals_other_residential_12m, supply_confidence,
  sales_turnover_pct, renter_household_pct, owner_occupier_pct,
  total_population, population_growth_2016_2021_pct, total_households, median_weekly_household_income, renter_share, owner_with_mortgage_share,
  price_to_income_ratio, rent_to_income_ratio, est_monthly_repayment_owner_occupier, est_monthly_repayment_investor,
  repayment_to_income_pct, rba_rate_used, rba_rate_period, assumption_scenario_code, affordability_confidence,
  confidence_label, data_quality_status, direct_or_derived, missing_metric_reasons
from mart.suburb_market_snapshot
where dwelling_type is null; -- wide-row shape only (excludes any legacy tall rows)
comment on view public.v_suburb_market_snapshot_v1 is
  'Read-only public projection of mart.suburb_market_snapshot for the internal /research preview. Runs with the view owner''s privileges (classic Postgres view behaviour) so anon/authenticated need no direct grant on mart.suburb_market_snapshot. No internal lineage/operational columns exposed. Descriptive research data only — not a recommendation, score, AVM or forecast.';

-- ── 2. Postcode market snapshot ───────────────────────────────
create or replace view public.v_postcode_market_snapshot_v1
  with (security_invoker = false) as
select
  geography_id, geography_code, geography_name, state_code,
  latest_sales_period, latest_rent_period, latest_yield_period, latest_approvals_period, latest_demographics_period,
  snapshot_generated_at, coverage_status,
  sales_volume_12m, median_sale_price_12m, median_sale_price_prev_12m, annual_price_change_pct,
  median_sale_price_detached, median_sale_price_apartment, median_sale_price_townhouse, sales_sample_confidence,
  median_weekly_rent_latest, median_weekly_rent_prev, annual_rent_change_pct, rent_confidence,
  gross_yield_pct, yield_confidence, yield_sale_period_used, yield_rent_period_used,
  dwelling_stock_total, approvals_12m, approvals_per_1000_dwellings, approvals_detached_12m, approvals_other_residential_12m, supply_confidence,
  sales_turnover_pct, renter_household_pct, owner_occupier_pct,
  total_population, population_growth_2016_2021_pct, total_households, median_weekly_household_income, renter_share, owner_with_mortgage_share,
  price_to_income_ratio, rent_to_income_ratio, est_monthly_repayment_owner_occupier, est_monthly_repayment_investor,
  repayment_to_income_pct, rba_rate_used, rba_rate_period, assumption_scenario_code, affordability_confidence,
  confidence_label, data_quality_status, direct_or_derived, missing_metric_reasons
from mart.postcode_market_snapshot
where dwelling_type is null;
comment on view public.v_postcode_market_snapshot_v1 is
  'Read-only public projection of mart.postcode_market_snapshot for the internal /research preview. Same access pattern as v_suburb_market_snapshot_v1.';

-- ── 3. Geography search (suburb/postcode, name/state disambiguation) ─
create or replace view public.v_market_geography_search_v1
  with (security_invoker = false) as
select
  g.geography_id, g.geography_type, g.geography_code, g.geography_name, g.state_code,
  (s.geography_id is not null) as has_suburb_snapshot,
  (p.geography_id is not null) as has_postcode_snapshot
from core.dim_geography g
left join mart.suburb_market_snapshot s on s.geography_id = g.geography_id and s.dwelling_type is null
left join mart.postcode_market_snapshot p on p.geography_id = g.geography_id and p.dwelling_type is null
where g.geography_type in ('SAL', 'POA') and g.is_current;
comment on view public.v_market_geography_search_v1 is
  'Read-only suburb/postcode search + disambiguation (name/state/type) for the internal /research preview search box. Restricted to current (is_current=true) SAL/POA geography rows.';

-- ── 4. Demographic profile (exposed separately — used by the
-- Demographics section of the /research suburb/postcode page) ─
create or replace view public.v_suburb_demographic_profile_v1
  with (security_invoker = false) as
select geography_id, geography_code, geography_name, state_code, census_year,
  total_population, population_2016, population_2021, population_growth_2016_2021_pct, median_age,
  total_households, family_households, lone_person_households, average_household_size,
  median_weekly_household_income, median_weekly_personal_income, median_weekly_family_income,
  census_median_weekly_rent, census_median_monthly_mortgage,
  renter_household_pct, owner_with_mortgage_pct, owner_outright_pct,
  occupied_dwelling_count, unoccupied_dwelling_count, detached_house_pct, apartment_unit_pct,
  geography_method, confidence_label, data_quality_status, missing_metric_reasons
from mart.suburb_demographic_profile_2021;
comment on view public.v_suburb_demographic_profile_v1 is 'Read-only public projection of mart.suburb_demographic_profile_2021.';

create or replace view public.v_postcode_demographic_profile_v1
  with (security_invoker = false) as
select geography_id, geography_code, geography_name, state_code, census_year,
  total_population, population_2016, population_2021, population_growth_2016_2021_pct, median_age,
  total_households, family_households, lone_person_households, average_household_size,
  median_weekly_household_income, median_weekly_personal_income, median_weekly_family_income,
  census_median_weekly_rent, census_median_monthly_mortgage,
  renter_household_pct, owner_with_mortgage_pct, owner_outright_pct,
  occupied_dwelling_count, unoccupied_dwelling_count, detached_house_pct, apartment_unit_pct,
  geography_method, confidence_label, data_quality_status, missing_metric_reasons
from mart.postcode_demographic_profile_2021;
comment on view public.v_postcode_demographic_profile_v1 is 'Read-only public projection of mart.postcode_demographic_profile_2021.';

-- ── 5. Metric assumptions (baseline scenario, for transparent display) ─
create or replace view public.v_metric_assumptions_v1
  with (security_invoker = false) as
select scenario_code, assumption_name, numeric_value, text_value, unit, effective_from, effective_to, source_notes
from meta.metric_assumption
where effective_to is null; -- only the currently-effective assumption rows
comment on view public.v_metric_assumptions_v1 is
  'Read-only public projection of the current metric_assumption baseline scenario (e.g. deposit percent, loan term) for transparent display in the /research affordability section. No internal ids.';

-- ── 6. Time series RPC (single geography, both marts unioned) ─
create or replace function public.get_market_timeseries_v1(p_geography_id text)
returns table (
  geography_id text, geography_type text, reference_period date, period_type text,
  dwelling_type text, metric_family text, transaction_count integer, median_sale_price numeric,
  median_weekly_rent numeric, gross_yield_percentage numeric, approvals_count integer,
  rate_percent numeric, confidence_label text, source_dataset text
)
language sql
security definer
stable
set search_path = public, mart
as $$
  select geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family,
         transaction_count, median_sale_price, median_weekly_rent, gross_yield_percentage,
         approvals_count, rate_percent, confidence_label, source_dataset
  from mart.suburb_market_timeseries where geography_id = p_geography_id
  union all
  select geography_id, geography_type, reference_period, period_type, dwelling_type, metric_family,
         transaction_count, median_sale_price, median_weekly_rent, gross_yield_percentage,
         approvals_count, rate_percent, confidence_label, source_dataset
  from mart.postcode_market_timeseries where geography_id = p_geography_id
  order by reference_period desc;
$$;
comment on function public.get_market_timeseries_v1 is
  'Read-only time-series lookup for a single geography_id (SAL or POA), unioning mart.suburb_market_timeseries and mart.postcode_market_timeseries. SECURITY DEFINER with a pinned search_path — runs with the function owner''s privileges so anon/authenticated need no direct grant on the underlying mart tables; only EXECUTE on this function is granted.';

-- ── 7. Grants — SELECT/EXECUTE only, explicit and minimal ────
grant usage on schema public to anon, authenticated;

grant select on public.v_suburb_market_snapshot_v1 to anon, authenticated;
grant select on public.v_postcode_market_snapshot_v1 to anon, authenticated;
grant select on public.v_market_geography_search_v1 to anon, authenticated;
grant select on public.v_suburb_demographic_profile_v1 to anon, authenticated;
grant select on public.v_postcode_demographic_profile_v1 to anon, authenticated;
grant select on public.v_metric_assumptions_v1 to anon, authenticated;
grant execute on function public.get_market_timeseries_v1(text) to anon, authenticated;

-- Defence-in-depth: explicitly deny write access on everything this
-- migration touches (idempotent no-ops if no grant ever existed; documents
-- intent even though these roles were never granted write access here).
revoke insert, update, delete, truncate on public.v_suburb_market_snapshot_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_postcode_market_snapshot_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_market_geography_search_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_suburb_demographic_profile_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_postcode_demographic_profile_v1 from anon, authenticated;
revoke insert, update, delete, truncate on public.v_metric_assumptions_v1 from anon, authenticated;
revoke all on mart.suburb_market_snapshot, mart.postcode_market_snapshot,
  mart.suburb_demographic_profile_2021, mart.postcode_demographic_profile_2021,
  mart.suburb_market_timeseries, mart.postcode_market_timeseries,
  meta.metric_assumption
  from anon, authenticated;
revoke all on schema core, mart, staging, meta from anon, authenticated;
