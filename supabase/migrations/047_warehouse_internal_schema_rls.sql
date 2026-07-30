-- Sprint 18 -- defense-in-depth: enable RLS on core/mart/staging/meta tables.
--
-- Finding: Supabase's own security advisor flags these 53 tables as having
-- RLS disabled. Verified this is NOT currently exploitable via the public
-- API -- anon/authenticated have no USAGE privilege on core, mart, staging,
-- or meta (established by migrations 014/023's schema-level revoke), so
-- PostgREST can never reach these tables regardless of RLS state. This has
-- also been the case since these schemas were first created (no migration
-- 003-036 ever enabled RLS on them) -- not a regression, a pre-existing gap.
--
-- Enabling RLS here with NO policies is a purely additive second line of
-- defense: service_role bypasses RLS entirely (standard Supabase BYPASSRLS
-- role attribute), so ETL/admin loaders are unaffected; anon/authenticated
-- already can't reach these tables via the schema-level revoke, so this
-- changes no observable behaviour today. It only matters if a future
-- migration ever accidentally grants schema USAGE without also restoring
-- RLS -- this closes that specific future failure mode now, while it's
-- cheap and low-risk, rather than leaving it to be caught later.
--
-- No policies are added deliberately: these are ETL-loaded, curated
-- reference tables the app never has authenticated users write to directly;
-- the only intended read surface is the narrow, already-hardened set of
-- views/functions from migrations 014/016/046, not these tables themselves.

alter table core.dim_geography enable row level security;
alter table core.dim_geography_version enable row level security;
alter table core.bridge_geography_relationship enable row level security;
alter table core.bridge_geography_correspondence enable row level security;
alter table core.fact_dwelling_stock enable row level security;
alter table core.fact_household_tenure enable row level security;
alter table core.fact_building_approvals enable row level security;
alter table core.fact_residential_sales_summary enable row level security;
alter table core.fact_rental_market_summary enable row level security;
alter table core.fact_interest_rates enable row level security;
alter table core.fact_dwelling_construction_activity enable row level security;

alter table mart.suburb_market_snapshot enable row level security;
alter table mart.postcode_market_snapshot enable row level security;
alter table mart.suburb_dwelling_stock_2021 enable row level security;
alter table mart.postcode_dwelling_stock_2021 enable row level security;
alter table mart.suburb_building_approvals enable row level security;
alter table mart.postcode_building_approvals enable row level security;
alter table mart.suburb_sales_monthly enable row level security;
alter table mart.suburb_sales_annual enable row level security;
alter table mart.postcode_sales_monthly enable row level security;
alter table mart.postcode_sales_annual enable row level security;
alter table mart.suburb_rent_quarterly enable row level security;
alter table mart.postcode_rent_quarterly enable row level security;
alter table mart.suburb_yield_quarterly enable row level security;
alter table mart.postcode_yield_quarterly enable row level security;
alter table mart.national_interest_rate_context enable row level security;
alter table mart.suburb_demographic_profile_2021 enable row level security;
alter table mart.postcode_demographic_profile_2021 enable row level security;
alter table mart.suburb_market_timeseries enable row level security;
alter table mart.postcode_market_timeseries enable row level security;
alter table mart.lga_rent_quarterly enable row level security;
alter table mart.sa2_dwelling_stock_2021 enable row level security;
alter table mart.lga_dwelling_stock_2021 enable row level security;

alter table staging.asgs_geography enable row level security;
alter table staging.asgs_correspondence enable row level security;
alter table staging.census_dwelling_stock enable row level security;

alter table meta.source enable row level security;
alter table meta.dataset enable row level security;
alter table meta.load_run enable row level security;
alter table meta.source_file enable row level security;
alter table meta.data_quality_result enable row level security;
alter table meta.coverage_result enable row level security;
alter table meta.publication_approval enable row level security;
alter table meta.metric_assumption enable row level security;
alter table meta.jurisdiction enable row level security;
alter table meta.dataset_refresh_policy enable row level security;
alter table meta.dataset_refresh_run enable row level security;
alter table meta.dataset_freshness_status enable row level security;
alter table meta.metric_lineage_registry enable row level security;
alter table meta.data_quality_rule enable row level security;
alter table meta.data_quality_run enable row level security;
alter table meta.data_incident enable row level security;
alter table meta.data_quarantine_summary enable row level security;
