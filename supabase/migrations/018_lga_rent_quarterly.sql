-- ============================================================
-- Propellect — LGA rent mart (Sprint 11, Workstream 9)
--
-- core.fact_rental_market_summary already carries LGA-grain rent
-- facts (NSW DCJ's own LGA-grain rent, loaded Sprint 6) but no
-- LGA-grain mart view was ever built to expose it — 48,024 NSW LGA
-- rent facts have sat unqueryable since Sprint 6. QLD's RTA rent
-- (Workstream 6) also publishes at LGA grain. VIC has ZERO rows in
-- this fact table at all — its rent data lives entirely in
-- mart.suburb_market_snapshot, loaded via a different Sprint 10
-- pipeline, not this shared fact table.
--
-- Mirrors mart.suburb_rent_quarterly / mart.postcode_rent_quarterly
-- exactly (same columns, same unique constraint, same index shape)
-- rather than inventing a new pattern.
--
-- Idempotent and non-destructive: `if not exists` throughout, no
-- DROP / TRUNCATE / DELETE, no data loads, no secrets. Branch
-- database only until approved.
-- ============================================================

create table if not exists mart.lga_rent_quarterly (
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
  correspondence_method                 text,     -- direct_lga_match — LGA is a native published grain for these sources
  source_summary                        jsonb,
  created_at                             timestamptz not null default now(),
  updated_at                              timestamptz not null default now(),
  unique (geography_id, reference_quarter, dwelling_type)
);
comment on table mart.lga_rent_quarterly is
  'LGA quarterly new-bond median rent, combining NSW DCJ (Sprint 6 data, dormant/unexposed until this mart was built in Sprint 11 WS9) and QLD RTA (Sprint 11 WS6). VIC has zero LGA-grain rows in core.fact_rental_market_summary — its rent data lives entirely in mart.suburb_market_snapshot instead. Grain: one row per LGA x quarter x dwelling_type. NULL means insufficient/unpublished data, never zero.';
create index if not exists mart_lga_rent_state_idx
  on mart.lga_rent_quarterly (state_code, reference_quarter desc);
