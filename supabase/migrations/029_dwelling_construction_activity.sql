-- ============================================================
-- Propellect — Dwelling commencements/completions (Sprint 12, Workstream 3)
--
-- Closes 2 of the top-priority national supply gaps identified in the
-- Sprint 12 checkpoint: dwelling commencements and completions. Distinct
-- from core.fact_building_approvals (a different, earlier pipeline
-- stage — approval to build, not construction starting/finishing) and
-- loaded at a different, coarser grain: ABS's Building Activity Survey
-- (cat. 8752.0, "Building Activity, Australia") only publishes
-- commencements/completions at STATE/territory grain in its standard
-- time-series tables (select series exist at GCCSA, but not the specific
-- tables used here) — no SAL/POA breakdown exists at the free, official
-- level, so this genuinely cannot be loaded at the same grain as
-- approvals. A new table, not an extension of fact_building_approvals,
-- keeps the grain difference honest and explicit rather than mixing
-- SAL/POA and STATE rows in one table.
-- ============================================================

create table core.fact_dwelling_construction_activity (
  construction_activity_id uuid primary key default gen_random_uuid(),
  geography_id text not null references core.dim_geography(geography_id),
  geography_type text not null,
  geography_code text not null,
  reference_period date not null,
  period_type text not null,
  dwelling_type text not null,
  stage text not null check (stage in ('commenced', 'completed')),
  sector text not null default 'total_sectors',
  unit_count integer not null,
  source_id text,
  dataset_id text,
  data_quality_status text,
  confidence_label text,
  created_at timestamptz not null default now(),
  unique (geography_id, reference_period, period_type, dwelling_type, stage, sector)
);

comment on table core.fact_dwelling_construction_activity is
  'ABS Building Activity Survey (cat. 8752.0) dwelling unit commencements and completions, Original (not seasonally adjusted) series, STATE grain only (no free SAL/POA breakdown exists) -- deliberately a separate table from core.fact_building_approvals, a different pipeline stage at a finer grain, not to be confused or combined.';
