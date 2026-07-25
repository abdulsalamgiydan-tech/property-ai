-- ============================================================
-- Propellect — 2021 Census Dwelling Stock (Sprint 3, Part B)
--
-- First real dataset onto the ASGS geography backbone: dwelling
-- counts and household tenure from the official ABS 2021 Census
-- (GCP DataPacks + Mesh Block counts).
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads, no secrets. Requires
-- migrations 003 (meta/core/mart) and 004 (PostGIS). Branch
-- database only until approved for production.
-- ============================================================

-- ── 1. staging.census_dwelling_stock ─────────────────────────
-- Grain: one row per geography x census table cell as published.
-- NOTE: with the local-first strategy the primary staging surface
-- is the local DuckDB store (warehouse/data/local/census_2021.duckdb);
-- this table exists for optional branch-side staging/debug and is
-- expected to stay small or empty.
create table if not exists staging.census_dwelling_stock (
  staging_id         uuid primary key default gen_random_uuid(),
  load_run_id        uuid references meta.load_run(load_run_id),
  source_id          text references meta.source(source_id),
  dataset_id         text references meta.dataset(dataset_id),
  source_file_id     uuid references meta.source_file(source_file_id),
  geography_type     text not null,             -- SAL | POA | SA2 | SA1 | LGA
  geography_code     text not null,             -- official ABS code as published
  census_year        integer not null,          -- 2021
  gcp_table          text,                      -- e.g. 'G31' — as confirmed from pack metadata
  source_column      text,                      -- exact DataPack column name
  measure_name       text not null,             -- normalised measure (occupied_private_dwellings, ...)
  dwelling_type      text,                      -- separate_house | semi_detached_row_terrace_townhouse | flat_apartment | other_dwelling | not_stated | all
  value_count        integer,                   -- NULL when not published; never zero-filled
  raw_attributes     jsonb,
  is_quarantined     boolean not null default false,
  quarantine_reason  text,
  created_at         timestamptz not null default now()
);
comment on table staging.census_dwelling_stock is
  'Source-shaped 2021 Census dwelling cells. Grain: geography x census table cell. Primary staging is the local DuckDB store; this table is for optional branch-side staging.';
create index if not exists stg_census_dwelling_geo_idx
  on staging.census_dwelling_stock (geography_type, geography_code);
create index if not exists stg_census_dwelling_run_idx
  on staging.census_dwelling_stock (load_run_id);

-- ── 2. core.fact_dwelling_stock ──────────────────────────────
-- Grain: one row per geography x census year x measure x dwelling type.
create table if not exists core.fact_dwelling_stock (
  dwelling_stock_id    uuid primary key default gen_random_uuid(),
  geography_id         text references core.dim_geography(geography_id),
  geography_type       text not null,
  geography_code       text not null,
  reference_period     date not null,           -- Census night: 2021-08-10
  census_year          integer not null,
  measure_name         text not null,           -- total_private_dwellings | occupied_private_dwellings | unoccupied_private_dwellings
  dwelling_type        text not null,           -- all | separate_house | semi_detached_row_terrace_townhouse | flat_apartment | other_dwelling | not_stated
  dwelling_count       integer,                 -- NULL when not published; never zero-filled; >= 0 when present
  source_id            text references meta.source(source_id),
  dataset_id           text references meta.dataset(dataset_id),
  load_run_id          uuid references meta.load_run(load_run_id),
  source_file_id       uuid references meta.source_file(source_file_id),
  data_quality_status  text,                    -- passed | quarantined_upstream | ...
  confidence_label     text,                    -- high | medium | low | insufficient_data
  created_at           timestamptz not null default now(),
  unique (geography_id, census_year, measure_name, dwelling_type)
);
comment on table core.fact_dwelling_stock is
  'Dwelling stock facts from the ABS Census. Grain: one row per geography x census_year x measure_name x dwelling_type. Counts are NULL when the ABS does not publish the cell — never imputed as zero.';
create index if not exists fact_dwelling_geo_idx
  on core.fact_dwelling_stock (geography_id, census_year);
create index if not exists fact_dwelling_type_code_idx
  on core.fact_dwelling_stock (geography_type, geography_code, census_year);
create index if not exists fact_dwelling_measure_idx
  on core.fact_dwelling_stock (measure_name, dwelling_type, census_year);

-- ── 3. core.fact_household_tenure ────────────────────────────
-- Grain: one row per geography x census year x tenure type.
create table if not exists core.fact_household_tenure (
  household_tenure_id  uuid primary key default gen_random_uuid(),
  geography_id         text references core.dim_geography(geography_id),
  geography_type       text not null,
  geography_code       text not null,
  reference_period     date not null,
  census_year          integer not null,
  tenure_type          text not null,           -- owned_outright | owned_with_mortgage | rented | other_tenure | not_stated | all
  household_count      integer,                 -- occupied private dwellings with that tenure; NULL when unpublished
  source_id            text references meta.source(source_id),
  dataset_id           text references meta.dataset(dataset_id),
  load_run_id          uuid references meta.load_run(load_run_id),
  source_file_id       uuid references meta.source_file(source_file_id),
  data_quality_status  text,
  confidence_label     text,
  created_at           timestamptz not null default now(),
  unique (geography_id, census_year, tenure_type)
);
comment on table core.fact_household_tenure is
  'Household tenure facts from the ABS Census (GCP tenure table). Grain: one row per geography x census_year x tenure_type. NULL means unpublished, never zero.';
create index if not exists fact_tenure_geo_idx
  on core.fact_household_tenure (geography_id, census_year);
create index if not exists fact_tenure_type_idx
  on core.fact_household_tenure (tenure_type, census_year);

-- ── 4. mart.suburb_dwelling_stock_2021 ───────────────────────
-- Grain: one row per SAL suburb (boundary version ASGS3_2021).
create table if not exists mart.suburb_dwelling_stock_2021 (
  mart_row_id                     uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_name                  text,
  state_code                      text,
  census_year                     integer not null default 2021,
  total_private_dwellings         integer,
  occupied_private_dwellings      integer,
  unoccupied_private_dwellings    integer,
  separate_house                  integer,
  semi_detached_row_terrace       integer,
  flat_apartment                  integer,
  other_dwelling                  integer,
  owner_households                integer,     -- owned outright + owned with mortgage
  renter_households               integer,
  correspondence_method           text,        -- how SA1 facts were carried to SAL (e.g. sa1_dwelling_weighted)
  data_coverage_score             numeric,     -- 0..1
  confidence_label                text,
  source_summary                  jsonb,
  created_at                      timestamptz not null default now(),
  unique (geography_id, census_year)
);
comment on table mart.suburb_dwelling_stock_2021 is
  '2021 Census dwelling stock published at suburb (SAL). Grain: one row per SAL. Built from SA1 facts via the ASGS correspondence bridge (dwelling-weighted where available); NULL means unpublished/insufficient, never zero.';
create index if not exists mart_suburb_dwelling_state_idx
  on mart.suburb_dwelling_stock_2021 (state_code);

-- ── 5. mart.postcode_dwelling_stock_2021 ─────────────────────
-- Grain: one row per POA postcode (boundary version ASGS3_2021).
create table if not exists mart.postcode_dwelling_stock_2021 (
  mart_row_id                     uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_name                  text,
  state_code                      text,
  census_year                     integer not null default 2021,
  total_private_dwellings         integer,
  occupied_private_dwellings      integer,
  unoccupied_private_dwellings    integer,
  separate_house                  integer,
  semi_detached_row_terrace       integer,
  flat_apartment                  integer,
  other_dwelling                  integer,
  owner_households                integer,
  renter_households               integer,
  correspondence_method           text,
  data_coverage_score             numeric,
  confidence_label                text,
  source_summary                  jsonb,
  created_at                      timestamptz not null default now(),
  unique (geography_id, census_year)
);
comment on table mart.postcode_dwelling_stock_2021 is
  '2021 Census dwelling stock published at postcode (POA). Grain: one row per POA. Built from SA1 facts via the ASGS correspondence bridge (dwelling-weighted where available); NULL means unpublished/insufficient, never zero.';
create index if not exists mart_postcode_dwelling_state_idx
  on mart.postcode_dwelling_stock_2021 (state_code);
