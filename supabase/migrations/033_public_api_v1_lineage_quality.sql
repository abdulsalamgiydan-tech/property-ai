-- Sprint 12, Workstream 11 — versioned public API v1: expose WS8's
-- per-metric lineage and WS9's quality/freshness status through the same
-- public-schema-view/RPC pattern already used by every other public
-- surface (SECURITY DEFINER, SET search_path, granted to anon/
-- authenticated/service_role) -- core/mart/meta/staging remain entirely
-- invisible to PostgREST (WAREHOUSE_SECURITY_DECISION.md, Sprint 11 WS17).
--
-- Deliberately conservative about what's exposed: meta.data_incident's
-- `evidence` jsonb (raw sample rows from a failing rule) and
-- meta.data_quarantine_summary's `sample_row_ids` are NOT exposed --
-- aggregate counts only. Full transparency about METHODOLOGY (what
-- source produced a metric, how fresh it is, whether lineage/quality
-- currently pass) without exposing internal investigation working data.

-- ── v_metric_lineage_v1 — WS8's registry, safe columns only ────────────
create view public.v_metric_lineage_v1 as
select
  r.mart_table,
  r.metric_name,
  r.jurisdiction_code,
  r.is_derived,
  r.transformation_method,
  r.correspondence_version,
  r.mandatory,
  s.source_name,
  s.publisher,
  s.source_url,
  s.licence,
  ds.dataset_name,
  ds.earliest_period,
  ds.latest_period,
  r.notes
from meta.metric_lineage_registry r
left join meta.source s on s.source_id = r.source_id
left join meta.dataset ds on ds.dataset_id = r.dataset_id;

grant select on public.v_metric_lineage_v1 to anon, authenticated, service_role;

-- ── get_metric_lineage_v1 — the "About this metric" RPC (WS8's
-- lineage_service.mjs logic, reimplemented as a SQL function so the
-- public API can call it without a service-role connection) ────────────
create or replace function public.get_metric_lineage_v1(
  p_geography_id text,
  p_mart_table text,
  p_metric_family text
)
returns table (
  found boolean,
  jurisdiction text,
  row_confidence text,
  row_provenance jsonb,
  is_derived boolean,
  transformation_method text,
  correspondence_version text,
  source_name text,
  publisher text,
  source_url text,
  licence text,
  dataset_name text,
  lineage_complete boolean
)
language plpgsql
stable security definer
set search_path to 'public', 'mart', 'meta'
as $function$
declare
  v_jurisdiction text;
  v_confidence text;
  v_provenance jsonb;
begin
  if p_mart_table not in ('suburb_market_snapshot', 'postcode_market_snapshot') then
    raise exception 'unknown mart_table: %', p_mart_table;
  end if;

  if p_mart_table = 'suburb_market_snapshot' then
    select m.jurisdiction, m.confidence_label, m.metric_provenance
      into v_jurisdiction, v_confidence, v_provenance
    from mart.suburb_market_snapshot m
    where m.geography_id = p_geography_id and m.dwelling_type is null;
  else
    select m.jurisdiction, m.confidence_label, m.metric_provenance
      into v_jurisdiction, v_confidence, v_provenance
    from mart.postcode_market_snapshot m
    where m.geography_id = p_geography_id and m.dwelling_type is null;
  end if;

  if not found then
    return query select false, null::text, null::text, null::jsonb, null::boolean, null::text, null::text, null::text, null::text, null::text, null::text, null::text, false;
    return;
  end if;

  return query
    select
      true,
      v_jurisdiction,
      v_confidence,
      v_provenance,
      r.is_derived,
      r.transformation_method,
      r.correspondence_version,
      s.source_name,
      s.publisher,
      s.source_url,
      s.licence,
      ds.dataset_name,
      (r.lineage_id is not null)
    from (select 1) x
    left join meta.metric_lineage_registry r
      on r.mart_table = p_mart_table and r.metric_name = p_metric_family
      and (r.jurisdiction_code = v_jurisdiction or r.jurisdiction_code is null)
    left join meta.source s on s.source_id = r.source_id
    left join meta.dataset ds on ds.dataset_id = r.dataset_id
    order by (r.jurisdiction_code is not null) desc nulls last
    limit 1;
end;
$function$;

grant execute on function public.get_metric_lineage_v1(text, text, text) to anon, authenticated, service_role;

-- ── v_quality_summary_v1 — WS9's rule catalogue + latest run, aggregate
-- only (no per-incident evidence/sample rows) ───────────────────────────
create view public.v_quality_summary_v1 as
select
  (select count(*)::int from meta.data_quality_rule where not is_legacy) as active_rules,
  (select count(*)::int from meta.data_quality_rule where not is_legacy and blocking) as blocking_rules,
  (select count(*)::int from meta.data_quality_rule where not is_legacy and not blocking) as advisory_rules,
  latest.rules_run,
  latest.rules_passed,
  latest.rules_failed_blocking,
  latest.rules_failed_advisory,
  latest.started_at as latest_run_at,
  (select count(*)::int from meta.data_incident where status = 'open') as open_incidents,
  (select count(*)::int from meta.data_incident where status = 'open' and severity = 'blocker') as open_blocking_incidents,
  (select coalesce(sum(quarantined_count), 0)::int from meta.data_quarantine_summary) as quarantined_rows_total
from (
  select rules_run, rules_passed, rules_failed_blocking, rules_failed_advisory, started_at
  from meta.data_quality_run
  order by started_at desc
  limit 1
) latest;

grant select on public.v_quality_summary_v1 to anon, authenticated, service_role;
