-- Sprint 10 Phase 8 — Multi-state market intelligence schema extension.
--
-- Additive only. No DROP/TRUNCATE/DELETE. Extends the existing canonical
-- mart tables (mart.suburb_market_snapshot, mart.postcode_market_snapshot,
-- mart.suburb_market_timeseries, mart.postcode_market_timeseries) with a
-- jurisdiction column rather than creating VIC-specific duplicate tables,
-- per this sprint's explicit instruction.
--
-- Most of the columns this phase would otherwise add already exist from
-- migrations 003/013: state_code, geography_code, geography_name,
-- confidence_label (+ per-metric sales_sample_confidence/rent_confidence/
-- yield_confidence/supply_confidence), coverage_status, and
-- snapshot_generated_at already satisfy the source_coverage_status/
-- confidence_label/generated_at requirements on the snapshot tables — they
-- are not duplicated here. Only genuinely new columns are added.

-- ── 1. meta.jurisdiction — shared lookup, mirrors warehouse/config/jurisdictions.yml ──
create table if not exists meta.jurisdiction (
  jurisdiction_code   text primary key,        -- 'NSW' | 'VIC' | ...
  asgs_state_code     text not null,           -- core.dim_geography.state_code value, e.g. '1' for NSW, '2' for VIC
  display_name        text not null,
  status              text not null default 'active',  -- 'active' | 'planned'
  since_sprint         integer,
  created_at           timestamptz not null default now()
);
comment on table meta.jurisdiction is
  'Shared jurisdiction reference (mirrors warehouse/config/jurisdictions.yml). Used to give the mart tables'' new jurisdiction columns referential integrity, and as the canonical source of truth for which state_code maps to which jurisdiction code.';
insert into meta.jurisdiction (jurisdiction_code, asgs_state_code, display_name, status, since_sprint) values
  ('NSW', '1', 'New South Wales', 'active', 5),
  ('VIC', '2', 'Victoria', 'active', 10)
on conflict (jurisdiction_code) do nothing;

-- ── 2. mart.suburb_market_snapshot / mart.postcode_market_snapshot ──
alter table mart.suburb_market_snapshot add column if not exists jurisdiction text references meta.jurisdiction(jurisdiction_code);
alter table mart.suburb_market_snapshot add column if not exists geography_method text;   -- e.g. 'sal_direct' | 'sal_alias' | 'lga_fallback'
alter table mart.suburb_market_snapshot add column if not exists source_periods jsonb;     -- {sales: '2025-10', rent: '2025-Q4', ...}
alter table mart.suburb_market_snapshot add column if not exists metric_provenance jsonb;  -- {sales: {source_id, dataset_id}, ...}
alter table mart.suburb_market_snapshot add column if not exists missing_metric_reasons jsonb; -- {townhouse_villa_semidetached: 'no VIC VPSR breakout available'}

alter table mart.postcode_market_snapshot add column if not exists jurisdiction text references meta.jurisdiction(jurisdiction_code);
alter table mart.postcode_market_snapshot add column if not exists geography_method text;
alter table mart.postcode_market_snapshot add column if not exists source_periods jsonb;
alter table mart.postcode_market_snapshot add column if not exists metric_provenance jsonb;
alter table mart.postcode_market_snapshot add column if not exists missing_metric_reasons jsonb;

-- Backfill jurisdiction for existing (NSW-only) rows from state_code.
update mart.suburb_market_snapshot set jurisdiction = 'NSW' where jurisdiction is null and state_code = '1';
update mart.postcode_market_snapshot set jurisdiction = 'NSW' where jurisdiction is null and state_code = '1';

create index if not exists suburb_snapshot_jurisdiction_geocode_idx
  on mart.suburb_market_snapshot (jurisdiction, geography_code);
create index if not exists suburb_snapshot_state_geoname_idx
  on mart.suburb_market_snapshot (state_code, geography_name);
create index if not exists postcode_snapshot_jurisdiction_geocode_idx
  on mart.postcode_market_snapshot (jurisdiction, geography_code);
create index if not exists postcode_snapshot_state_geoname_idx
  on mart.postcode_market_snapshot (state_code, geography_name);

-- ── 3. mart.suburb_market_timeseries / mart.postcode_market_timeseries ──
alter table mart.suburb_market_timeseries add column if not exists jurisdiction text references meta.jurisdiction(jurisdiction_code);
alter table mart.suburb_market_timeseries add column if not exists state_code text;
alter table mart.suburb_market_timeseries add column if not exists geography_method text;
alter table mart.suburb_market_timeseries add column if not exists metric_provenance jsonb;

alter table mart.postcode_market_timeseries add column if not exists jurisdiction text references meta.jurisdiction(jurisdiction_code);
alter table mart.postcode_market_timeseries add column if not exists state_code text;
alter table mart.postcode_market_timeseries add column if not exists geography_method text;
alter table mart.postcode_market_timeseries add column if not exists metric_provenance jsonb;

-- Backfill from core.dim_geography (existing rows are all NSW).
update mart.suburb_market_timeseries ts
  set jurisdiction = 'NSW', state_code = g.state_code
  from core.dim_geography g
  where ts.geography_id = g.geography_id and ts.jurisdiction is null;
update mart.postcode_market_timeseries ts
  set jurisdiction = 'NSW', state_code = g.state_code
  from core.dim_geography g
  where ts.geography_id = g.geography_id and ts.jurisdiction is null;

create index if not exists suburb_timeseries_jurisdiction_idx
  on mart.suburb_market_timeseries (jurisdiction, geography_id, reference_period desc);
create index if not exists postcode_timeseries_jurisdiction_idx
  on mart.postcode_market_timeseries (jurisdiction, geography_id, reference_period desc);

-- ── 4. Comparison-search support index ──
-- Phase 11's compare/explore interfaces filter by jurisdiction + geography
-- type + dwelling type together; a composite index avoids a sequential scan
-- once VIC rows are loaded alongside NSW's ~18k existing snapshot rows.
create index if not exists suburb_snapshot_compare_idx
  on mart.suburb_market_snapshot (jurisdiction, coverage_status);
create index if not exists postcode_snapshot_compare_idx
  on mart.postcode_market_snapshot (jurisdiction, coverage_status);

-- ── 5. Backfill VIC + postcode jurisdiction ──
-- SAL rows carry state_code from core.dim_geography directly. POA rows do
-- not (postcodes are not strictly state-scoped in ASGS) — jurisdiction for
-- postcode-grain rows is derived from Australia Post's official
-- postcode-to-state number ranges, a deterministic public mapping, not
-- fuzzy matching.
update mart.suburb_market_snapshot set jurisdiction = 'VIC' where jurisdiction is null and state_code = '2';
update mart.postcode_market_snapshot set jurisdiction = 'VIC' where jurisdiction is null and state_code = '2';
update mart.suburb_market_timeseries set jurisdiction = 'VIC' where jurisdiction is null and state_code = '2';
update mart.postcode_market_timeseries set jurisdiction = 'VIC' where jurisdiction is null and state_code = '2';

update mart.postcode_market_snapshot
set jurisdiction = 'NSW'
where jurisdiction is null
  and geography_code ~ '^[0-9]{4}$'
  and (geography_code::int between 1000 and 1999
    or geography_code::int between 2000 and 2599
    or geography_code::int between 2619 and 2899
    or geography_code::int between 2921 and 2999);
update mart.postcode_market_snapshot
set jurisdiction = 'VIC'
where jurisdiction is null
  and geography_code ~ '^[0-9]{4}$'
  and (geography_code::int between 3000 and 3999 or geography_code::int between 8000 and 8999);

update mart.postcode_market_timeseries ts
set jurisdiction = 'NSW'
where jurisdiction is null
  and exists (select 1 from core.dim_geography g where g.geography_id = ts.geography_id and g.geography_code ~ '^[0-9]{4}$'
    and (g.geography_code::int between 1000 and 1999 or g.geography_code::int between 2000 and 2599
      or g.geography_code::int between 2619 and 2899 or g.geography_code::int between 2921 and 2999));
update mart.postcode_market_timeseries ts
set jurisdiction = 'VIC'
where jurisdiction is null
  and exists (select 1 from core.dim_geography g where g.geography_id = ts.geography_id and g.geography_code ~ '^[0-9]{4}$'
    and (g.geography_code::int between 3000 and 3999 or g.geography_code::int between 8000 and 8999));
