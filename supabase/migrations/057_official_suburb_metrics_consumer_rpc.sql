-- 057 — consumer RPC for the official suburb metrics (SA + VIC CC-BY lanes).
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Rehearsed locally only (blank +
-- current-schema PostgreSQL via PGlite) and part of the V4C Production release
-- package. Do NOT apply to Supabase validation or Production without separate
-- human approval. Migrations 055 and 056 are unchanged.
--
-- WHY: migration 056's public.v_official_suburb_metric_v1 view is DIRECT-only, so
-- the 83 qualified derived house yields loaded into mart.official_suburb_metric
-- (status='derived') are intentionally NOT exposed through that view. This RPC is
-- the SAFE consumer path that additionally exposes the derived yields — together
-- with per-observation source, period window, freshness (retrieved_at) and
-- direct/derived status — WITHOUT granting clients any access to the internal
-- core/mart schemas or tables.
--
-- SECURITY MODEL (identical to public.get_market_timeseries_v1, migration 052):
-- SECURITY DEFINER with a pinned search_path, so the function runs with the
-- owner's privileges and reads core.official_observation directly; anon /
-- authenticated receive ONLY EXECUTE on this function — never a table/schema
-- grant (schemas core/mart stay revoked, per migration 046/053). Contextual and
-- quarantined rows (status not in direct/derived) are never returned, so a
-- postcode-level contextual rent can never surface as a suburb metric.

create or replace function public.get_official_suburb_metrics_v1(p_geography_id text)
 returns table(
   geography_id   text,
   metric         text,
   property_type  text,
   bedroom_group  text,
   value          numeric,
   unit           text,
   sample_size    integer,
   period_start   date,
   period_end     date,
   status         text,          -- 'direct' | 'derived'
   is_derived     boolean,
   derived_from   text,          -- formula label for derived rows (e.g. gross_yield@2); no internal ids
   source_id      text,
   attribution    text,
   retrieved_at   timestamptz    -- freshness of the underlying observation
 )
 language sql
 stable security definer
 set search_path to 'public', 'core'
as $function$
  select o.geography_id, o.metric, o.property_type, o.bedroom_group,
         o.value, o.unit, o.sample_size, o.period_start, o.period_end,
         o.status,
         (o.status = 'derived') as is_derived,
         case when o.status = 'derived' then o.formula_version else null end as derived_from,
         o.source_id, o.attribution, o.retrieved_at
  from core.official_observation o
  where o.geography_id = p_geography_id
    and o.status in ('direct', 'derived')   -- contextual / quarantine never exposed
  order by o.metric, o.property_type, o.bedroom_group, o.period_end;
$function$;

comment on function public.get_official_suburb_metrics_v1(text) is
  'Read-only consumer lookup for accepted official suburb metrics (SA/VIC CC-BY) for a single geography_id (SAL). Returns direct observations AND qualified derived yields with source, period window, freshness (retrieved_at) and direct/derived status. SECURITY DEFINER with a pinned search_path — runs with the function owner''s privileges so anon/authenticated need no grant on core/mart; only EXECUTE on this function is granted. Contextual/quarantined rows are never returned; no internal lineage ids or raw checksums are exposed. Aggregate suburb medians/counts only — no property-level PII; not a recommendation, score, AVM or forecast.';

-- Least-privilege: EXECUTE only, to the two public roles (never a table grant).
revoke all on function public.get_official_suburb_metrics_v1(text) from public;
grant execute on function public.get_official_suburb_metrics_v1(text) to anon, authenticated;
