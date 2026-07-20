-- ============================================================
-- Propellect — NSW Rental Bonds + Gross Yield Pilot (Sprint 6)
--
-- Rental market data from the official NSW DCJ Rent and Sales
-- Report (quarterly new-bond-lodgement rent statistics), plus
-- gross-yield marts combining this with the Sprint 5 NSW VG
-- sales pilot marts.
--
-- Local-first, curated-only: the full quarterly rent tables stay
-- in the local DuckDB store; only pre-aggregated summary facts
-- and marts are promoted, keeping the branch disk lean.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads, no secrets. Requires
-- migrations 003-008. Branch database only until approved.
-- ============================================================

-- ── 1. core.fact_rental_market_summary ───────────────────────
-- Grain: one row per geography x reference quarter x dwelling
-- type x bedroom count (bedroom_count NULL = "Total" across beds).
create table if not exists core.fact_rental_market_summary (
  rental_summary_id    uuid primary key default gen_random_uuid(),
  geography_id         text references core.dim_geography(geography_id),
  geography_type       text not null,             -- LGA | POA
  geography_code       text not null,
  reference_period     date not null,             -- first day of the quarter
  period_type          text not null,             -- quarter
  dwelling_type        text not null,              -- detached_house | apartment_unit | townhouse_villa_semidetached | other_residential | unknown_residential | all
  bedroom_count         integer,                    -- NULL = "Total" (all bedroom counts); bedsitter recorded as 0
  median_weekly_rent    numeric,                    -- NULL when suppressed/unpublished, never zero-filled
  lower_quartile_weekly_rent numeric,
  upper_quartile_weekly_rent numeric,
  rental_count          integer,                    -- new bonds lodged in the quarter (sample size)
  total_bonds_held      integer,
  measure_name           text not null default 'new_bond_median_weekly_rent',
  source_id              text references meta.source(source_id),
  dataset_id              text references meta.dataset(dataset_id),
  load_run_id              uuid references meta.load_run(load_run_id),
  source_file_id            uuid references meta.source_file(source_file_id),
  data_quality_status        text,
  confidence_label            text,               -- based on rental_count sample size, same thresholds as Sprint 5 sales
  created_at                   timestamptz not null default now(),
  unique (geography_id, reference_period, dwelling_type, bedroom_count)
);
comment on table core.fact_rental_market_summary is
  'Quarterly new-bond-lodgement rent statistics from the NSW DCJ Rent and Sales Report. Grain: one row per geography x reference_period(quarter) x dwelling_type x bedroom_count. Suppressed/unpublished cells (per DCJ''s own <=10 and <=30 bond thresholds) stay NULL, never zero-filled or estimated.';
create index if not exists fact_rental_geo_period_idx
  on core.fact_rental_market_summary (geography_id, reference_period desc);
create index if not exists fact_rental_type_code_idx
  on core.fact_rental_market_summary (geography_type, geography_code, reference_period desc);
create index if not exists fact_rental_dwelling_idx
  on core.fact_rental_market_summary (dwelling_type, bedroom_count, reference_period desc);

-- ── 2. mart.suburb_rent_quarterly ────────────────────────────
-- Grain: one row per SAL suburb x quarter x dwelling type.
-- NOTE: DCJ rent tables publish at LGA/Postcode grain only, never
-- suburb/SAL. SAL rent here is DERIVED from the POA-grain facts by
-- chaining the existing SA1->POA and SA1->SAL correspondence
-- weights (core.bridge_geography_correspondence, built in Sprints
-- 2-3) into a POA->SAL apportionment — the same weighted-bridge
-- pattern used for Census/Building-Approvals marts, not a new
-- ad hoc heuristic. correspondence_method on the row records this.
create table if not exists mart.suburb_rent_quarterly (
  mart_row_id                uuid primary key default gen_random_uuid(),
  geography_id                text references core.dim_geography(geography_id),
  geography_name               text,
  state_code                    text,
  reference_quarter              date not null,
  dwelling_type                    text not null,
  median_weekly_rent                numeric,
  rental_count                       integer,
  sample_size_confidence              text,
  confidence_label                     text,
  correspondence_method                 text,     -- poa_to_sal_dwelling_weighted (derived) — SAL is never a direct DCJ grain
  source_summary                        jsonb,
  created_at                             timestamptz not null default now(),
  updated_at                              timestamptz not null default now(),
  unique (geography_id, reference_quarter, dwelling_type)
);
comment on table mart.suburb_rent_quarterly is
  'Suburb (SAL) quarterly new-bond median rent from the NSW DCJ Rent and Sales Report pilot. Grain: one row per SAL x quarter x dwelling_type. NULL means insufficient/unpublished data, never zero.';
create index if not exists mart_suburb_rent_state_idx
  on mart.suburb_rent_quarterly (state_code, reference_quarter desc);

-- ── 3. mart.postcode_rent_quarterly ──────────────────────────
-- Grain: one row per POA postcode x quarter x dwelling type.
create table if not exists mart.postcode_rent_quarterly (
  mart_row_id                uuid primary key default gen_random_uuid(),
  geography_id                text references core.dim_geography(geography_id),
  geography_name               text,
  state_code                    text,
  reference_quarter              date not null,
  dwelling_type                    text not null,
  median_weekly_rent                numeric,
  rental_count                       integer,
  sample_size_confidence              text,
  confidence_label                     text,
  correspondence_method                 text,     -- direct_postcode_match — POA is the DCJ-native grain
  source_summary                        jsonb,
  created_at                             timestamptz not null default now(),
  updated_at                              timestamptz not null default now(),
  unique (geography_id, reference_quarter, dwelling_type)
);
comment on table mart.postcode_rent_quarterly is
  'Postcode (POA) quarterly new-bond median rent from the NSW DCJ Rent and Sales Report pilot. Grain: one row per POA x quarter x dwelling_type. NULL means insufficient/unpublished data, never zero.';
create index if not exists mart_postcode_rent_state_idx
  on mart.postcode_rent_quarterly (state_code, reference_quarter desc);

-- ── 4. mart.suburb_yield_quarterly ───────────────────────────
-- Grain: one row per SAL suburb x quarter x dwelling type.
-- Research metric only — NOT a recommendation, score or forecast.
create table if not exists mart.suburb_yield_quarterly (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_name                   text,
  state_code                        text,
  reference_period                    date not null,
  dwelling_type                        text not null,
  median_sale_price                     numeric,
  median_weekly_rent                     numeric,
  annualised_rent                         numeric,     -- median_weekly_rent * 52
  gross_yield_percentage                   numeric,    -- annualised_rent / median_sale_price * 100
  sales_transaction_count                   integer,
  rental_sample_count                        integer,
  sales_confidence_label                      text,
  rental_confidence_label                      text,
  yield_confidence_label                        text,  -- combined; 'insufficient' when either side is too thin — never a bare number without this label
  source_summary                                 jsonb,
  created_at                                      timestamptz not null default now(),
  updated_at                                       timestamptz not null default now(),
  unique (geography_id, reference_period, dwelling_type)
);
comment on table mart.suburb_yield_quarterly is
  'Research-only gross rental yield for suburbs (SAL), combining the Sprint 5 NSW VG sales pilot with the Sprint 6 NSW DCJ rent pilot. Grain: one row per SAL x reference_period x dwelling_type. This is a descriptive statistic, not an investment recommendation, score, AVM or forecast. Yield is only computed when both sides have sufficient sample size; otherwise gross_yield_percentage is NULL and yield_confidence_label = ''insufficient''.';
create index if not exists mart_suburb_yield_state_idx
  on mart.suburb_yield_quarterly (state_code, reference_period desc);

-- ── 5. mart.postcode_yield_quarterly ─────────────────────────
-- Grain: one row per POA postcode x quarter x dwelling type.
create table if not exists mart.postcode_yield_quarterly (
  mart_row_id                    uuid primary key default gen_random_uuid(),
  geography_id                    text references core.dim_geography(geography_id),
  geography_name                   text,
  state_code                        text,
  reference_period                    date not null,
  dwelling_type                        text not null,
  median_sale_price                     numeric,
  median_weekly_rent                     numeric,
  annualised_rent                         numeric,
  gross_yield_percentage                   numeric,
  sales_transaction_count                   integer,
  rental_sample_count                        integer,
  sales_confidence_label                      text,
  rental_confidence_label                      text,
  yield_confidence_label                        text,
  source_summary                                 jsonb,
  created_at                                      timestamptz not null default now(),
  updated_at                                       timestamptz not null default now(),
  unique (geography_id, reference_period, dwelling_type)
);
comment on table mart.postcode_yield_quarterly is
  'Research-only gross rental yield for postcodes (POA), combining the Sprint 5 NSW VG sales pilot with the Sprint 6 NSW DCJ rent pilot. Grain: one row per POA x reference_period x dwelling_type. This is a descriptive statistic, not an investment recommendation, score, AVM or forecast. Yield is only computed when both sides have sufficient sample size; otherwise gross_yield_percentage is NULL and yield_confidence_label = ''insufficient''.';
create index if not exists mart_postcode_yield_state_idx
  on mart.postcode_yield_quarterly (state_code, reference_period desc);
