-- ============================================================
-- Propellect — Warehouse Foundation Migration (Sprint 1)
--
-- Creates the research warehouse skeleton for the Australian
-- residential property warehouse: schemas, load/quality metadata,
-- the geography backbone dimensions, and placeholder mart tables.
--
-- Idempotent and non-destructive: `if not exists` throughout,
-- no DROP statements, no data loads, no secrets.
-- Do NOT apply to the linked Supabase project without approval.
-- ============================================================

-- ── 0. Schemas ───────────────────────────────────────────────
-- meta    : source register, load runs, quality results, approvals
-- raw     : landed source data, as received (populated in later sprints)
-- staging : typed/cleaned, still source-shaped (later sprints)
-- core    : conformed dimensions and facts
-- mart    : published suburb/postcode outputs consumed by the app
-- audit   : change history and lineage (later sprints)

create schema if not exists meta;
create schema if not exists raw;
create schema if not exists staging;
create schema if not exists core;
create schema if not exists mart;
create schema if not exists audit;

-- ============================================================
-- 1. meta — warehouse metadata
-- ============================================================

-- Grain: one row per external data source (e.g. ABS ASGS, NSW VG sales).
create table if not exists meta.source (
  source_id               text primary key,
  source_name             text not null,
  publisher               text not null,
  source_category         text not null,          -- geography | demographics | sales | rentals | supply | finance
  official_or_independent text not null,          -- official | independent
  source_url              text,
  licence                 text,
  access_method           text,                   -- file_download | api | manual
  update_frequency        text,                   -- monthly | quarterly | five_yearly | ...
  implementation_status   text not null default 'identified',  -- identified | in_progress | live | retired
  known_limitations       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Grain: one row per distinct dataset/product within a source.
create table if not exists meta.dataset (
  dataset_id           text primary key,
  source_id            text references meta.source(source_id),
  dataset_name         text not null,
  geography_available  text,                      -- levels the source publishes at, e.g. 'SA2,LGA'
  earliest_period      text,
  latest_period        text,
  file_format          text,
  refresh_frequency    text,
  notes                text,
  created_at           timestamptz not null default now()
);

create index if not exists dataset_source_idx on meta.dataset (source_id);

-- Grain: one row per extract/load execution of a dataset.
create table if not exists meta.load_run (
  load_run_id          uuid primary key default gen_random_uuid(),
  dataset_id           text references meta.dataset(dataset_id),
  run_status           text not null,             -- running | succeeded | failed | quarantined
  started_at           timestamptz not null default now(),
  finished_at          timestamptz,
  records_extracted    integer,
  records_loaded       integer,
  records_quarantined  integer,
  error_message        text
);

create index if not exists load_run_dataset_started_idx
  on meta.load_run (dataset_id, started_at desc);

-- Grain: one row per physical file ingested during a load run.
-- file_hash enables change detection and reproducibility.
create table if not exists meta.source_file (
  source_file_id    uuid primary key default gen_random_uuid(),
  load_run_id       uuid references meta.load_run(load_run_id),
  source_id         text references meta.source(source_id),
  source_url        text,
  file_name         text,
  file_format       text,
  file_hash         text,
  reference_period  text,
  downloaded_at     timestamptz not null default now()
);

create index if not exists source_file_load_run_idx on meta.source_file (load_run_id);
create index if not exists source_file_hash_idx on meta.source_file (file_hash);

-- Grain: one row per quality rule evaluated per load run.
create table if not exists meta.data_quality_result (
  quality_result_id    uuid primary key default gen_random_uuid(),
  load_run_id          uuid references meta.load_run(load_run_id),
  dataset_id           text references meta.dataset(dataset_id),
  rule_id              text not null,             -- matches warehouse/config/quality_rules.yml
  severity             text not null,             -- blocker | warning | info
  status               text not null,             -- passed | failed | skipped
  failed_record_count  integer default 0,
  details              jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists dq_result_load_run_idx
  on meta.data_quality_result (load_run_id);
create index if not exists dq_result_dataset_rule_idx
  on meta.data_quality_result (dataset_id, rule_id);

-- Grain: one row per dataset × geography type × reference period,
-- comparing expected vs actual geography coverage.
create table if not exists meta.coverage_result (
  coverage_result_id  uuid primary key default gen_random_uuid(),
  dataset_id          text references meta.dataset(dataset_id),
  geography_type      text,                       -- SAL | POA | SA2 | ...
  reference_period    text,
  expected_count      integer,
  actual_count        integer,
  coverage_score      numeric,                    -- 0..1
  details             jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists coverage_result_dataset_idx
  on meta.coverage_result (dataset_id, reference_period);

-- Grain: one row per mart × reference period publication decision.
-- Nothing is served from mart without an 'approved' row here.
create table if not exists meta.publication_approval (
  approval_id       uuid primary key default gen_random_uuid(),
  mart_name         text not null,                -- e.g. 'mart.suburb_market_snapshot'
  reference_period  text,
  approval_status   text not null default 'pending',  -- pending | approved | rejected
  quality_summary   jsonb,
  approved_by       text,
  approved_at       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists publication_approval_mart_idx
  on meta.publication_approval (mart_name, reference_period);

-- ============================================================
-- 2. core — geography backbone
-- Internal model: STATE, GCCSA, SA4, SA3, SA2, SA1, LGA, SAL, POA.
-- Output levels: SAL (suburb) and POA (postcode).
-- Suburb ≠ postcode ≠ SA2 — cross-structure links live in the
-- correspondence bridge, not in parent pointers.
-- ============================================================

-- Grain: one row per geography area per boundary version.
-- geography_id convention: '<type>_<code>_<boundary_version>' (set at load time).
create table if not exists core.dim_geography (
  geography_id         text primary key,
  geography_type       text not null,             -- STATE | GCCSA | SA4 | SA3 | SA2 | SA1 | LGA | SAL | POA
  geography_code       text not null,             -- official ABS/state code
  geography_name       text not null,
  state_code           text,
  state_name           text,
  parent_geography_id  text,                      -- containment parent within the same structure only
  boundary_version     text,                      -- e.g. 'ASGS3_2021'
  valid_from           date,
  valid_to             date,
  area_square_km       numeric,
  centroid_lat         numeric,
  centroid_lon         numeric,
  is_current           boolean not null default true,
  created_at           timestamptz not null default now(),
  unique (geography_type, geography_code, boundary_version)
);

create index if not exists dim_geography_type_code_idx
  on core.dim_geography (geography_type, geography_code);
create index if not exists dim_geography_parent_idx
  on core.dim_geography (parent_geography_id);
create index if not exists dim_geography_name_idx
  on core.dim_geography (geography_name);

-- Grain: one row per geography type per boundary edition (tracks ASGS
-- editions and LGA boundary changes over time).
create table if not exists core.dim_geography_version (
  geography_version_id  text primary key,
  geography_type        text not null,
  boundary_version      text not null,
  source_id             text references meta.source(source_id),
  valid_from            date,
  valid_to              date,
  notes                 text,
  created_at            timestamptz not null default now()
);

-- Grain: one row per child→parent containment link per validity window.
-- Strict hierarchy only (SA1→SA2→SA3→SA4→GCCSA→STATE).
create table if not exists core.bridge_geography_relationship (
  relationship_id      uuid primary key default gen_random_uuid(),
  child_geography_id   text references core.dim_geography(geography_id),
  parent_geography_id  text references core.dim_geography(geography_id),
  relationship_type    text not null,             -- contains | administers
  valid_from           date,
  valid_to             date,
  created_at           timestamptz not null default now()
);

create index if not exists bridge_rel_child_idx
  on core.bridge_geography_relationship (child_geography_id);
create index if not exists bridge_rel_parent_idx
  on core.bridge_geography_relationship (parent_geography_id);

-- Grain: one row per source→target geography allocation per correspondence
-- version. Used to move data across structures (e.g. SA2 → SAL, SA1 → POA)
-- with explicit weights; preferred_weight is the one transforms should use.
create table if not exists core.bridge_geography_correspondence (
  correspondence_id       uuid primary key default gen_random_uuid(),
  source_geography_id     text references core.dim_geography(geography_id),
  target_geography_id     text references core.dim_geography(geography_id),
  source_geography_type   text not null,
  target_geography_type   text not null,
  area_weight             numeric,                -- 0..1 share of source area in target
  population_weight       numeric,
  dwelling_weight         numeric,
  preferred_weight        numeric,                -- dwelling > population > area fallback
  correspondence_method   text,                   -- e.g. 'abs_sa1_allocation'
  correspondence_version  text,
  confidence_score        numeric,
  effective_from          date,
  effective_to            date,
  created_at              timestamptz not null default now()
);

create index if not exists bridge_corr_source_idx
  on core.bridge_geography_correspondence (source_geography_id, target_geography_type);
create index if not exists bridge_corr_target_idx
  on core.bridge_geography_correspondence (target_geography_id, source_geography_type);

-- ============================================================
-- 3. mart — placeholder published outputs
-- Grain: one row per geography × reference month × dwelling type.
-- Metric columns are nullable by design: missing data stays missing
-- (NULL), never zero. confidence_label and data_coverage_score tell
-- consumers how much to trust each row.
-- ============================================================

create table if not exists mart.suburb_market_snapshot (
  snapshot_id             uuid primary key default gen_random_uuid(),
  geography_id            text references core.dim_geography(geography_id),  -- SAL-level id
  geography_name          text,
  state_code              text,
  reference_month         date,
  dwelling_type           text,                   -- house | unit | all
  median_sale_price       numeric,
  sales_volume            integer,
  median_rent             numeric,
  gross_yield             numeric,
  population_growth_1y    numeric,
  dwelling_approvals_12m  integer,
  data_coverage_score     numeric,                -- 0..1
  confidence_label        text,                   -- high | medium | low | insufficient_data
  source_summary          jsonb,                  -- which sources fed this row
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists suburb_snapshot_geo_month_idx
  on mart.suburb_market_snapshot (geography_id, reference_month desc, dwelling_type);
create index if not exists suburb_snapshot_state_month_idx
  on mart.suburb_market_snapshot (state_code, reference_month desc);

create table if not exists mart.postcode_market_snapshot (
  snapshot_id             uuid primary key default gen_random_uuid(),
  geography_id            text references core.dim_geography(geography_id),  -- POA-level id
  geography_name          text,
  state_code              text,
  reference_month         date,
  dwelling_type           text,                   -- house | unit | all
  median_sale_price       numeric,
  sales_volume            integer,
  median_rent             numeric,
  gross_yield             numeric,
  population_growth_1y    numeric,
  dwelling_approvals_12m  integer,
  data_coverage_score     numeric,
  confidence_label        text,
  source_summary          jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists postcode_snapshot_geo_month_idx
  on mart.postcode_market_snapshot (geography_id, reference_month desc, dwelling_type);
create index if not exists postcode_snapshot_state_month_idx
  on mart.postcode_market_snapshot (state_code, reference_month desc);
