-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 2 of 8.
--
-- core.dim_geography -- the ASGS geography dimension (STATE/GCCSA/SA4/SA3/
-- SA2/SA1/LGA/SAL/POA), read directly by 3 of the 8 granted research
-- functions (search_market_geographies_v2, get_market_map_markers_v1,
-- compare_market_geographies_v1 via the mart FKs below) and 1 of the 10
-- granted views (v_market_geography_search_v1).
--
-- Column set and constraints extracted byte-accurate from
-- warehouse-validation via pg_attribute/pg_attrdef/pg_get_constraintdef
-- (not hand-retyped from the historical 003-036 migration range, which
-- built this table up incrementally across ~7 separate files).
--
-- Deliberately excludes the `geom geometry(MultiPolygon,4326)` column and
-- its GiST index (dim_geography_geom_gix) -- confirmed unused by every
-- granted view/function (see 048's header and
-- warehouse/reports/sprint18_2_minimum_launch_contract.md). Only the plain
-- centroid_lat/centroid_lon numeric columns are read at query time.

create table if not exists core.dim_geography (
  "geography_id" text not null,
  "geography_type" text not null,
  "geography_code" text not null,
  "geography_name" text not null,
  "state_code" text,
  "state_name" text,
  "parent_geography_id" text,
  "boundary_version" text,
  "valid_from" date,
  "valid_to" date,
  "area_square_km" numeric,
  "centroid_lat" numeric,
  "centroid_lon" numeric,
  "is_current" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  constraint dim_geography_pkey primary key (geography_id),
  constraint dim_geography_geography_type_geography_code_boundary_versio_key
    unique (geography_type, geography_code, boundary_version)
);

create index if not exists dim_geography_name_idx on core.dim_geography using btree (geography_name);
create index if not exists dim_geography_parent_idx on core.dim_geography using btree (parent_geography_id);
create index if not exists dim_geography_type_code_idx on core.dim_geography using btree (geography_type, geography_code);
