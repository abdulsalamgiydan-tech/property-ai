-- ============================================================
-- Propellect — ASGS Staging Tables (Sprint 2, Part B)
--
-- Staging layer for the ABS ASGS geography backbone load. Rows here
-- are typed but still source-shaped; conformance happens on promotion
-- to core.dim_geography and the geography bridges. Every row is tied
-- to its load run / source file for lineage, and bad rows are
-- quarantined in place (never silently fixed or removed).
--
-- Idempotent and non-destructive: `if not exists` throughout, no data
-- loads, no secrets, nothing removed. Requires migrations 003 (meta
-- tables) and 004 (PostGIS). Branch database only until approved.
-- ============================================================

-- Grain: one row per geography area per source boundary file per load run.
create table if not exists staging.asgs_geography (
  staging_id         uuid primary key default gen_random_uuid(),
  load_run_id        uuid references meta.load_run(load_run_id),
  source_id          text references meta.source(source_id),
  dataset_id         text references meta.dataset(dataset_id),
  source_file_id     uuid references meta.source_file(source_file_id),
  geography_type     text not null,               -- STATE | GCCSA | SA4 | SA3 | SA2 | SA1 | LGA | SAL | POA
  geography_code     text not null,               -- official ABS code as published
  geography_name     text,
  state_code         text,
  state_name         text,
  parent_code        text,                        -- containment parent code as published (main structure only)
  boundary_version   text,                        -- e.g. 'ASGS3_2021'
  reference_period   text,
  area_square_km     numeric,                     -- as published; recomputed from geometry at core promotion
  source_srid        integer,                     -- SRID of the source file (GDA2020=7844 / GDA94=4283)
  geom               extensions.geometry(MultiPolygon, 4326),  -- already ST_Transformed to 4326 at staging load
  raw_attributes     jsonb,                       -- full raw source row for audit/replay
  is_quarantined     boolean not null default false,
  quarantine_reason  text,                        -- e.g. 'invalid_geometry', 'duplicate_code'
  created_at         timestamptz not null default now()
);

create index if not exists stg_asgs_geo_type_code_idx
  on staging.asgs_geography (geography_type, geography_code);
create index if not exists stg_asgs_geo_load_run_idx
  on staging.asgs_geography (load_run_id);
create index if not exists stg_asgs_geo_quarantine_idx
  on staging.asgs_geography (is_quarantined) where is_quarantined;
create index if not exists stg_asgs_geo_geom_gix
  on staging.asgs_geography using gist (geom);

-- Grain: one row per source-area -> target-area allocation row per load run
-- (SA1->SAL/POA/LGA from official ABS files; SA2->SAL/POA/LGA derived).
create table if not exists staging.asgs_correspondence (
  staging_id             uuid primary key default gen_random_uuid(),
  load_run_id            uuid references meta.load_run(load_run_id),
  source_id              text references meta.source(source_id),
  dataset_id             text references meta.dataset(dataset_id),
  source_file_id         uuid references meta.source_file(source_file_id),
  source_geography_type  text not null,           -- SA1 | SA2
  source_geography_code  text not null,
  target_geography_type  text not null,           -- SAL | POA | LGA
  target_geography_code  text not null,
  ratio                  numeric,                 -- allocation ratio as published/derived (0..1); NULL if unknown, never 0-filled
  ratio_basis            text,                    -- dwelling | population | area | abs_published
  correspondence_method  text,                    -- abs_sa1_allocation | derived_sa1_aggregation | spatial_overlay
  correspondence_version text,
  boundary_version       text,
  reference_period       text,
  raw_attributes         jsonb,                   -- full raw source row for audit/replay
  is_quarantined         boolean not null default false,
  quarantine_reason      text,                    -- e.g. 'weights_do_not_reconcile', 'unknown_code'
  created_at             timestamptz not null default now()
);

create index if not exists stg_asgs_corr_source_idx
  on staging.asgs_correspondence (source_geography_type, source_geography_code);
create index if not exists stg_asgs_corr_target_idx
  on staging.asgs_correspondence (target_geography_type, target_geography_code);
create index if not exists stg_asgs_corr_load_run_idx
  on staging.asgs_correspondence (load_run_id);
create index if not exists stg_asgs_corr_quarantine_idx
  on staging.asgs_correspondence (is_quarantined) where is_quarantined;
