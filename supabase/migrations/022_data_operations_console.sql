-- ============================================================
-- Propellect — Data Operations Console expansion (Sprint 11, Workstream 16)
--
-- Same security model as every prior public-surface migration
-- (014/016/017/020/021): security_invoker=false views / SECURITY DEFINER
-- functions, SELECT/EXECUTE granted to anon/authenticated only, no direct
-- grant on any core/mart/meta table. Never exposes local file paths,
-- connection strings, service-role keys, or raw SQL error internals.
-- ============================================================

-- ── 1. Refresh run history (read-only projection of meta.dataset_refresh_run) ─
create or replace view public.v_refresh_run_history_v1
  with (security_invoker = false) as
select
  r.refresh_run_id, r.dataset_id, d.dataset_name, r.mode, r.status, r.target,
  r.started_at, r.completed_at, r.rows_affected,
  -- error_message is truncated and never includes the raw manifest (which
  -- can carry local file paths) — a short, safe summary only.
  left(r.error_message, 300) as error_summary,
  extract(epoch from (r.completed_at - r.started_at))::integer as duration_seconds
from meta.dataset_refresh_run r
left join meta.dataset d on d.dataset_id = r.dataset_id
order by r.started_at desc
limit 200; -- bounded — never an unbounded history scan
comment on view public.v_refresh_run_history_v1 is
  'Read-only projection of the last 200 refresh runs for the data operations console. error_summary is truncated to 300 chars and never includes the raw manifest (which can carry local file paths). No credentials, no connection strings, no internal branch identifiers beyond the already-public target (local/branch) label.';

-- ── 2. Operations summary (aggregate counts, branch storage) ────────────
create or replace function public.get_warehouse_operations_summary_v1()
returns table (
  total_datasets integer,
  branch_published_count integer,
  local_only_count integer,
  blocked_or_unsupported_count integer,
  branch_db_size_mb numeric,
  last_run_started_at timestamptz,
  last_run_status text,
  runs_last_30_days integer,
  runs_failed_last_30_days integer
)
language sql
security definer
stable
set search_path = public, meta
as $$
  select
    (select count(*)::int from meta.dataset_freshness_status),
    (select count(*)::int from meta.dataset_freshness_status where local_only_or_branch_published = 'branch_published'),
    (select count(*)::int from meta.dataset_freshness_status where local_only_or_branch_published = 'local_only'),
    (select count(*)::int from meta.dataset_freshness_status where freshness_status in ('blocked', 'failed')),
    round((pg_database_size(current_database())::numeric / 1024 / 1024), 1),
    (select max(started_at) from meta.dataset_refresh_run),
    (select status from meta.dataset_refresh_run order by started_at desc limit 1),
    (select count(*)::int from meta.dataset_refresh_run where started_at > now() - interval '30 days'),
    (select count(*)::int from meta.dataset_refresh_run where started_at > now() - interval '30 days' and status = 'failed');
$$;
comment on function public.get_warehouse_operations_summary_v1 is
  'Aggregate operations summary for the data operations console — dataset counts by publication status, branch database size (safe to expose, not a secret), and recent refresh-run activity. No credentials, no connection strings, no per-row internal detail.';

grant select on public.v_refresh_run_history_v1 to anon, authenticated;
grant execute on function public.get_warehouse_operations_summary_v1() to anon, authenticated;
