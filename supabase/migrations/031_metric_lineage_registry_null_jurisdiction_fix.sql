-- Sprint 12, Workstream 8 — fix meta.metric_lineage_registry's unique
-- constraint: Postgres treats NULL <> NULL for uniqueness purposes, so the
-- original `unique (mart_table, metric_name, jurisdiction_code)` constraint
-- from migration 030 did NOT prevent duplicate rows for national metrics
-- (jurisdiction_code IS NULL) -- discovered live when re-running the
-- population script produced 13 duplicate pairs instead of upserting.
-- `nulls not distinct` (PostgreSQL 15+, confirmed 17.6 on this branch)
-- makes NULL compare as equal to NULL for this constraint, which is the
-- correct semantics here: NULL jurisdiction_code means "applies to every
-- jurisdiction", a single canonical rule, not many distinct unknowns.

-- Remove the duplicate rows created by the constraint bug before the
-- unique index can be rebuilt (keep the earliest-created copy of each).
delete from meta.metric_lineage_registry a
using meta.metric_lineage_registry b
where a.mart_table = b.mart_table
  and a.metric_name = b.metric_name
  and a.jurisdiction_code is not distinct from b.jurisdiction_code
  and a.created_at > b.created_at;

alter table meta.metric_lineage_registry
  drop constraint metric_lineage_registry_mart_table_metric_name_jurisdiction_key;

alter table meta.metric_lineage_registry
  add constraint metric_lineage_registry_natural_key
  unique nulls not distinct (mart_table, metric_name, jurisdiction_code);
