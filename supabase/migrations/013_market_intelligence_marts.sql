-- ============================================================
-- Propellect — Unified Market Intelligence Marts (Sprint 9, Phase 4)
--
-- Extends the two never-populated placeholder tables created back in
-- migration 003 (mart.suburb_market_snapshot / mart.postcode_market_snapshot)
-- into the full Sprint 9 "wide row per geography" shape via additive
-- ALTER TABLE statements (confirmed via repo-wide grep: these tables are
-- referenced nowhere in app code, so extending them is safe — see
-- warehouse/reports/sprint9_existing_state_audit.json). Also creates
-- meta.metric_assumption (transparent, non-hardcoded repayment assumptions)
-- and two compact time-series marts.
--
-- Idempotent and non-destructive: `if not exists` / `add column if not
-- exists` throughout, no DROP / TRUNCATE / DELETE, no data loads in this
-- migration, no secrets. Branch database only until approved for production.
--
-- NULL-distinctness note (Sprint 7/8 lesson, applied proactively): every
-- new unique index below uses coalesce(nullable_col, sentinel) rather than
-- a plain UNIQUE constraint on nullable columns.
-- ============================================================

-- ── 1. meta.metric_assumption ─────────────────────────────────
-- Grain: one row per scenario_code x assumption_name. Transparent,
-- queryable assumptions rather than formulas hardcoded in application code.
create table if not exists meta.metric_assumption (
  assumption_id     uuid primary key default gen_random_uuid(),
  scenario_code      text not null,           -- e.g. 'standard_20pct_deposit_30yr_pi'
  assumption_name      text not null,          -- e.g. 'deposit_percent', 'loan_term_years'
  numeric_value          numeric,
  text_value               text,
  unit                       text,             -- 'percent' | 'years' | 'text' | etc.
  effective_from               date not null,
  effective_to                   date,          -- NULL = still current
  source_notes                    text,
  created_at                        timestamptz not null default now()
);
comment on table meta.metric_assumption is
  'Transparent, queryable modelling assumptions (e.g. deposit percentage, loan term) used by the affordability calculations in mart.suburb_market_snapshot / mart.postcode_market_snapshot. Grain: one row per scenario_code x assumption_name x effective period. This is a documented baseline scenario for research purposes, not financial advice or a recommendation.';
create index if not exists metric_assumption_scenario_idx
  on meta.metric_assumption (scenario_code, effective_from desc);
create unique index if not exists metric_assumption_natural_key
  on meta.metric_assumption (scenario_code, assumption_name, effective_from);

-- ── 2. mart.suburb_market_snapshot — additive extension ───────
-- Prior grain (migration 003): one row per geography x reference_month x
-- dwelling_type (tall). New Sprint 9 columns below make this a WIDE row per
-- geography (one row per geography_id) — the legacy dwelling_type/
-- median_sale_price/median_rent/gross_yield/population_growth_1y/
-- dwelling_approvals_12m columns are kept for backward compatibility
-- (unused by any app code — confirmed by audit) but superseded by the
-- per-type columns below. New rows always use dwelling_type = NULL.
alter table mart.suburb_market_snapshot add column if not exists geography_code text;
alter table mart.suburb_market_snapshot add column if not exists latest_sales_period date;
alter table mart.suburb_market_snapshot add column if not exists latest_rent_period date;
alter table mart.suburb_market_snapshot add column if not exists latest_yield_period date;
alter table mart.suburb_market_snapshot add column if not exists latest_approvals_period date;
alter table mart.suburb_market_snapshot add column if not exists latest_demographics_period integer; -- census_year
alter table mart.suburb_market_snapshot add column if not exists snapshot_generated_at timestamptz;
alter table mart.suburb_market_snapshot add column if not exists coverage_status text; -- 'full' | 'partial' | 'insufficient'

alter table mart.suburb_market_snapshot add column if not exists sales_volume_12m integer;
alter table mart.suburb_market_snapshot add column if not exists median_sale_price_12m numeric;
alter table mart.suburb_market_snapshot add column if not exists median_sale_price_prev_12m numeric;
alter table mart.suburb_market_snapshot add column if not exists annual_price_change_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists median_sale_price_detached numeric;
alter table mart.suburb_market_snapshot add column if not exists median_sale_price_apartment numeric;
alter table mart.suburb_market_snapshot add column if not exists median_sale_price_townhouse numeric;
alter table mart.suburb_market_snapshot add column if not exists sales_sample_confidence text;

alter table mart.suburb_market_snapshot add column if not exists median_weekly_rent_latest numeric;
alter table mart.suburb_market_snapshot add column if not exists median_weekly_rent_prev numeric;
alter table mart.suburb_market_snapshot add column if not exists annual_rent_change_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists rent_confidence text;

alter table mart.suburb_market_snapshot add column if not exists gross_yield_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists yield_confidence text;
alter table mart.suburb_market_snapshot add column if not exists yield_sale_period_used date;
alter table mart.suburb_market_snapshot add column if not exists yield_rent_period_used date;

alter table mart.suburb_market_snapshot add column if not exists dwelling_stock_total integer;
alter table mart.suburb_market_snapshot add column if not exists approvals_12m integer;
alter table mart.suburb_market_snapshot add column if not exists approvals_per_1000_dwellings numeric;
alter table mart.suburb_market_snapshot add column if not exists approvals_detached_12m integer;
alter table mart.suburb_market_snapshot add column if not exists approvals_other_residential_12m integer;
alter table mart.suburb_market_snapshot add column if not exists supply_confidence text;

alter table mart.suburb_market_snapshot add column if not exists sales_turnover_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists renter_household_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists owner_occupier_pct numeric;

alter table mart.suburb_market_snapshot add column if not exists total_population integer;
alter table mart.suburb_market_snapshot add column if not exists population_growth_2016_2021_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists total_households integer;
alter table mart.suburb_market_snapshot add column if not exists median_weekly_household_income integer;
alter table mart.suburb_market_snapshot add column if not exists renter_share numeric;
alter table mart.suburb_market_snapshot add column if not exists owner_with_mortgage_share numeric;

alter table mart.suburb_market_snapshot add column if not exists price_to_income_ratio numeric;
alter table mart.suburb_market_snapshot add column if not exists rent_to_income_ratio numeric;
alter table mart.suburb_market_snapshot add column if not exists est_monthly_repayment_owner_occupier numeric;
alter table mart.suburb_market_snapshot add column if not exists est_monthly_repayment_investor numeric;
alter table mart.suburb_market_snapshot add column if not exists repayment_to_income_pct numeric;
alter table mart.suburb_market_snapshot add column if not exists rba_rate_used numeric;
alter table mart.suburb_market_snapshot add column if not exists rba_rate_period date;
alter table mart.suburb_market_snapshot add column if not exists assumption_scenario_code text;
alter table mart.suburb_market_snapshot add column if not exists affordability_confidence text;

alter table mart.suburb_market_snapshot add column if not exists data_quality_status text;
alter table mart.suburb_market_snapshot add column if not exists direct_or_derived text;
alter table mart.suburb_market_snapshot add column if not exists source_periods jsonb;
alter table mart.suburb_market_snapshot add column if not exists metric_provenance jsonb;
alter table mart.suburb_market_snapshot add column if not exists missing_metric_reasons jsonb;

comment on table mart.suburb_market_snapshot is
  'Unified latest market-intelligence snapshot, one WIDE row per SAL (suburb) geography, combining sales/rent/yield/supply/demographics/affordability. Originally created as a narrower placeholder in migration 003 (Sprint 1); extended additively in Sprint 9. Legacy columns (dwelling_type/median_sale_price/median_rent/gross_yield/population_growth_1y/dwelling_approvals_12m) are superseded by the per-type/per-module columns added here and are unused by new rows (dwelling_type=NULL). Missing metrics stay NULL with a reason in missing_metric_reasons — never zero-filled. Descriptive research context only — not a recommendation, score, AVM or forecast.';
create unique index if not exists suburb_market_snapshot_wide_row_key
  on mart.suburb_market_snapshot (geography_id, (coalesce(dwelling_type, '')))
  where dwelling_type is null; -- only constrains the new wide-row shape; legacy tall rows (if any were ever inserted) are untouched

-- ── 3. mart.postcode_market_snapshot — identical extension ────
alter table mart.postcode_market_snapshot add column if not exists geography_code text;
alter table mart.postcode_market_snapshot add column if not exists latest_sales_period date;
alter table mart.postcode_market_snapshot add column if not exists latest_rent_period date;
alter table mart.postcode_market_snapshot add column if not exists latest_yield_period date;
alter table mart.postcode_market_snapshot add column if not exists latest_approvals_period date;
alter table mart.postcode_market_snapshot add column if not exists latest_demographics_period integer;
alter table mart.postcode_market_snapshot add column if not exists snapshot_generated_at timestamptz;
alter table mart.postcode_market_snapshot add column if not exists coverage_status text;

alter table mart.postcode_market_snapshot add column if not exists sales_volume_12m integer;
alter table mart.postcode_market_snapshot add column if not exists median_sale_price_12m numeric;
alter table mart.postcode_market_snapshot add column if not exists median_sale_price_prev_12m numeric;
alter table mart.postcode_market_snapshot add column if not exists annual_price_change_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists median_sale_price_detached numeric;
alter table mart.postcode_market_snapshot add column if not exists median_sale_price_apartment numeric;
alter table mart.postcode_market_snapshot add column if not exists median_sale_price_townhouse numeric;
alter table mart.postcode_market_snapshot add column if not exists sales_sample_confidence text;

alter table mart.postcode_market_snapshot add column if not exists median_weekly_rent_latest numeric;
alter table mart.postcode_market_snapshot add column if not exists median_weekly_rent_prev numeric;
alter table mart.postcode_market_snapshot add column if not exists annual_rent_change_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists rent_confidence text;

alter table mart.postcode_market_snapshot add column if not exists gross_yield_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists yield_confidence text;
alter table mart.postcode_market_snapshot add column if not exists yield_sale_period_used date;
alter table mart.postcode_market_snapshot add column if not exists yield_rent_period_used date;

alter table mart.postcode_market_snapshot add column if not exists dwelling_stock_total integer;
alter table mart.postcode_market_snapshot add column if not exists approvals_12m integer;
alter table mart.postcode_market_snapshot add column if not exists approvals_per_1000_dwellings numeric;
alter table mart.postcode_market_snapshot add column if not exists approvals_detached_12m integer;
alter table mart.postcode_market_snapshot add column if not exists approvals_other_residential_12m integer;
alter table mart.postcode_market_snapshot add column if not exists supply_confidence text;

alter table mart.postcode_market_snapshot add column if not exists sales_turnover_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists renter_household_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists owner_occupier_pct numeric;

alter table mart.postcode_market_snapshot add column if not exists total_population integer;
alter table mart.postcode_market_snapshot add column if not exists population_growth_2016_2021_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists total_households integer;
alter table mart.postcode_market_snapshot add column if not exists median_weekly_household_income integer;
alter table mart.postcode_market_snapshot add column if not exists renter_share numeric;
alter table mart.postcode_market_snapshot add column if not exists owner_with_mortgage_share numeric;

alter table mart.postcode_market_snapshot add column if not exists price_to_income_ratio numeric;
alter table mart.postcode_market_snapshot add column if not exists rent_to_income_ratio numeric;
alter table mart.postcode_market_snapshot add column if not exists est_monthly_repayment_owner_occupier numeric;
alter table mart.postcode_market_snapshot add column if not exists est_monthly_repayment_investor numeric;
alter table mart.postcode_market_snapshot add column if not exists repayment_to_income_pct numeric;
alter table mart.postcode_market_snapshot add column if not exists rba_rate_used numeric;
alter table mart.postcode_market_snapshot add column if not exists rba_rate_period date;
alter table mart.postcode_market_snapshot add column if not exists assumption_scenario_code text;
alter table mart.postcode_market_snapshot add column if not exists affordability_confidence text;

alter table mart.postcode_market_snapshot add column if not exists data_quality_status text;
alter table mart.postcode_market_snapshot add column if not exists direct_or_derived text;
alter table mart.postcode_market_snapshot add column if not exists source_periods jsonb;
alter table mart.postcode_market_snapshot add column if not exists metric_provenance jsonb;
alter table mart.postcode_market_snapshot add column if not exists missing_metric_reasons jsonb;

comment on table mart.postcode_market_snapshot is
  'Unified latest market-intelligence snapshot, one WIDE row per POA (postcode) geography. Same construction, NULL-handling and legacy-column notes as mart.suburb_market_snapshot.';
create unique index if not exists postcode_market_snapshot_wide_row_key
  on mart.postcode_market_snapshot (geography_id, (coalesce(dwelling_type, '')))
  where dwelling_type is null;

-- ── 4. mart.suburb_market_timeseries ──────────────────────────
-- Grain: one row per geography x reference_period x period_type x
-- dwelling_type x metric_family. Compact — only the columns relevant to
-- metric_family are populated per row; others stay NULL by design (this is
-- NOT a "missing data" NULL, it is "not applicable to this metric family").
create table if not exists mart.suburb_market_timeseries (
  ts_row_id           uuid primary key default gen_random_uuid(),
  geography_id          text references core.dim_geography(geography_id),
  geography_type          text not null default 'SAL',
  reference_period          date not null,
  period_type                text not null,          -- 'month' | 'quarter'
  dwelling_type                text,                  -- NULL = 'all' (rent/yield); populated for sales (detached_house/apartment_unit)
  metric_family                  text not null,       -- 'sales' | 'rent' | 'yield' | 'approvals' | 'rate'
  transaction_count                 integer,          -- sales
  median_sale_price                  numeric,         -- sales
  median_weekly_rent                   numeric,       -- rent
  gross_yield_percentage                 numeric,     -- yield
  approvals_count                          integer,   -- approvals (rolling-12m point)
  rate_percent                              numeric,  -- rate (RBA context, same period alignment)
  confidence_label                           text not null,
  source_dataset                              text,
  created_at                                   timestamptz not null default now()
);
comment on table mart.suburb_market_timeseries is
  'Compact recent-trend time series for suburb (SAL) research: sales (trailing 12 months, detached_house/apartment_unit only), rent+yield (latest ~8 quarters), approvals (current rolling-12m point). Reduced from the original 36-month/20-quarter target for branch-capacity reasons — see warehouse/reports/sprint9_capacity_plan.md. Full-history detail remains available in the existing mart.suburb_sales_monthly/annual, mart.suburb_rent_quarterly and mart.suburb_yield_quarterly tables — this mart is specifically a compact recent-trend view.';
create index if not exists suburb_market_timeseries_geo_period_idx
  on mart.suburb_market_timeseries (geography_id, reference_period desc);
create unique index if not exists suburb_market_timeseries_natural_key
  on mart.suburb_market_timeseries (geography_id, reference_period, period_type, (coalesce(dwelling_type, '')), metric_family);

-- ── 5. mart.postcode_market_timeseries ────────────────────────
create table if not exists mart.postcode_market_timeseries (
  ts_row_id           uuid primary key default gen_random_uuid(),
  geography_id          text references core.dim_geography(geography_id),
  geography_type          text not null default 'POA',
  reference_period          date not null,
  period_type                text not null,
  dwelling_type                text,
  metric_family                  text not null,
  transaction_count                 integer,
  median_sale_price                  numeric,
  median_weekly_rent                   numeric,
  gross_yield_percentage                 numeric,
  approvals_count                          integer,
  rate_percent                              numeric,
  confidence_label                           text not null,
  source_dataset                              text,
  created_at                                   timestamptz not null default now()
);
comment on table mart.postcode_market_timeseries is
  'Compact recent-trend time series for postcode (POA) research. Same construction and capacity-reduction notes as mart.suburb_market_timeseries.';
create index if not exists postcode_market_timeseries_geo_period_idx
  on mart.postcode_market_timeseries (geography_id, reference_period desc);
create unique index if not exists postcode_market_timeseries_natural_key
  on mart.postcode_market_timeseries (geography_id, reference_period, period_type, (coalesce(dwelling_type, '')), metric_family);
