-- Sprint 18.2 -- Production warehouse bootstrap, Phase 8, step 3 of 8.
--
-- The 11 meta.* tables in the minimum launch contract: lineage, freshness,
-- source/dataset catalog, and quality/incident metadata read by the 10
-- granted views and 8 granted functions. Tables created in dependency
-- order so foreign keys resolve on first apply.
--
-- Column sets and constraints extracted byte-accurate from
-- warehouse-validation via pg_attribute/pg_attrdef/pg_get_constraintdef.
--
-- IMPORTANT: three foreign keys are deliberately DROPPED relative to
-- warehouse-validation's actual schema, because they reference
-- meta.data_quality_result and meta.load_run -- two ETL-internal
-- bookkeeping tables that are correctly excluded from the minimum contract
-- (traced via pg_depend/pg_get_functiondef; neither table is read by any
-- of the 10 granted views or 8 granted functions -- see
-- warehouse/reports/sprint18_2_minimum_launch_contract.md). The referencing
-- columns (first_quality_result_id, latest_quality_result_id, load_run_id)
-- are all nullable and are kept as plain uuid columns -- the data imported
-- from the frozen snapshot will still carry whatever values were valid on
-- the source, Production simply won't independently enforce referential
-- integrity against a table it doesn't have. This is a deliberate minimum-
-- contract scoping decision, not an oversight.

create table if not exists meta.jurisdiction (
  "jurisdiction_code" text not null,
  "asgs_state_code" text not null,
  "display_name" text not null,
  "status" text default 'active'::text not null,
  "since_sprint" integer,
  "created_at" timestamp with time zone default now() not null,
  constraint jurisdiction_pkey primary key (jurisdiction_code)
);

create table if not exists meta.source (
  "source_id" text not null,
  "source_name" text not null,
  "publisher" text not null,
  "source_category" text not null,
  "official_or_independent" text not null,
  "source_url" text,
  "licence" text,
  "access_method" text,
  "update_frequency" text,
  "implementation_status" text default 'identified'::text not null,
  "known_limitations" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint source_pkey primary key (source_id)
);

create table if not exists meta.dataset (
  "dataset_id" text not null,
  "source_id" text,
  "dataset_name" text not null,
  "geography_available" text,
  "earliest_period" text,
  "latest_period" text,
  "file_format" text,
  "refresh_frequency" text,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  constraint dataset_pkey primary key (dataset_id),
  constraint dataset_source_id_fkey foreign key (source_id) references meta.source (source_id)
);
create index if not exists dataset_source_idx on meta.dataset using btree (source_id);

create table if not exists meta.dataset_freshness_status (
  "dataset_id" text not null,
  "jurisdiction" text,
  "latest_source_period" date,
  "last_retrieved_at" timestamp with time zone,
  "last_successful_validation_at" timestamp with time zone,
  "expected_cadence_days" integer,
  "freshness_status" text default 'manual_review'::text not null,
  "current_branch_row_count" integer,
  "last_failure_summary" text,
  "local_only_or_branch_published" text,
  "source_url" text,
  "computed_at" timestamp with time zone default now() not null,
  constraint dataset_freshness_status_pkey primary key (dataset_id),
  constraint dataset_freshness_status_dataset_id_fkey foreign key (dataset_id) references meta.dataset (dataset_id),
  constraint dataset_freshness_status_jurisdiction_fkey foreign key (jurisdiction) references meta.jurisdiction (jurisdiction_code)
);

create table if not exists meta.dataset_refresh_run (
  "refresh_run_id" uuid default gen_random_uuid() not null,
  "dataset_id" text,
  "mode" text not null,
  "status" text default 'running'::text not null,
  "target" text default 'local'::text not null,
  "branch_ref_used" text,
  "started_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "rows_affected" integer,
  "error_message" text,
  "manifest" jsonb,
  "created_at" timestamp with time zone default now() not null,
  constraint dataset_refresh_run_pkey primary key (refresh_run_id),
  constraint dataset_refresh_run_dataset_id_fkey foreign key (dataset_id) references meta.dataset (dataset_id)
);
create index if not exists dataset_refresh_run_dataset_idx on meta.dataset_refresh_run using btree (dataset_id, started_at desc);

create table if not exists meta.metric_assumption (
  "assumption_id" uuid default gen_random_uuid() not null,
  "scenario_code" text not null,
  "assumption_name" text not null,
  "numeric_value" numeric,
  "text_value" text,
  "unit" text,
  "effective_from" date not null,
  "effective_to" date,
  "source_notes" text,
  "created_at" timestamp with time zone default now() not null,
  constraint metric_assumption_pkey primary key (assumption_id)
);
create index if not exists metric_assumption_scenario_idx on meta.metric_assumption using btree (scenario_code, effective_from desc);

create table if not exists meta.metric_lineage_registry (
  "lineage_id" uuid default gen_random_uuid() not null,
  "mart_schema" text default 'mart'::text not null,
  "mart_table" text not null,
  "metric_name" text not null,
  "jurisdiction_code" text,
  "source_id" text,
  "dataset_id" text,
  "contributing_dataset_ids" text[] default '{}'::text[] not null,
  "is_derived" boolean default false not null,
  "transformation_method" text not null,
  "correspondence_version" text,
  "mandatory" boolean default true not null,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint metric_lineage_registry_pkey primary key (lineage_id),
  constraint metric_lineage_registry_natural_key unique nulls not distinct (mart_table, metric_name, jurisdiction_code),
  constraint metric_lineage_registry_jurisdiction_code_fkey foreign key (jurisdiction_code) references meta.jurisdiction (jurisdiction_code),
  constraint metric_lineage_registry_source_id_fkey foreign key (source_id) references meta.source (source_id),
  constraint metric_lineage_registry_dataset_id_fkey foreign key (dataset_id) references meta.dataset (dataset_id)
);
create index if not exists metric_lineage_registry_mart_metric_idx on meta.metric_lineage_registry using btree (mart_table, metric_name);

create table if not exists meta.data_quality_rule (
  "rule_id" text not null,
  "rule_family" text not null,
  "description" text not null,
  "domain" text,
  "target_schema" text,
  "target_table" text,
  "jurisdiction_code" text,
  "geography_grain" text,
  "severity" text default 'blocker'::text not null,
  "blocking" boolean default true not null,
  "expected_threshold" jsonb,
  "is_legacy" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint data_quality_rule_pkey primary key (rule_id),
  constraint data_quality_rule_severity_check check (severity = any (array['blocker'::text, 'advisory'::text])),
  constraint data_quality_rule_jurisdiction_code_fkey foreign key (jurisdiction_code) references meta.jurisdiction (jurisdiction_code)
);

-- load_run_id_fkey to meta.load_run intentionally dropped -- see header.
create table if not exists meta.data_quality_run (
  "quality_run_id" uuid default gen_random_uuid() not null,
  "triggered_by" text not null,
  "scope" jsonb default '{}'::jsonb not null,
  "load_run_id" uuid,
  "started_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone,
  "status" text default 'running'::text not null,
  "rules_run" integer default 0 not null,
  "rules_passed" integer default 0 not null,
  "rules_failed_blocking" integer default 0 not null,
  "rules_failed_advisory" integer default 0 not null,
  constraint data_quality_run_pkey primary key (quality_run_id),
  constraint data_quality_run_status_check check (status = any (array['running'::text, 'completed'::text, 'failed'::text]))
);

-- first_quality_result_id_fkey / latest_quality_result_id_fkey to
-- meta.data_quality_result intentionally dropped -- see header.
create table if not exists meta.data_incident (
  "incident_id" uuid default gen_random_uuid() not null,
  "rule_id" text not null,
  "target_schema" text,
  "target_table" text,
  "jurisdiction_code" text,
  "status" text default 'open'::text not null,
  "severity" text not null,
  "summary" text not null,
  "first_quality_result_id" uuid,
  "latest_quality_result_id" uuid,
  "occurrence_count" integer default 1 not null,
  "opened_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone,
  "resolution_notes" text,
  "unique_signature" text generated always as ((((((rule_id || '|'::text) || coalesce(target_schema, ''::text)) || '|'::text) || coalesce(target_table, ''::text)) || '|'::text) || coalesce(jurisdiction_code, ''::text)) stored,
  constraint data_incident_pkey primary key (incident_id),
  constraint data_incident_status_check check (status = any (array['open'::text, 'investigating'::text, 'resolved'::text, 'wont_fix'::text])),
  constraint data_incident_rule_id_fkey foreign key (rule_id) references meta.data_quality_rule (rule_id),
  constraint data_incident_jurisdiction_code_fkey foreign key (jurisdiction_code) references meta.jurisdiction (jurisdiction_code)
);
create unique index if not exists data_incident_open_signature_idx on meta.data_incident using btree (unique_signature) where (status = 'open'::text);

-- load_run_id_fkey to meta.load_run intentionally dropped -- see header.
create table if not exists meta.data_quarantine_summary (
  "quarantine_id" uuid default gen_random_uuid() not null,
  "rule_id" text not null,
  "dataset_id" text,
  "target_schema" text not null,
  "target_table" text not null,
  "reason" text not null,
  "quarantined_count" integer not null,
  "sample_row_ids" jsonb default '[]'::jsonb not null,
  "load_run_id" uuid,
  "quality_run_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  constraint data_quarantine_summary_pkey primary key (quarantine_id),
  constraint data_quarantine_summary_rule_id_fkey foreign key (rule_id) references meta.data_quality_rule (rule_id),
  constraint data_quarantine_summary_dataset_id_fkey foreign key (dataset_id) references meta.dataset (dataset_id),
  constraint data_quarantine_summary_quality_run_id_fkey foreign key (quality_run_id) references meta.data_quality_run (quality_run_id)
);
create index if not exists data_quarantine_summary_rule_idx on meta.data_quarantine_summary using btree (rule_id, created_at desc);
