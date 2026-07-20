-- ============================================================
-- Fix (Sprint 7): core.fact_rental_market_summary's plain UNIQUE
-- constraint (geography_id, reference_period, dwelling_type,
-- bedroom_count) does not prevent duplicate "Total" rows
-- (bedroom_count IS NULL) because SQL treats NULL as distinct
-- from NULL. Additive-only fix: a new expression-based unique
-- index that coalesces bedroom_count to a sentinel so NULL rows
-- for the same (geography, period, dwelling_type) correctly
-- collide. No DROP — the original constraint stays in place too.
-- ============================================================
create unique index if not exists fact_rental_market_summary_null_safe_key
  on core.fact_rental_market_summary (geography_id, reference_period, dwelling_type, (coalesce(bedroom_count, -1)));
