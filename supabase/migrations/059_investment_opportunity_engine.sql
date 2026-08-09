-- 059 — Investment Opportunity Engine (V6A): provider-neutral scoring inputs,
-- least-privilege consumer RPC, and user-owned profile/shortlist tables.
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Additive only — creates new objects,
-- edits nothing that migrations 001–058 created. Rehearsed locally (PGlite) only.
-- Do NOT apply to Supabase validation or Production without separate human approval.
--
-- Layers (see docs/architecture/provider_neutral_contract.md):
--   meta.metric_provider          — provider registry (licence class + precedence)
--   mart.suburb_scoring_input_v1  — internal: one row per (geography, property_type),
--                                    mandatory metrics + provenance as a jsonb map,
--                                    latest-per-metric with a deterministic pick.
--   public.get_investment_candidates_v1 — least-privilege consumer RPC (EXECUTE only)
--   public.investment_profiles / investment_shortlist_items — user-owned, RLS.
--
-- The engine (lib/opportunity/*) consumes the neutral RPC shape; adding Domain /
-- PropTrack / Cotality is a registry + ingestion change, never an engine change.

-- ---------------------------------------------------------------------------
-- 1) Provider registry (provider-neutral; licence class + precedence).
-- ---------------------------------------------------------------------------
create table if not exists meta.metric_provider (
  provider          text primary key,
  licence_class     text not null check (licence_class in ('open_cc_by','licensed_restricted')),
  precedence        integer not null,
  redistribution_ok boolean not null default false,
  active            boolean not null default false,
  note              text
);

comment on table meta.metric_provider is
  'Provider-neutral registry. Higher precedence wins on conflict. Only active providers are assembled into scoring inputs. licensed_restricted + redistribution_ok=false means a value may drive scoring but must not be exposed/redistributed verbatim.';

insert into meta.metric_provider (provider, licence_class, precedence, redistribution_ok, active, note) values
  ('official',  'open_cc_by',         100, true,  true,  'Official SA/VIC CC-BY open data (core.official_observation).'),
  ('domain',    'licensed_restricted', 90, false, false, 'Placeholder — inert until a signed Domain licence confirms redistribution/derived-display rights.'),
  ('proptrack', 'licensed_restricted', 85, false, false, 'Placeholder — inert until a signed PropTrack (REA) licence.'),
  ('cotality',  'licensed_restricted', 80, false, false, 'Placeholder — inert until a signed Cotality/CoreLogic licence.')
on conflict (provider) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Scoring-input view (internal). One row per (geography_id, property_type)
--    with the mandatory metrics + provenance. Provider precedence/conflict:
--    per (geo, ptype, metric) keep the single best row — direct over derived,
--    then latest period_end, then latest retrieved_at, then source_id — a
--    deterministic pick. All current rows are provider 'official'.
-- ---------------------------------------------------------------------------
create or replace view mart.suburb_scoring_input_v1 as
with latest as (
  select
    o.geography_id, o.property_type, o.metric, o.value, o.unit, o.sample_size,
    o.period_start, o.period_end, o.status, o.source_id, o.licence, o.attribution, o.retrieved_at,
    row_number() over (
      partition by o.geography_id, o.property_type, o.metric
      order by (o.status = 'direct') desc, o.period_end desc nulls last,
               o.retrieved_at desc nulls last, o.source_id asc
    ) as rn
  from core.official_observation o
  where o.status in ('direct','derived')
    and o.property_type in ('house','unit')
)
select
  l.geography_id,
  case substr(l.geography_id, 5, 1)
    when '1' then 'NSW' when '2' then 'VIC' when '3' then 'QLD'
    when '4' then 'SA'  when '5' then 'WA'  when '6' then 'TAS'
    when '7' then 'NT'  when '8' then 'ACT' else 'UNKNOWN'
  end as jurisdiction,
  l.property_type,
  jsonb_object_agg(l.metric, jsonb_build_object(
    'value',        l.value,
    'unit',         l.unit,
    'sample_size',  l.sample_size,
    'period_start', l.period_start,
    'period_end',   l.period_end,
    'status',       l.status,
    'source_id',    l.source_id,
    'licence',      l.licence,
    'attribution',  l.attribution,
    'retrieved_at', l.retrieved_at,
    'provider',     'official'
  )) as metrics
from latest l
where l.rn = 1
group by l.geography_id, l.property_type;

comment on view mart.suburb_scoring_input_v1 is
  'Internal provider-neutral scoring inputs: one row per (geography_id, property_type) with mandatory metrics + provenance as a jsonb map. NOT client-accessible (mart stays revoked); reached only via the SECURITY DEFINER consumer RPC.';

-- ---------------------------------------------------------------------------
-- 3) Least-privilege consumer RPC. SECURITY DEFINER with pinned search_path so
--    anon/authenticated need NO grant on core/mart/meta. Returns only scoring
--    inputs + provenance for the requested jurisdiction + property_type.
-- ---------------------------------------------------------------------------
create or replace function public.get_investment_candidates_v1(
  p_jurisdiction  text,
  p_property_type text
)
returns table(
  geography_id  text,
  jurisdiction  text,
  property_type text,
  metrics       jsonb
)
language sql
stable security definer
set search_path to 'public', 'core', 'mart'
as $function$
  select s.geography_id, s.jurisdiction, s.property_type, s.metrics
  from mart.suburb_scoring_input_v1 s
  where s.jurisdiction  = p_jurisdiction
    and s.property_type = p_property_type;
$function$;

comment on function public.get_investment_candidates_v1(text, text) is
  'Read-only consumer lookup for investment scoring inputs (accepted official metrics) for a jurisdiction + property_type. SECURITY DEFINER, pinned search_path; anon/authenticated receive EXECUTE only, never a grant on core/mart/meta. Returns aggregate suburb medians/counts + provenance only — no property-level PII, no internal ids/checksums, not a recommendation or forecast. Scores are computed in the application engine, not here.';

revoke all on function public.get_investment_candidates_v1(text, text) from public;
grant execute on function public.get_investment_candidates_v1(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) User-owned tables (RLS: a user only ever sees their own rows).
--    Standard (select auth.uid()) = user_id pattern (see migration 043).
-- ---------------------------------------------------------------------------
create table if not exists public.investment_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  inputs      jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.investment_profiles enable row level security;

drop policy if exists "profiles_select_own" on public.investment_profiles;
create policy "profiles_select_own" on public.investment_profiles for select
  using ((select auth.uid()) = user_id);
drop policy if exists "profiles_insert_own" on public.investment_profiles;
create policy "profiles_insert_own" on public.investment_profiles for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "profiles_update_own" on public.investment_profiles;
create policy "profiles_update_own" on public.investment_profiles for update
  using ((select auth.uid()) = user_id);
drop policy if exists "profiles_delete_own" on public.investment_profiles;
create policy "profiles_delete_own" on public.investment_profiles for delete
  using ((select auth.uid()) = user_id);

create table if not exists public.investment_shortlist_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  geography_id  text not null,
  profile_id    uuid references public.investment_profiles(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  unique (user_id, geography_id)
);
alter table public.investment_shortlist_items enable row level security;

drop policy if exists "shortlist_select_own" on public.investment_shortlist_items;
create policy "shortlist_select_own" on public.investment_shortlist_items for select
  using ((select auth.uid()) = user_id);
drop policy if exists "shortlist_insert_own" on public.investment_shortlist_items;
create policy "shortlist_insert_own" on public.investment_shortlist_items for insert
  with check ((select auth.uid()) = user_id);
drop policy if exists "shortlist_update_own" on public.investment_shortlist_items;
create policy "shortlist_update_own" on public.investment_shortlist_items for update
  using ((select auth.uid()) = user_id);
drop policy if exists "shortlist_delete_own" on public.investment_shortlist_items;
create policy "shortlist_delete_own" on public.investment_shortlist_items for delete
  using ((select auth.uid()) = user_id);
