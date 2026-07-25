-- ============================================================
-- Propellect — Data Refresh Operations metadata (Sprint 10, Phase 13)
--
-- Metadata-driven refresh registry only. No schedule is enabled by this
-- migration — these tables record refresh POLICY and refresh HISTORY;
-- the actual orchestrator (warehouse/scripts/orchestration/*.mjs) runs
-- locally, on demand, defaulting to --plan/--dry-run, and this sprint does
-- not wire up any automated trigger (cron, Edge Function schedule, etc.).
--
-- Additive only. No DROP/TRUNCATE/DELETE.
-- ============================================================

create table if not exists meta.dataset_refresh_policy (
  dataset_id            text primary key references meta.dataset(dataset_id),
  refresh_frequency      text not null,               -- 'quarterly' | 'monthly' | 'annual' | 'irregular'
  expected_cadence_days  integer not null,             -- used to compute 'due'/'stale' freshness status
  source_discovery_method text,                        -- 'ckan_api' | 'fixed_url' | 'manual_check'
  auto_discoverable       boolean not null default false, -- true if a live API (e.g. CKAN) can resolve the current-period URL without a human
  requires_headed_browser boolean not null default false, -- true if the source is behind bot protection (documented, not a bypass)
  jurisdiction            text references meta.jurisdiction(jurisdiction_code),
  notes                    text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
comment on table meta.dataset_refresh_policy is
  'Declarative refresh policy per dataset — cadence, discovery method, access notes. Drives meta.dataset_freshness_status computation. Mirrors warehouse/config/refresh_policies.yml (source of truth is the yml; this table is populated from it for query-time freshness checks).';

create table if not exists meta.dataset_refresh_run (
  refresh_run_id        uuid primary key default gen_random_uuid(),
  dataset_id            text references meta.dataset(dataset_id),
  mode                   text not null,                -- 'plan' | 'dry-run' | 'download' | 'branch-load'
  status                  text not null default 'running', -- 'running' | 'succeeded' | 'failed' | 'skipped'
  target                   text not null default 'local', -- 'local' | 'branch' — orchestrator refuses 'production'
  branch_ref_used           text,                        -- recorded for audit; orchestrator hard-refuses the production ref
  started_at                 timestamptz not null default now(),
  completed_at                timestamptz,
  rows_affected                integer,
  error_message                 text,
  manifest                        jsonb,                 -- files touched, hashes, source URLs used this run
  created_at                        timestamptz not null default now()
);
comment on table meta.dataset_refresh_run is
  'One row per orchestrator invocation (plan_refresh/run_refresh). A failing run for one dataset must not corrupt another dataset''s row — each dataset gets its own run row, never a shared/batched row. Never targets production (target=''production'' is rejected at the application layer, not representable as a valid successful row here).';
create index if not exists dataset_refresh_run_dataset_idx
  on meta.dataset_refresh_run (dataset_id, started_at desc);

create table if not exists meta.dataset_freshness_status (
  dataset_id                text primary key references meta.dataset(dataset_id),
  jurisdiction               text references meta.jurisdiction(jurisdiction_code),
  latest_source_period        date,
  last_retrieved_at             timestamptz,
  last_successful_validation_at   timestamptz,
  expected_cadence_days             integer,
  freshness_status                   text not null default 'manual_review', -- 'current' | 'due' | 'stale' | 'failed' | 'blocked' | 'manual_review'
  current_branch_row_count             integer,
  last_failure_summary                   text,
  local_only_or_branch_published          text, -- 'local_only' | 'branch_published'
  source_url                                text,
  computed_at                                 timestamptz not null default now()
);
comment on table meta.dataset_freshness_status is
  'Computed freshness snapshot per dataset, refreshed by check_freshness.mjs. Backs the /research/data-status observability page (Phase 14). Never exposes local file paths, secrets, internal DB identifiers, or raw operational logs — only the fields listed here.';

-- ── Public read-only view for /research/data-status (Phase 14) ────────────
-- Same security model as migration 014/016: security_invoker=false view,
-- SELECT granted to anon/authenticated only, no direct grant on meta.*.
-- Exposes only non-sensitive columns — no local file paths, secrets,
-- internal DB identifiers, or raw operational logs.
create or replace view public.v_dataset_freshness_v1
  with (security_invoker = false) as
select
  f.dataset_id, f.jurisdiction, d.dataset_name, s.publisher,
  f.latest_source_period, f.last_retrieved_at, f.last_successful_validation_at,
  f.expected_cadence_days, f.freshness_status, f.current_branch_row_count,
  f.last_failure_summary, f.local_only_or_branch_published, f.source_url,
  f.computed_at
from meta.dataset_freshness_status f
left join meta.dataset d on d.dataset_id = f.dataset_id
left join meta.source s on s.source_id = d.source_id;
comment on view public.v_dataset_freshness_v1 is
  'Read-only public projection of meta.dataset_freshness_status for the /research/data-status observability page. Never exposes local file paths, secrets, internal DB identifiers, or raw operational logs — only the fields listed here.';

grant usage on schema public to anon, authenticated;
grant select on public.v_dataset_freshness_v1 to anon, authenticated;
revoke all on meta.dataset_refresh_policy from anon, authenticated;
revoke all on meta.dataset_refresh_run from anon, authenticated;
revoke all on meta.dataset_freshness_status from anon, authenticated;
