-- Sprint 12, Workstream 9 — automated data-quality and freshness monitoring.
--
-- meta.data_quality_result and meta.dataset_freshness_status already exist
-- (Sprints 9/11) -- extended here, not duplicated. Genuinely new: a rule
-- CATALOGUE (data_quality_rule) so rule_id stops being a loose free-text
-- string with no registry behind it, a RUN grouping (data_quality_run) so
-- results from the same execution are queryable together, and persistent
-- INCIDENT + QUARANTINE tracking (neither existed before).

-- ── Rule catalogue ──────────────────────────────────────────────────────
create table meta.data_quality_rule (
  rule_id text primary key,
  rule_family text not null,
  description text not null,
  domain text,                          -- e.g. 'sales','rent','geography','lineage','freshness' (nullable = cross-domain)
  target_schema text,
  target_table text,
  jurisdiction_code text references meta.jurisdiction(jurisdiction_code),  -- NULL = applies nationally
  geography_grain text,                 -- 'SAL','POA','LGA','GCCSA','STATE', NULL = not geography-scoped
  severity text not null default 'blocker' check (severity in ('blocker','advisory')),
  blocking boolean not null default true,
  expected_threshold jsonb,             -- e.g. {"max_pct_change": 30} or {"min": 0, "max": 100}
  is_legacy boolean not null default false,  -- true for the 9 informal rule_ids used by earlier sprints' loaders, before this catalogue existed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table meta.data_quality_rule is
  'Rule catalogue -- Sprint 12 WS9. One row per registered quality rule (generic rule KINDS applied to specific targets, not one script per dataset).';

-- ── Run grouping ─────────────────────────────────────────────────────────
create table meta.data_quality_run (
  quality_run_id uuid primary key default gen_random_uuid(),
  triggered_by text not null,           -- 'manual','dataset','domain','jurisdiction','ci','refresh_engine'
  scope jsonb not null default '{}',    -- e.g. {"dataset_id":"qld_rta_bond_statistics"} or {"domain":"rent"}
  load_run_id uuid references meta.load_run(load_run_id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running','completed','failed')),
  rules_run integer not null default 0,
  rules_passed integer not null default 0,
  rules_failed_blocking integer not null default 0,
  rules_failed_advisory integer not null default 0
);

comment on table meta.data_quality_run is
  'One row per quality-check execution -- Sprint 12 WS9. Groups meta.data_quality_result rows from the same run via quality_run_id.';

-- ── Extend the existing data_quality_result table (do not recreate) ─────
alter table meta.data_quality_result
  add column if not exists quality_run_id uuid references meta.data_quality_run(quality_run_id),
  add column if not exists jurisdiction_code text references meta.jurisdiction(jurisdiction_code),
  add column if not exists geography_grain text,
  add column if not exists blocking boolean not null default true,
  add column if not exists expected_threshold jsonb,
  add column if not exists actual_result jsonb,
  add column if not exists first_detected_at timestamptz,
  add column if not exists latest_detected_at timestamptz,
  add column if not exists investigation_status text not null default 'new' check (investigation_status in ('new','investigating','resolved','wont_fix','accepted_limitation')),
  add column if not exists resolution_notes text,
  add column if not exists evidence jsonb;

-- Backfill first/latest_detected_at for pre-existing rows so the column is
-- never silently NULL for history that predates this migration.
update meta.data_quality_result
  set first_detected_at = coalesce(first_detected_at, created_at),
      latest_detected_at = coalesce(latest_detected_at, created_at)
  where first_detected_at is null or latest_detected_at is null;

alter table meta.data_quality_result
  alter column first_detected_at set not null,
  alter column latest_detected_at set not null;

-- Seed the rule catalogue with the 9 informal rule_ids already referenced
-- by meta.data_quality_result (Sprints 9/11/12 loader post-load gates),
-- marked is_legacy=true, before adding the FK -- avoids breaking history.
insert into meta.data_quality_rule (rule_id, rule_family, description, is_legacy, severity) values
  ('confidence_completeness', 'missing_confidence_label', 'Legacy rule id used by earlier sprint loaders -- superseded by the WS9 rule catalogue''s confidence_completeness_* rules.', true, 'blocker'),
  ('confidence_label_required', 'missing_confidence_label', 'Legacy rule id, see confidence_completeness.', true, 'blocker'),
  ('geo_code_valid', 'orphan_geography', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('geometry_valid', 'invalid_geometry', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('no_duplicate_grain', 'duplicate_natural_key', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('no_negative_rates', 'negative_value', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('nulls_not_zero', 'null_required_field', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('price_range_sanity', 'range_check', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker'),
  ('weights_reconcile', 'weight_reconciliation', 'Legacy rule id used by earlier sprint loaders.', true, 'blocker')
on conflict (rule_id) do nothing;

alter table meta.data_quality_result
  add constraint data_quality_result_rule_id_fkey foreign key (rule_id) references meta.data_quality_rule(rule_id);

create index data_quality_result_rule_idx on meta.data_quality_result (rule_id, created_at desc);
create index data_quality_result_run_idx on meta.data_quality_result (quality_run_id);

-- ── Incidents ────────────────────────────────────────────────────────────
create table meta.data_incident (
  incident_id uuid primary key default gen_random_uuid(),
  rule_id text not null references meta.data_quality_rule(rule_id),
  target_schema text,
  target_table text,
  jurisdiction_code text references meta.jurisdiction(jurisdiction_code),
  status text not null default 'open' check (status in ('open','investigating','resolved','wont_fix')),
  severity text not null,
  summary text not null,
  first_quality_result_id uuid references meta.data_quality_result(quality_result_id),
  latest_quality_result_id uuid references meta.data_quality_result(quality_result_id),
  occurrence_count integer not null default 1,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  -- One open incident per (rule_id, target_schema, target_table, jurisdiction_code)
  -- signature -- re-running the same successful/failing check must update
  -- the existing open incident (bump occurrence_count, latest_quality_result_id,
  -- latest_detected_at) rather than creating a duplicate. Enforced by a
  -- partial unique index (only while status='open'), not application logic
  -- alone, so this holds even under concurrent runs.
  unique_signature text generated always as (
    rule_id || '|' || coalesce(target_schema,'') || '|' || coalesce(target_table,'') || '|' || coalesce(jurisdiction_code,'')
  ) stored
);

create unique index data_incident_open_signature_idx
  on meta.data_incident (unique_signature) where status = 'open';

comment on table meta.data_incident is
  'Persistent incident tracking -- Sprint 12 WS9. Distinct from meta.data_quality_result (one row per rule execution): an incident groups repeated failures of the same rule against the same target into one trackable, resolvable record.';

-- ── Quarantine ───────────────────────────────────────────────────────────
create table meta.data_quarantine_summary (
  quarantine_id uuid primary key default gen_random_uuid(),
  rule_id text not null references meta.data_quality_rule(rule_id),
  dataset_id text references meta.dataset(dataset_id),
  target_schema text not null,
  target_table text not null,
  reason text not null,
  quarantined_count integer not null,
  sample_row_ids jsonb not null default '[]',
  load_run_id uuid references meta.load_run(load_run_id),
  quality_run_id uuid references meta.data_quality_run(quality_run_id),
  created_at timestamptz not null default now()
);

comment on table meta.data_quarantine_summary is
  'Aggregate record of quarantined rows -- Sprint 12 WS9. Follows this project''s established "quarantine, don''t discard" pattern (first used for Poor-quality geography correspondence rows in WS4): the underlying rows are never deleted, this table records that a rule flagged N of them and why.';

create index data_quarantine_summary_rule_idx on meta.data_quarantine_summary (rule_id, created_at desc);
