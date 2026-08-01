-- Sprint 17 -- research API grant hardening.
--
-- Purpose: normalize the public research warehouse API surface to the
-- minimum Data API privileges needed by the application: SELECT on curated
-- public views and EXECUTE on bounded RPCs. Older Supabase default grants can
-- leave harmless-but-noisy REFERENCES/TRIGGER privileges visible on views;
-- this migration revokes all role privileges on the curated objects and then
-- grants back only the intended read/execute surface.
--
-- Additive/non-destructive: no table/view/function drops, no data writes, no
-- RLS weakening, no Production application activation. Underlying core/mart/
-- meta schemas remain inaccessible directly to anon/authenticated.

-- Curated read-only research views.
revoke all privileges on table public.v_market_geography_search_v1 from anon, authenticated;
revoke all privileges on table public.v_suburb_market_snapshot_v1 from anon, authenticated;
revoke all privileges on table public.v_postcode_market_snapshot_v1 from anon, authenticated;
revoke all privileges on table public.v_suburb_demographic_profile_v1 from anon, authenticated;
revoke all privileges on table public.v_postcode_demographic_profile_v1 from anon, authenticated;
revoke all privileges on table public.v_dataset_freshness_v1 from anon, authenticated;
revoke all privileges on table public.v_refresh_run_history_v1 from anon, authenticated;
revoke all privileges on table public.v_metric_assumptions_v1 from anon, authenticated;
revoke all privileges on table public.v_quality_summary_v1 from anon, authenticated;
revoke all privileges on table public.v_evidence_catalogue_v1 from anon, authenticated;

grant select on table public.v_market_geography_search_v1 to anon, authenticated;
grant select on table public.v_suburb_market_snapshot_v1 to anon, authenticated;
grant select on table public.v_postcode_market_snapshot_v1 to anon, authenticated;
grant select on table public.v_suburb_demographic_profile_v1 to anon, authenticated;
grant select on table public.v_postcode_demographic_profile_v1 to anon, authenticated;
grant select on table public.v_dataset_freshness_v1 to anon, authenticated;
grant select on table public.v_refresh_run_history_v1 to anon, authenticated;
grant select on table public.v_metric_assumptions_v1 to anon, authenticated;
grant select on table public.v_quality_summary_v1 to anon, authenticated;
grant select on table public.v_evidence_catalogue_v1 to anon, authenticated;

-- Bounded research RPCs. Revoke from PUBLIC first because Postgres grants
-- EXECUTE on new functions to PUBLIC by default unless default privileges are
-- changed; then grant only the intended roles explicitly.
revoke all privileges on function public.get_market_timeseries_v1(text) from public, anon, authenticated;
revoke all privileges on function public.search_market_geographies_v2(text, text, text, integer) from public, anon, authenticated;
revoke all privileges on function public.get_market_snapshot_v2(text) from public, anon, authenticated;
revoke all privileges on function public.compare_market_geographies_v1(text[]) from public, anon, authenticated;
revoke all privileges on function public.get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer) from public, anon, authenticated;
revoke all privileges on function public.get_market_timeseries_v2(text) from public, anon, authenticated;
revoke all privileges on function public.get_metric_lineage_v1(text, text, text) from public, anon, authenticated;
revoke all privileges on function public.get_warehouse_operations_summary_v1() from public, anon, authenticated;

grant execute on function public.get_market_timeseries_v1(text) to anon, authenticated;
grant execute on function public.search_market_geographies_v2(text, text, text, integer) to anon, authenticated;
grant execute on function public.get_market_snapshot_v2(text) to anon, authenticated;
grant execute on function public.compare_market_geographies_v1(text[]) to anon, authenticated;
grant execute on function public.get_market_map_markers_v1(numeric, numeric, numeric, numeric, text, integer) to anon, authenticated;
grant execute on function public.get_market_timeseries_v2(text) to anon, authenticated;
grant execute on function public.get_metric_lineage_v1(text, text, text) to anon, authenticated;
grant execute on function public.get_warehouse_operations_summary_v1() to anon, authenticated;

-- Internal schemas are deliberately not exposed directly via the Data API.
-- `staging` only exists where the full 003-036 warehouse history has been
-- applied (e.g. warehouse-validation, or a clean 001-046 replay) -- the
-- Sprint 18.2 Production minimum-contract bootstrap (048-054) deliberately
-- never creates it (zero staging tables are read by any granted view/
-- function). Guard the revoke so this migration applies unmodified in both
-- contexts instead of hard-failing on Production with "schema staging does
-- not exist" -- found via the Sprint 18.2 Phase 9 rehearsal against a
-- disposable branch that reproduces Production's actual (no-staging) state.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'staging') then
    revoke all on schema staging from anon, authenticated;
  end if;
end $$;

revoke all on schema core, mart, meta from anon, authenticated;