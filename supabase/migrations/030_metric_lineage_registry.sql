-- Sprint 12, Workstream 8 — field-level data lineage.
--
-- meta.source / meta.dataset / meta.load_run / meta.source_file (checksum +
-- retrieval-event) / meta.data_quality_result already cover most of the
-- mission's requested lineage entity list. The one genuinely missing piece,
-- confirmed by inspecting the schema before writing this migration: nothing
-- links a SPECIFIC METRIC on a SPECIFIC MART ROW back to which dataset,
-- transformation, and (where relevant) geography-correspondence version
-- produced it. mart.suburb_market_snapshot's own metric_provenance jsonb
-- column carries a lightweight per-row hint, but it isn't queryable/joinable
-- and isn't validated for completeness.
--
-- Design choice: register lineage at (mart_table, metric_name, jurisdiction)
-- grain, not one row per mart row. A per-row table would mean ~15,000 rows
-- x ~10 metric families just for suburb_market_snapshot, almost all
-- identical within a jurisdiction (every NSW suburb's sales metric comes
-- from the same dataset via the same transformation) -- pure redundancy.
-- This table is the STATIC "what source/methodology produced this column,
-- for this jurisdiction" fact; each mart row's own metric_provenance jsonb
-- + confidence_label columns remain the DYNAMIC "which specific period /
-- confidence this particular row got" fact. A future lineage query joins
-- both layers together (see warehouse/scripts/lineage/lineage_service.mjs).
create table meta.metric_lineage_registry (
  lineage_id uuid primary key default gen_random_uuid(),
  mart_schema text not null default 'mart',
  mart_table text not null,
  metric_name text not null,
  -- NULL jurisdiction_code means "applies to every jurisdiction present for
  -- this metric" (e.g. approvals/demographics/population_growth, which use
  -- one national methodology regardless of state) -- not "unknown".
  jurisdiction_code text references meta.jurisdiction(jurisdiction_code),
  source_id text references meta.source(source_id),
  dataset_id text references meta.dataset(dataset_id),
  -- Secondary datasets that also feed this metric (e.g. VIC sales blends
  -- 3 VPSR dataset_ids: median house/unit/land). Validated for existence
  -- against meta.dataset by the population script, not a DB-level FK
  -- (Postgres doesn't support an array-element FK).
  contributing_dataset_ids text[] not null default '{}',
  is_derived boolean not null default false,
  transformation_method text not null,
  correspondence_version text,
  mandatory boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mart_table, metric_name, jurisdiction_code)
);

comment on table meta.metric_lineage_registry is
  'Field-level lineage: which source/dataset/transformation produced a given metric column on a given mart, per jurisdiction. Sprint 12 WS8. Static methodology facts -- pairs with each mart row''s own metric_provenance jsonb (dynamic per-row facts) for a full lineage answer.';

create index metric_lineage_registry_mart_metric_idx
  on meta.metric_lineage_registry (mart_table, metric_name);
