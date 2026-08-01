-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 5 of 8.
--
-- The exact 10 views + 8 functions that existing migration
-- 046_research_api_grant_hardening.sql revokes/grants on. Bodies and
-- comments extracted byte-accurate from warehouse-validation via
-- pg_get_viewdef()/pg_get_functiondef()/obj_description() through the
-- same MCP SQL tool used for every other read-only introspection this
-- sprint -- not hand-retyped from the historical migrations that created
-- and repeatedly redefined them (014, 016, 017, 020, 021, 022, 033, 034,
-- 035, 041 all touch at least one of these 18 objects). This is Postgres's
-- own canonical serialization of the current stored definition, so there
-- is no transcription-error risk.
--
-- Applied after 048-051 (schemas + tables) and before existing 046, which
-- is applied unmodified immediately after this file in the Production
-- bootstrap sequence -- see 048's header for why that ordering is fully
-- supported by Supabase's real apply-timestamp versioning.

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------

create or replace view public.v_market_geography_search_v1 as
 SELECT g.geography_id,
    g.geography_type,
    g.geography_code,
    g.geography_name,
    g.state_code,
    s.geography_id IS NOT NULL AS has_suburb_snapshot,
    p.geography_id IS NOT NULL AS has_postcode_snapshot
   FROM core.dim_geography g
     LEFT JOIN mart.suburb_market_snapshot s ON s.geography_id = g.geography_id AND s.dwelling_type IS NULL
     LEFT JOIN mart.postcode_market_snapshot p ON p.geography_id = g.geography_id AND p.dwelling_type IS NULL
  WHERE (g.geography_type = ANY (ARRAY['SAL'::text, 'POA'::text])) AND g.is_current;
comment on view public.v_market_geography_search_v1 is 'Read-only suburb/postcode search + disambiguation (name/state/type) for the internal /research preview search box. Restricted to current (is_current=true) SAL/POA geography rows.';

create or replace view public.v_suburb_market_snapshot_v1 as
 SELECT geography_id,
    geography_code,
    geography_name,
    state_code,
    latest_sales_period,
    latest_rent_period,
    latest_yield_period,
    latest_approvals_period,
    latest_demographics_period,
    snapshot_generated_at,
    coverage_status,
    sales_volume_12m,
    median_sale_price_12m,
    median_sale_price_prev_12m,
    annual_price_change_pct,
    median_sale_price_detached,
    median_sale_price_apartment,
    median_sale_price_townhouse,
    sales_sample_confidence,
    median_weekly_rent_latest,
    median_weekly_rent_prev,
    annual_rent_change_pct,
    rent_confidence,
    gross_yield_pct,
    yield_confidence,
    yield_sale_period_used,
    yield_rent_period_used,
    dwelling_stock_total,
    approvals_12m,
    approvals_per_1000_dwellings,
    approvals_detached_12m,
    approvals_other_residential_12m,
    supply_confidence,
    sales_turnover_pct,
    renter_household_pct,
    owner_occupier_pct,
    total_population,
    population_growth_2016_2021_pct,
    total_households,
    median_weekly_household_income,
    renter_share,
    owner_with_mortgage_share,
    price_to_income_ratio,
    rent_to_income_ratio,
    est_monthly_repayment_owner_occupier,
    est_monthly_repayment_investor,
    repayment_to_income_pct,
    rba_rate_used,
    rba_rate_period,
    assumption_scenario_code,
    affordability_confidence,
    confidence_label,
    data_quality_status,
    direct_or_derived,
    missing_metric_reasons
   FROM mart.suburb_market_snapshot
  WHERE dwelling_type IS NULL;
comment on view public.v_suburb_market_snapshot_v1 is 'Read-only public projection of mart.suburb_market_snapshot for the internal /research preview. Runs with the view owner''s privileges (classic Postgres view behaviour) so anon/authenticated need no direct grant on mart.suburb_market_snapshot. No internal lineage/operational columns exposed. Descriptive research data only — not a recommendation, score, AVM or forecast.';

create or replace view public.v_postcode_market_snapshot_v1 as
 SELECT geography_id,
    geography_code,
    geography_name,
    state_code,
    latest_sales_period,
    latest_rent_period,
    latest_yield_period,
    latest_approvals_period,
    latest_demographics_period,
    snapshot_generated_at,
    coverage_status,
    sales_volume_12m,
    median_sale_price_12m,
    median_sale_price_prev_12m,
    annual_price_change_pct,
    median_sale_price_detached,
    median_sale_price_apartment,
    median_sale_price_townhouse,
    sales_sample_confidence,
    median_weekly_rent_latest,
    median_weekly_rent_prev,
    annual_rent_change_pct,
    rent_confidence,
    gross_yield_pct,
    yield_confidence,
    yield_sale_period_used,
    yield_rent_period_used,
    dwelling_stock_total,
    approvals_12m,
    approvals_per_1000_dwellings,
    approvals_detached_12m,
    approvals_other_residential_12m,
    supply_confidence,
    sales_turnover_pct,
    renter_household_pct,
    owner_occupier_pct,
    total_population,
    population_growth_2016_2021_pct,
    total_households,
    median_weekly_household_income,
    renter_share,
    owner_with_mortgage_share,
    price_to_income_ratio,
    rent_to_income_ratio,
    est_monthly_repayment_owner_occupier,
    est_monthly_repayment_investor,
    repayment_to_income_pct,
    rba_rate_used,
    rba_rate_period,
    assumption_scenario_code,
    affordability_confidence,
    confidence_label,
    data_quality_status,
    direct_or_derived,
    missing_metric_reasons
   FROM mart.postcode_market_snapshot
  WHERE dwelling_type IS NULL;
comment on view public.v_postcode_market_snapshot_v1 is 'Read-only public projection of mart.postcode_market_snapshot for the internal /research preview. Same access pattern as v_suburb_market_snapshot_v1.';

create or replace view public.v_suburb_demographic_profile_v1 as
 SELECT geography_id,
    geography_code,
    geography_name,
    state_code,
    census_year,
    total_population,
    population_2016,
    population_2021,
    population_growth_2016_2021_pct,
    median_age,
    total_households,
    family_households,
    lone_person_households,
    average_household_size,
    median_weekly_household_income,
    median_weekly_personal_income,
    median_weekly_family_income,
    census_median_weekly_rent,
    census_median_monthly_mortgage,
    renter_household_pct,
    owner_with_mortgage_pct,
    owner_outright_pct,
    occupied_dwelling_count,
    unoccupied_dwelling_count,
    detached_house_pct,
    apartment_unit_pct,
    geography_method,
    confidence_label,
    data_quality_status,
    missing_metric_reasons
   FROM mart.suburb_demographic_profile_2021;
comment on view public.v_suburb_demographic_profile_v1 is 'Read-only public projection of mart.suburb_demographic_profile_2021.';

create or replace view public.v_postcode_demographic_profile_v1 as
 SELECT geography_id,
    geography_code,
    geography_name,
    state_code,
    census_year,
    total_population,
    population_2016,
    population_2021,
    population_growth_2016_2021_pct,
    median_age,
    total_households,
    family_households,
    lone_person_households,
    average_household_size,
    median_weekly_household_income,
    median_weekly_personal_income,
    median_weekly_family_income,
    census_median_weekly_rent,
    census_median_monthly_mortgage,
    renter_household_pct,
    owner_with_mortgage_pct,
    owner_outright_pct,
    occupied_dwelling_count,
    unoccupied_dwelling_count,
    detached_house_pct,
    apartment_unit_pct,
    geography_method,
    confidence_label,
    data_quality_status,
    missing_metric_reasons
   FROM mart.postcode_demographic_profile_2021;
comment on view public.v_postcode_demographic_profile_v1 is 'Read-only public projection of mart.postcode_demographic_profile_2021.';

create or replace view public.v_dataset_freshness_v1 as
 SELECT f.dataset_id,
    f.jurisdiction,
    d.dataset_name,
    s.publisher,
    f.latest_source_period,
    f.last_retrieved_at,
    f.last_successful_validation_at,
    f.expected_cadence_days,
    f.freshness_status,
    f.current_branch_row_count,
    f.last_failure_summary,
    f.local_only_or_branch_published,
    f.source_url,
    f.computed_at
   FROM meta.dataset_freshness_status f
     LEFT JOIN meta.dataset d ON d.dataset_id = f.dataset_id
     LEFT JOIN meta.source s ON s.source_id = d.source_id;
comment on view public.v_dataset_freshness_v1 is 'Read-only public projection of meta.dataset_freshness_status for the /research/data-status observability page. Never exposes local file paths, secrets, internal DB identifiers, or raw operational logs — only the fields listed here.';

create or replace view public.v_refresh_run_history_v1 as
 SELECT r.refresh_run_id,
    r.dataset_id,
    d.dataset_name,
    r.mode,
    r.status,
    r.target,
    r.started_at,
    r.completed_at,
    r.rows_affected,
    "left"(r.error_message, 300) AS error_summary,
    EXTRACT(epoch FROM r.completed_at - r.started_at)::integer AS duration_seconds
   FROM meta.dataset_refresh_run r
     LEFT JOIN meta.dataset d ON d.dataset_id = r.dataset_id
  ORDER BY r.started_at DESC
 LIMIT 200;
comment on view public.v_refresh_run_history_v1 is 'Read-only projection of the last 200 refresh runs for the data operations console. error_summary is truncated to 300 chars and never includes the raw manifest (which can carry local file paths). No credentials, no connection strings, no internal branch identifiers beyond the already-public target (local/branch) label.';

create or replace view public.v_metric_assumptions_v1 as
 SELECT scenario_code,
    assumption_name,
    numeric_value,
    text_value,
    unit,
    effective_from,
    effective_to,
    source_notes
   FROM meta.metric_assumption
  WHERE effective_to IS NULL;
comment on view public.v_metric_assumptions_v1 is 'Read-only public projection of the current metric_assumption baseline scenario (e.g. deposit percent, loan term) for transparent display in the /research affordability section. No internal ids.';

create or replace view public.v_quality_summary_v1 as
 SELECT ( SELECT count(*)::integer AS count
           FROM meta.data_quality_rule
          WHERE NOT data_quality_rule.is_legacy) AS active_rules,
    ( SELECT count(*)::integer AS count
           FROM meta.data_quality_rule
          WHERE NOT data_quality_rule.is_legacy AND data_quality_rule.blocking) AS blocking_rules,
    ( SELECT count(*)::integer AS count
           FROM meta.data_quality_rule
          WHERE NOT data_quality_rule.is_legacy AND NOT data_quality_rule.blocking) AS advisory_rules,
    rules_run,
    rules_passed,
    rules_failed_blocking,
    rules_failed_advisory,
    started_at AS latest_run_at,
    ( SELECT count(*)::integer AS count
           FROM meta.data_incident
          WHERE data_incident.status = 'open'::text) AS open_incidents,
    ( SELECT count(*)::integer AS count
           FROM meta.data_incident
          WHERE data_incident.status = 'open'::text AND data_incident.severity = 'blocker'::text) AS open_blocking_incidents,
    ( SELECT COALESCE(sum(data_quarantine_summary.quarantined_count), 0::bigint)::integer AS "coalesce"
           FROM meta.data_quarantine_summary) AS quarantined_rows_total
   FROM ( SELECT data_quality_run.rules_run,
            data_quality_run.rules_passed,
            data_quality_run.rules_failed_blocking,
            data_quality_run.rules_failed_advisory,
            data_quality_run.started_at
           FROM meta.data_quality_run
          ORDER BY data_quality_run.started_at DESC
         LIMIT 1) latest;

create or replace view public.v_evidence_catalogue_v1 as
 SELECT source_id,
    source_name,
    publisher,
    source_category,
    official_or_independent,
    source_url,
    licence,
    access_method,
    update_frequency,
    implementation_status,
    known_limitations,
    ( SELECT count(*)::integer AS count
           FROM meta.dataset d
          WHERE d.source_id = s.source_id) AS dataset_count,
    ( SELECT count(DISTINCT (r.mart_table || '.'::text) || r.metric_name)::integer AS count
           FROM meta.metric_lineage_registry r
          WHERE r.source_id = s.source_id) AS published_metric_family_count
   FROM meta.source s
  ORDER BY source_category, source_id;

-- ---------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_market_timeseries_v1(p_geography_id text)
 RETURNS TABLE(geography_id text, geography_type text, reference_period date, period_type text, dwelling_type text, metric_family text, transaction_count integer, median_sale_price numeric, median_weekly_rent numeric, gross_yield_percentage numeric, approvals_count integer, rate_percent numeric, confidence_label text, source_dataset text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart'
AS $function$
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
$function$;
comment on function public.get_market_timeseries_v1(text) is 'Read-only time-series lookup for a single geography_id (SAL or POA), unioning mart.suburb_market_timeseries and mart.postcode_market_timeseries. SECURITY DEFINER with a pinned search_path — runs with the function owner''s privileges so anon/authenticated need no direct grant on the underlying mart tables; only EXECUTE on this function is granted.';

CREATE OR REPLACE FUNCTION public.search_market_geographies_v2(p_query text DEFAULT NULL::text, p_jurisdiction text DEFAULT NULL::text, p_geography_type text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(geography_id text, geography_type text, geography_code text, geography_name text, jurisdiction text, has_suburb_snapshot boolean, has_postcode_snapshot boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'core', 'mart', 'meta'
AS $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
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
$function$;
comment on function public.search_market_geographies_v2(text, text, text, integer) is 'Jurisdiction-aware suburb/postcode search for the multi-state research explore/compare UI. Row limit clamped to 1-50 inside the function (cannot be bypassed by callers). No rankings, no scores — plain search matching only.';

CREATE OR REPLACE FUNCTION public.get_market_snapshot_v2(p_geography_id text)
 RETURNS TABLE(geography_id text, geography_code text, geography_name text, jurisdiction text, state_code text, geography_method text, latest_sales_period date, latest_rent_period date, latest_yield_period date, latest_approvals_period date, latest_demographics_period integer, snapshot_generated_at timestamp with time zone, coverage_status text, sales_volume_12m integer, median_sale_price_12m numeric, annual_price_change_pct numeric, median_sale_price_detached numeric, median_sale_price_apartment numeric, median_sale_price_townhouse numeric, sales_sample_confidence text, median_weekly_rent_latest numeric, median_weekly_rent_prev numeric, annual_rent_change_pct numeric, rent_confidence text, gross_yield_pct numeric, yield_confidence text, dwelling_stock_total integer, approvals_12m integer, approvals_per_1000_dwellings numeric, supply_confidence text, total_population integer, total_households integer, median_weekly_household_income integer, renter_share numeric, owner_with_mortgage_share numeric, population_growth_2016_2021_pct numeric, price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, repayment_to_income_pct numeric, affordability_confidence text, confidence_label text, missing_metric_reasons jsonb)
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
    coalesce(s.confidence_label, p.confidence_label), coalesce(s.missing_metric_reasons, p.missing_metric_reasons)
  from (select * from mart.suburb_market_snapshot where geography_id = p_geography_id and dwelling_type is null) s
  full outer join (select * from mart.postcode_market_snapshot where geography_id = p_geography_id and dwelling_type is null) p
    on false;
$function$;

CREATE OR REPLACE FUNCTION public.compare_market_geographies_v1(p_geography_ids text[])
 RETURNS TABLE(geography_id text, geography_code text, geography_name text, jurisdiction text, geography_type text, latest_sales_period date, latest_rent_period date, median_sale_price_12m numeric, annual_price_change_pct numeric, sales_sample_confidence text, median_weekly_rent_latest numeric, annual_rent_change_pct numeric, rent_confidence text, gross_yield_pct numeric, yield_confidence text, dwelling_stock_total integer, approvals_per_1000_dwellings numeric, total_population integer, median_weekly_household_income integer, price_to_income_ratio numeric, est_monthly_repayment_owner_occupier numeric, confidence_label text, missing_metric_reasons jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart'
AS $function$
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
$function$;
comment on function public.compare_market_geographies_v1(text[]) is 'Side-by-side comparison of 2-10 geographies (NSW and/or VIC, suburb and/or postcode) for the /research/compare UI. Row count strictly enforced (2-10) inside the function. Widened from 2-5 in Sprint 11 Workstream 12. No composite score, no ranking, no buy/pass output — raw metric comparison only, with confidence and missing_metric_reasons preserved per row.';

CREATE OR REPLACE FUNCTION public.get_market_map_markers_v1(p_min_lat numeric, p_max_lat numeric, p_min_lon numeric, p_max_lon numeric, p_geography_type text DEFAULT NULL::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(geography_id text, geography_type text, geography_code text, geography_name text, state_code text, jurisdiction text, centroid_lat numeric, centroid_lon numeric, median_sale_price_12m numeric, sales_confidence text, median_weekly_rent_latest numeric, rent_confidence text, has_full_snapshot boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'core', 'mart', 'meta'
AS $function$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 1500);
begin
  if p_min_lat is null or p_max_lat is null or p_min_lon is null or p_max_lon is null then
    raise exception 'bounding box (p_min_lat, p_max_lat, p_min_lon, p_max_lon) is required';
  end if;
  if p_min_lat < -45 or p_max_lat > -8 or p_min_lon < 108 or p_max_lon > 156 then
    raise exception 'bounding box outside Australia''s valid range';
  end if;
  if p_min_lat >= p_max_lat or p_min_lon >= p_max_lon then
    raise exception 'invalid bounding box: min must be less than max';
  end if;
  if p_geography_type is not null and p_geography_type not in ('SAL', 'POA', 'LGA') then
    raise exception 'invalid geography_type: must be SAL, POA or LGA';
  end if;

  return query
  with snap as (
    select geography_id, median_sale_price_12m, sales_sample_confidence, median_weekly_rent_latest, rent_confidence, true as full_snap
    from mart.suburb_market_snapshot
    where dwelling_type is null and (median_sale_price_12m is not null or median_weekly_rent_latest is not null)
    union all
    select geography_id, median_sale_price_12m, sales_sample_confidence, median_weekly_rent_latest, rent_confidence, true as full_snap
    from mart.postcode_market_snapshot
    where dwelling_type is null and (median_sale_price_12m is not null or median_weekly_rent_latest is not null)
  ),
  rent_only as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.suburb_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  ),
  rent_only_poa as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.postcode_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  ),
  rent_only_lga as (
    select distinct on (geography_id) geography_id, median_weekly_rent, confidence_label
    from mart.lga_rent_quarterly
    where median_weekly_rent is not null
    order by geography_id, reference_quarter desc
  )
  select
    g.geography_id, g.geography_type, g.geography_code, g.geography_name, g.state_code,
    j.jurisdiction_code as jurisdiction,
    g.centroid_lat, g.centroid_lon,
    s.median_sale_price_12m, s.sales_sample_confidence,
    coalesce(s.median_weekly_rent_latest, ro.median_weekly_rent, rop.median_weekly_rent, rol.median_weekly_rent) as median_weekly_rent_latest,
    coalesce(s.rent_confidence, ro.confidence_label, rop.confidence_label, rol.confidence_label) as rent_confidence,
    coalesce(s.full_snap, false) as has_full_snapshot
  from core.dim_geography g
  left join meta.jurisdiction j on j.asgs_state_code = g.state_code
  left join snap s on s.geography_id = g.geography_id
  left join rent_only ro on ro.geography_id = g.geography_id and g.geography_type = 'SAL'
  left join rent_only_poa rop on rop.geography_id = g.geography_id and g.geography_type = 'POA'
  left join rent_only_lga rol on rol.geography_id = g.geography_id and g.geography_type = 'LGA'
  where g.geography_type in ('SAL', 'POA', 'LGA')
    and g.is_current
    and g.centroid_lat between p_min_lat and p_max_lat
    and g.centroid_lon between p_min_lon and p_max_lon
    and (p_geography_type is null or g.geography_type = p_geography_type)
    and (s.geography_id is not null or ro.geography_id is not null or rop.geography_id is not null or rol.geography_id is not null)
  limit v_limit;
end;
$function$;
comment on function public.get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer) is 'Bounding-box-limited map markers for the /research/map national explorer (Sprint 11 WS11). Row limit clamped 1-1500 and bounding box validated to Australia''s range inside the function — no unbounded public endpoint. Only returns geographies with at least one loaded metric (sale price or rent) — never a marker with nothing to show. Covers NSW/VIC (full snapshot) plus QLD/SA/WA (rent-only, via the Sprint 11 WS9 fact-layer promotion) — the first interface in this project to surface all 5 jurisdictions with loaded data together. No score, no ranking, no colour-coded "best suburb" implication left to this function — presentation choices belong to the frontend.';

CREATE OR REPLACE FUNCTION public.get_market_timeseries_v2(p_geography_id text)
 RETURNS TABLE(geography_id text, geography_type text, jurisdiction text, state_code text, reference_period date, period_type text, dwelling_type text, metric_family text, transaction_count integer, median_sale_price numeric, median_weekly_rent numeric, gross_yield_percentage numeric, approvals_count integer, confidence_label text, source_dataset text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart'
AS $function$
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
$function$;
comment on function public.get_market_timeseries_v2(text) is 'Jurisdiction-aware time-series lookup for a single geography_id, superseding get_market_timeseries_v1 for the multi-state UI. v1 remains available for backward compatibility.';

CREATE OR REPLACE FUNCTION public.get_metric_lineage_v1(p_geography_id text, p_mart_table text, p_metric_family text)
 RETURNS TABLE(found boolean, jurisdiction text, row_confidence text, row_provenance jsonb, is_derived boolean, transformation_method text, correspondence_version text, source_name text, publisher text, source_url text, licence text, dataset_name text, lineage_complete boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'mart', 'meta'
AS $function$
declare
  v_jurisdiction text;
  v_confidence text;
  v_provenance jsonb;
begin
  if p_mart_table not in ('suburb_market_snapshot', 'postcode_market_snapshot') then
    raise exception 'unknown mart_table: %', p_mart_table;
  end if;

  if p_mart_table = 'suburb_market_snapshot' then
    select m.jurisdiction, m.confidence_label, m.metric_provenance
      into v_jurisdiction, v_confidence, v_provenance
    from mart.suburb_market_snapshot m
    where m.geography_id = p_geography_id and m.dwelling_type is null;
  else
    select m.jurisdiction, m.confidence_label, m.metric_provenance
      into v_jurisdiction, v_confidence, v_provenance
    from mart.postcode_market_snapshot m
    where m.geography_id = p_geography_id and m.dwelling_type is null;
  end if;

  if not found then
    return query select false, null::text, null::text, null::jsonb, null::boolean, null::text, null::text, null::text, null::text, null::text, null::text, null::text, false;
    return;
  end if;

  return query
    select
      true,
      v_jurisdiction,
      v_confidence,
      v_provenance,
      r.is_derived,
      r.transformation_method,
      r.correspondence_version,
      s.source_name,
      s.publisher,
      s.source_url,
      s.licence,
      ds.dataset_name,
      (r.lineage_id is not null)
    from (select 1) x
    left join meta.metric_lineage_registry r
      on r.mart_table = p_mart_table and r.metric_name = p_metric_family
      and (r.jurisdiction_code = v_jurisdiction or r.jurisdiction_code is null)
    left join meta.source s on s.source_id = r.source_id
    left join meta.dataset ds on ds.dataset_id = r.dataset_id
    order by (r.jurisdiction_code is not null) desc nulls last
    limit 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_warehouse_operations_summary_v1()
 RETURNS TABLE(total_datasets integer, branch_published_count integer, local_only_count integer, blocked_or_unsupported_count integer, branch_db_size_mb numeric, last_run_started_at timestamp with time zone, last_run_status text, runs_last_30_days integer, runs_failed_last_30_days integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'meta'
AS $function$
  select
    (select count(*)::int from meta.dataset_freshness_status),
    (select count(*)::int from meta.dataset_freshness_status where local_only_or_branch_published = 'branch_published'),
    (select count(*)::int from meta.dataset_freshness_status where local_only_or_branch_published = 'local_only'),
    (select count(*)::int from meta.dataset_freshness_status where freshness_status in ('blocked', 'failed')),
    round((pg_database_size(current_database())::numeric / 1024 / 1024), 1),
    (select max(started_at) from meta.dataset_refresh_run),
    (select status from meta.dataset_refresh_run order by started_at desc limit 1),
    (select count(*)::int from meta.dataset_refresh_run where started_at > now() - interval '30 days'),
    (select count(*)::int from meta.dataset_refresh_run where started_at > now() - interval '30 days' and status = 'failed');
$function$;
comment on function public.get_warehouse_operations_summary_v1() is 'Aggregate operations summary for the data operations console — dataset counts by publication status, branch database size (safe to expose, not a secret), and recent refresh-run activity. No credentials, no connection strings, no per-row internal detail.';
