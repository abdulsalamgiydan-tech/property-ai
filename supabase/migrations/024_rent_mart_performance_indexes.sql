-- ============================================================
-- Propellect — Rent mart performance indexes (Sprint 11, WS17)
--
-- Live EXPLAIN ANALYZE during the performance audit found the national
-- map viewport query (get_market_map_markers_v1, migration 020) taking
-- ~1,060ms at a 1,500-row national bounding box — under the 2,000ms
-- target but the slowest measured query by a wide margin (next-slowest
-- was 121ms). Root cause: the "latest quarter WITH a non-null rent"
-- lookup (DISTINCT ON (geography_id) ... WHERE median_weekly_rent IS NOT
-- NULL ORDER BY geography_id, reference_quarter DESC) had no index
-- matching that exact filter+order shape — the existing unique index on
-- (geography_id, reference_quarter, dwelling_type) doesn't cover the
-- NOT NULL predicate. A partial index does.
--
-- Additive only, no data change.
-- ============================================================

create index if not exists mart_suburb_rent_geo_period_notnull_idx
  on mart.suburb_rent_quarterly (geography_id, reference_quarter desc)
  where median_weekly_rent is not null;

create index if not exists mart_postcode_rent_geo_period_notnull_idx
  on mart.postcode_rent_quarterly (geography_id, reference_quarter desc)
  where median_weekly_rent is not null;

create index if not exists mart_lga_rent_geo_period_notnull_idx
  on mart.lga_rent_quarterly (geography_id, reference_quarter desc)
  where median_weekly_rent is not null;
