-- ============================================================
-- Propellect — SA2/LGA dwelling stock marts (Sprint 11, WS9 sub-pass 2)
--
-- Unlike mart.suburb_dwelling_stock_2021 / mart.postcode_dwelling_stock_2021
-- (built from SA1 facts via a dwelling-weighted correspondence bridge,
-- since SAL/POA are not both native ABS Census geographies), SA2 and LGA
-- ARE native ABS Census GCP DataPack geographies — core.fact_dwelling_stock
-- already contains DIRECT SA2 (19,632 rows, dataset_id=census_gcp_sa2_2021)
-- and LGA (4,376 rows, dataset_id=census_gcp_lga_2021) facts loaded in an
-- earlier sprint, confirmed live before writing this migration. These
-- marts are therefore built as a direct pass-through, not a correspondence
-- -weighted derivation — simpler and more accurate than any approximation.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads in this migration itself.
-- ============================================================

create table if not exists mart.sa2_dwelling_stock_2021 (
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
  renter_households                integer,
  correspondence_method            text,        -- direct_native_census_geography — SA2 is a native ABS GCP DataPack level
  data_coverage_score              numeric,
  confidence_label                  text,
  source_summary                    jsonb,
  created_at                        timestamptz not null default now(),
  unique (geography_id, census_year)
);
comment on table mart.sa2_dwelling_stock_2021 is
  '2021 Census dwelling stock published at SA2. Grain: one row per SA2. SA2 is a native ABS Census GCP DataPack geography — built as a direct pass-through of core.fact_dwelling_stock, not correspondence-derived. NULL means unpublished/insufficient, never zero.';
create index if not exists mart_sa2_dwelling_state_idx
  on mart.sa2_dwelling_stock_2021 (state_code);

create table if not exists mart.lga_dwelling_stock_2021 (
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
  renter_households                integer,
  correspondence_method            text,        -- direct_native_census_geography — LGA is a native ABS GCP DataPack level
  data_coverage_score              numeric,
  confidence_label                  text,
  source_summary                    jsonb,
  created_at                        timestamptz not null default now(),
  unique (geography_id, census_year)
);
comment on table mart.lga_dwelling_stock_2021 is
  '2021 Census dwelling stock published at LGA. Grain: one row per LGA. LGA is a native ABS Census GCP DataPack geography — built as a direct pass-through of core.fact_dwelling_stock, not correspondence-derived. NULL means unpublished/insufficient, never zero.';
create index if not exists mart_lga_dwelling_state_idx
  on mart.lga_dwelling_stock_2021 (state_code);
