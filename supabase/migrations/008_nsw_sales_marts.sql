-- ============================================================
-- Propellect — NSW Valuer General Sales Pilot (Sprint 5)
--
-- First market-price dataset onto the ASGS backbone: settled
-- residential sale prices from the official NSW Valuer General
-- Property Sales Information (PSI) bulk files.
--
-- Local-first, curated-only: the full raw transaction history
-- (individual sale records) stays in the local DuckDB store and
-- is NEVER loaded to Supabase. Only pre-aggregated summary facts
-- and marts are promoted, keeping the branch disk lean.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads, no secrets. Requires
-- migrations 003-007. Branch database only until approved.
-- ============================================================

-- ── 1. core.fact_residential_sales_summary ───────────────────
-- Grain: one row per geography x reference period x period type x
-- dwelling type. Pre-aggregated from the local raw transaction
-- store — no individual sale rows exist in Supabase.
create table if not exists core.fact_residential_sales_summary (
  sales_summary_id            uuid primary key default gen_random_uuid(),
  geography_id                text references core.dim_geography(geography_id),
  geography_type               text not null,            -- SAL | POA (text-matched to PSI suburb/postcode, not ABS-code-native)
  geography_code                text not null,
  reference_period              date not null,            -- first day of the month or year
  period_type                    text not null,            -- month | year
  dwelling_type                  text not null,            -- detached_house | apartment_unit | townhouse_villa_semidetached | residential_land | other_residential | unknown_residential
  transaction_count              integer not null,          -- market (non-flagged) settled sales included in the stats below
  median_sale_price              numeric,
  mean_sale_price                numeric,
  lower_quartile_sale_price      numeric,
  upper_quartile_sale_price      numeric,
  min_sale_price                 numeric,
  max_sale_price                 numeric,
  sample_size_confidence         text not null,             -- high (30+) | medium (10-29) | low (5-9) | insufficient (<5)
  source_id                      text references meta.source(source_id),
  dataset_id                     text references meta.dataset(dataset_id),
  load_run_id                    uuid references meta.load_run(load_run_id),
  source_file_id                 uuid references meta.source_file(source_file_id),
  data_quality_status            text,
  confidence_label                text,
  created_at                      timestamptz not null default now(),
  unique (geography_id, reference_period, period_type, dwelling_type)
);
comment on table core.fact_residential_sales_summary is
  'Pre-aggregated NSW residential sale price summary from the Valuer General PSI bulk files. Grain: one row per geography x reference_period x period_type x dwelling_type. Raw transaction records are never loaded here — only local-store-computed summary statistics. Medians below the sample-size confidence thresholds are still published but flagged: consumers must check sample_size_confidence before treating a median as reliable. Non-arm''s-length / nominal-value transfers are excluded from these statistics upstream in the local build. NULL means insufficient data, never zero.';
create index if not exists fact_sales_geo_period_idx
  on core.fact_residential_sales_summary (geography_id, reference_period desc, period_type);
create index if not exists fact_sales_period_type_idx
  on core.fact_residential_sales_summary (period_type, reference_period desc, dwelling_type);
create index if not exists fact_sales_code_idx
  on core.fact_residential_sales_summary (geography_type, geography_code);

-- ── 2. mart.suburb_sales_monthly ─────────────────────────────
-- Grain: one row per SAL suburb x month x dwelling type.
create table if not exists mart.suburb_sales_monthly (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_month                 date not null,
  dwelling_type                   text not null,
  transaction_count               integer,
  median_sale_price               numeric,
  mean_sale_price                 numeric,
  lower_quartile_sale_price       numeric,
  upper_quartile_sale_price       numeric,
  sample_size_confidence          text,
  confidence_label                 text,
  source_summary                   jsonb,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (geography_id, reference_month, dwelling_type)
);
comment on table mart.suburb_sales_monthly is
  'Suburb (SAL) monthly settled residential sales summary from the NSW VG PSI pilot. Grain: one row per SAL x month x dwelling_type. NULL means insufficient data for that cell, never zero. sample_size_confidence must be checked before treating median_sale_price as reliable.';
create index if not exists mart_suburb_sales_monthly_state_idx
  on mart.suburb_sales_monthly (state_code, reference_month desc);

-- ── 3. mart.suburb_sales_annual ──────────────────────────────
-- Grain: one row per SAL suburb x year x dwelling type.
create table if not exists mart.suburb_sales_annual (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_year                  date not null,          -- first day of the calendar year
  dwelling_type                   text not null,
  transaction_count               integer,
  median_sale_price               numeric,
  mean_sale_price                 numeric,
  lower_quartile_sale_price       numeric,
  upper_quartile_sale_price       numeric,
  sample_size_confidence          text,
  confidence_label                 text,
  source_summary                   jsonb,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (geography_id, reference_year, dwelling_type)
);
comment on table mart.suburb_sales_annual is
  'Suburb (SAL) annual settled residential sales summary from the NSW VG PSI pilot. Grain: one row per SAL x calendar year x dwelling_type. NULL means insufficient data, never zero.';
create index if not exists mart_suburb_sales_annual_state_idx
  on mart.suburb_sales_annual (state_code, reference_year desc);

-- ── 4. mart.postcode_sales_monthly ───────────────────────────
-- Grain: one row per POA postcode x month x dwelling type.
create table if not exists mart.postcode_sales_monthly (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_month                 date not null,
  dwelling_type                   text not null,
  transaction_count               integer,
  median_sale_price               numeric,
  mean_sale_price                 numeric,
  lower_quartile_sale_price       numeric,
  upper_quartile_sale_price       numeric,
  sample_size_confidence          text,
  confidence_label                 text,
  source_summary                   jsonb,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (geography_id, reference_month, dwelling_type)
);
comment on table mart.postcode_sales_monthly is
  'Postcode (POA) monthly settled residential sales summary from the NSW VG PSI pilot. Grain: one row per POA x month x dwelling_type. NULL means insufficient data, never zero.';
create index if not exists mart_postcode_sales_monthly_state_idx
  on mart.postcode_sales_monthly (state_code, reference_month desc);

-- ── 5. mart.postcode_sales_annual ────────────────────────────
-- Grain: one row per POA postcode x year x dwelling type.
create table if not exists mart.postcode_sales_annual (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_year                  date not null,
  dwelling_type                   text not null,
  transaction_count               integer,
  median_sale_price               numeric,
  mean_sale_price                 numeric,
  lower_quartile_sale_price       numeric,
  upper_quartile_sale_price       numeric,
  sample_size_confidence          text,
  confidence_label                 text,
  source_summary                   jsonb,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (geography_id, reference_year, dwelling_type)
);
comment on table mart.postcode_sales_annual is
  'Postcode (POA) annual settled residential sales summary from the NSW VG PSI pilot. Grain: one row per POA x calendar year x dwelling_type. NULL means insufficient data, never zero.';
create index if not exists mart_postcode_sales_annual_state_idx
  on mart.postcode_sales_annual (state_code, reference_year desc);
