-- ============================================================
-- Propellect — ABS Building Approvals Supply Module (Sprint 4)
--
-- First housing supply dataset onto the ASGS backbone: dwelling
-- unit approvals from the official ABS Building Approvals
-- collection (ABS Data API dataflow BA_SA2, SA2 / ASGS Ed.3).
--
-- Local-first: the full monthly series stays in the local DuckDB
-- store; only curated facts (recent months + rolling totals) and
-- the suburb/postcode supply marts are promoted to the branch.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads, no secrets. Requires
-- migrations 003-006. Branch database only until approved.
-- ============================================================

-- ── 1. core.fact_building_approvals ──────────────────────────
-- Grain: one row per geography x reference period x period type x
-- dwelling type x measure.
create table if not exists core.fact_building_approvals (
  building_approval_id  uuid primary key default gen_random_uuid(),
  geography_id          text references core.dim_geography(geography_id),
  geography_type        text not null,             -- SA2 (source grain); higher levels derivable
  geography_code        text not null,
  reference_period      date not null,             -- first day of the period
  period_type           text not null,             -- month | rolling_12m
  dwelling_type         text not null,             -- houses | other_residential | total_dwellings
  approval_count        integer,                   -- dwelling units approved; NULL when unpublished, never zero-filled
  approval_value        numeric,                   -- value of building ($) where published; NULL otherwise
  measure_name          text not null,             -- dwelling_units_approved | value_of_building
  source_id             text references meta.source(source_id),
  dataset_id            text references meta.dataset(dataset_id),
  load_run_id           uuid references meta.load_run(load_run_id),
  source_file_id        uuid references meta.source_file(source_file_id),
  data_quality_status   text,
  confidence_label      text,
  created_at            timestamptz not null default now(),
  unique (geography_id, reference_period, period_type, dwelling_type, measure_name)
);
comment on table core.fact_building_approvals is
  'Dwelling approvals from ABS Building Approvals (Data API BA_SA2, ASGS Ed.3 SA2 grain). Grain: one row per geography x reference_period x period_type x dwelling_type x measure_name. Curated subset of the full local series: trailing monthly rows plus rolling 12-month totals. NULL means unpublished — never zero.';
create index if not exists fact_ba_geo_period_idx
  on core.fact_building_approvals (geography_id, reference_period desc, period_type);
create index if not exists fact_ba_period_type_idx
  on core.fact_building_approvals (period_type, reference_period desc, dwelling_type);
create index if not exists fact_ba_code_idx
  on core.fact_building_approvals (geography_type, geography_code);

-- ── 2. mart.suburb_building_approvals ────────────────────────
-- Grain: one row per SAL suburb x reference (rolling-12m end) period.
create table if not exists mart.suburb_building_approvals (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_period               date not null,    -- end month of the rolling 12m window
  approvals_12m_total            integer,
  approvals_12m_houses           integer,
  approvals_12m_other            integer,
  existing_dwellings_2021        integer,          -- from mart.suburb_dwelling_stock_2021
  approvals_per_1000_dwellings   numeric,          -- approvals_12m_total / existing dwellings x 1000
  correspondence_method          text,             -- sa2_dwelling_weighted etc.
  data_coverage_score            numeric,
  confidence_label               text,
  source_summary                 jsonb,
  created_at                     timestamptz not null default now(),
  unique (geography_id, reference_period)
);
comment on table mart.suburb_building_approvals is
  'Suburb (SAL) housing supply pressure: rolling 12-month dwelling approvals carried from SA2 via the dwelling-weighted ASGS correspondence, normalised per 1,000 existing 2021 Census dwellings. NULL means insufficient data — never zero.';
create index if not exists mart_suburb_ba_state_idx
  on mart.suburb_building_approvals (state_code, reference_period desc);

-- ── 3. mart.postcode_building_approvals ──────────────────────
-- Grain: one row per POA postcode x reference (rolling-12m end) period.
create table if not exists mart.postcode_building_approvals (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                   text references core.dim_geography(geography_id),
  geography_name                 text,
  state_code                     text,
  reference_period               date not null,
  approvals_12m_total            integer,
  approvals_12m_houses           integer,
  approvals_12m_other            integer,
  existing_dwellings_2021        integer,          -- from mart.postcode_dwelling_stock_2021
  approvals_per_1000_dwellings   numeric,
  correspondence_method          text,
  data_coverage_score            numeric,
  confidence_label               text,
  source_summary                 jsonb,
  created_at                     timestamptz not null default now(),
  unique (geography_id, reference_period)
);
comment on table mart.postcode_building_approvals is
  'Postcode (POA) housing supply pressure: rolling 12-month dwelling approvals carried from SA2 via the dwelling-weighted ASGS correspondence, normalised per 1,000 existing 2021 Census dwellings. NULL means insufficient data — never zero.';
create index if not exists mart_postcode_ba_state_idx
  on mart.postcode_building_approvals (state_code, reference_period desc);
