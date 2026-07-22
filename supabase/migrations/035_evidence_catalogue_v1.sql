-- Sprint 12, Workstream 5 — research evidence catalogue, public surface.
-- Same pattern as every other public view (SECURITY DEFINER, granted to
-- anon/authenticated/service_role, core/mart/meta/staging invisible to
-- PostgREST directly).
create view public.v_evidence_catalogue_v1 as
select
  s.source_id,
  s.source_name,
  s.publisher,
  s.source_category,
  s.official_or_independent,
  s.source_url,
  s.licence,
  s.access_method,
  s.update_frequency,
  s.implementation_status,
  s.known_limitations,
  (select count(*)::int from meta.dataset d where d.source_id = s.source_id) as dataset_count,
  (select count(distinct r.mart_table || '.' || r.metric_name)::int from meta.metric_lineage_registry r where r.source_id = s.source_id) as published_metric_family_count
from meta.source s
order by s.source_category, s.source_id;

grant select on public.v_evidence_catalogue_v1 to anon, authenticated, service_role;
