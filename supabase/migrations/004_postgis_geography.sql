-- ============================================================
-- Propellect — PostGIS Geography Support (Sprint 1.5)
--
-- Prepares core.dim_geography for the ABS ASGS geography backbone
-- (Sprint 2). SAL/POA/SA2/LGA boundaries arrive as polygons; we need
-- real geometry to:
--   * validate that loaded areas are well-formed and non-overlapping
--   * compute centroids and areas instead of trusting source fields
--   * derive spatial correspondences (e.g. SA1 -> SAL/POA allocation)
--     where ABS does not publish an official correspondence file
--   * support future map display and point-in-polygon suburb lookup
--
-- Idempotent and non-destructive: `if not exists` throughout, no data
-- loads, no secrets, nothing removed. Do NOT apply to the linked
-- Supabase project without approval.
-- ============================================================

-- ── 1. PostGIS extension ─────────────────────────────────────
-- Supabase convention: extensions live in the `extensions` schema,
-- which is on the default search_path.
create extension if not exists postgis with schema extensions;

-- ── 2. Geometry column on core.dim_geography ─────────────────
-- MultiPolygon because many areas (coastal suburbs, islands, split
-- localities) are not single polygons. SRID 4326 (WGS84 lon/lat).
--
-- IMPORTANT: ABS publishes ASGS boundaries in GDA2020 (EPSG:7844) or
-- GDA94 (EPSG:4283). Loaders MUST transform source geometries to
-- EPSG:4326 (ST_Transform) before insert — the SRID constraint below
-- rejects anything else, it does not convert it.
alter table core.dim_geography
  add column if not exists geom extensions.geometry(MultiPolygon, 4326);

comment on column core.dim_geography.geom is
  'Boundary as MultiPolygon in EPSG:4326. Source ABS geometries (GDA2020/GDA94) must be ST_Transformed to 4326 before loading.';

-- ── 3. Spatial index ─────────────────────────────────────────
-- GIST index for point-in-polygon lookups (address -> suburb) and
-- spatial joins between structures (SAL x POA, SA1 x LGA, ...).
create index if not exists dim_geography_geom_gix
  on core.dim_geography using gist (geom);
