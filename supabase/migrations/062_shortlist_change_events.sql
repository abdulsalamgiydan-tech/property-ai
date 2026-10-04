-- 062 — Shortlist change-events + notification preferences (V7A, Sprint C).
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Additive only — creates new objects,
-- edits nothing migrations 001–061 created. Rehearsed locally (PGlite) only.
-- Do NOT apply to Supabase validation or Production without separate human
-- approval. Production and the live V6D beta are untouched by this file.
--
-- WHAT (roadmap "V7 slice: watchlist + change-alerts on shortlisted suburbs"):
--   public.investment_shortlist_change_events — one detected change per
--     (user, shortlisted suburb, metric, property_type, new period). Values are
--     copied from accepted OFFICIAL observations only; a metric that goes
--     missing/stale produces a CONFIDENCE event with null new_value (never a
--     fabricated number). Same-user + must-be-shortlisted enforced by a composite
--     FK to public.investment_shortlist_items(user_id, geography_id).
--   public.investment_notification_prefs — per-user alert switches.
--   public.detect_shortlist_change_events_v1(...) — least-privilege SECURITY
--     DEFINER writer: only path that inserts events, so a client can never forge
--     an alert. Mirrors 059's get_investment_candidates_v1 pattern.
--
-- SCOPE of the v1 SQL detector: it records VALUE-ADVANCE events (new/up/down/flat)
-- when an accepted official metric reaches a newer period_end. CONFIDENCE events
-- (a mandatory metric that goes missing/stale → null new_value; never a fabricated
-- figure) are produced by the deterministic application-layer detector
-- (lib/opportunity/changes.detectMetricChanges) and stored in the same table; the
-- partial unique index below keeps at most one open confidence row per metric.
-- Folding confidence detection into this RPC is a documented v2 follow-up.
--
-- SECURITY MODEL (matches 059/061):
--   * anon/PUBLIC: no access to either user table.
--   * authenticated: SELECT + UPDATE (mark seen) + DELETE (dismiss) on events;
--     NO INSERT — events only appear via the SECURITY DEFINER detector. Full DML
--     on prefs. RLS gates every row to (select auth.uid()) = user_id.
--   * The detector reads the internal scoring inputs via the same neutral path
--     the engine uses and writes only the caller's own events.

-- ---------------------------------------------------------------------------
-- 1) Per-suburb, per-metric change events on a user's shortlisted suburbs.
--    A change is only recorded when the OFFICIAL observation advances to a newer
--    period_end (a genuine refresh), or when a previously present mandatory
--    metric becomes missing/stale (a confidence event, new_value null).
-- ---------------------------------------------------------------------------
create table if not exists public.investment_shortlist_change_events (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  geography_id    text not null,
  metric          text not null,
  property_type   text not null check (property_type in ('house','unit')),
  -- Direction of the change. 'confidence' => metric went missing/stale
  -- (new_value is null; we never invent a replacement figure).
  direction       text not null check (direction in ('up','down','flat','new','confidence')),
  old_value       numeric,
  new_value       numeric,
  old_period_end  date,
  new_period_end  date,
  -- Provenance copied verbatim from the accepted official observation so every
  -- surfaced figure maps back to its source (no derived/licensed values here).
  unit            text,
  source_id       text,
  attribution     text,
  detected_at     timestamptz not null default now(),
  seen_at         timestamptz,
  -- Idempotent detection: re-running the detector for the same refreshed period
  -- never duplicates an event. A confidence event (null new_period_end) collapses
  -- to one row per (user, suburb, metric, ptype) via the partial index below.
  unique (user_id, geography_id, metric, property_type, new_period_end),
  -- Same-user AND the suburb must actually be on this user's shortlist. Removing
  -- the suburb from the shortlist cascades its change events away.
  constraint shortlist_change_events_on_shortlist_fkey
    foreign key (user_id, geography_id)
    references public.investment_shortlist_items (user_id, geography_id)
    on delete cascade
);

-- Confidence events carry null new_period_end, which the unique constraint above
-- treats as distinct — collapse them to one open row per metric so a suburb that
-- stays stale doesn't accrete duplicates.
create unique index if not exists shortlist_change_events_confidence_uniq
  on public.investment_shortlist_change_events (user_id, geography_id, metric, property_type)
  where new_period_end is null;

create index if not exists shortlist_change_events_user_unseen_idx
  on public.investment_shortlist_change_events (user_id, seen_at, detected_at desc);

alter table public.investment_shortlist_change_events enable row level security;

-- authenticated: read / mark-seen / dismiss own rows only. NO insert policy —
-- the SECURITY DEFINER detector is the sole writer, so alerts can't be forged.
drop policy if exists "change_events_select_own" on public.investment_shortlist_change_events;
create policy "change_events_select_own" on public.investment_shortlist_change_events for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "change_events_update_own" on public.investment_shortlist_change_events;
create policy "change_events_update_own" on public.investment_shortlist_change_events for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "change_events_delete_own" on public.investment_shortlist_change_events;
create policy "change_events_delete_own" on public.investment_shortlist_change_events for delete to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.investment_shortlist_change_events is
  'Per-user change alerts on shortlisted suburbs. Populated only by the SECURITY DEFINER detector (no client INSERT); RLS gates rows to their owner. Values/provenance are copied from accepted official observations; a missing/stale mandatory metric yields a confidence event with null new_value (never a fabricated figure).';

-- ---------------------------------------------------------------------------
-- 2) Per-user notification preferences (opt-out / thresholds).
-- ---------------------------------------------------------------------------
create table if not exists public.investment_notification_prefs (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  alerts_enabled   boolean not null default true,
  -- Suppress micro-moves: only surface value changes >= this percent. Confidence
  -- (missing/stale) events ignore this threshold — trust signals always show.
  min_change_pct   numeric not null default 0 check (min_change_pct >= 0),
  updated_at       timestamptz not null default now()
);
alter table public.investment_notification_prefs enable row level security;

drop policy if exists "notif_prefs_select_own" on public.investment_notification_prefs;
create policy "notif_prefs_select_own" on public.investment_notification_prefs for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "notif_prefs_insert_own" on public.investment_notification_prefs;
create policy "notif_prefs_insert_own" on public.investment_notification_prefs for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "notif_prefs_update_own" on public.investment_notification_prefs;
create policy "notif_prefs_update_own" on public.investment_notification_prefs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "notif_prefs_delete_own" on public.investment_notification_prefs;
create policy "notif_prefs_delete_own" on public.investment_notification_prefs for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3) Grants (least-privilege, matches 061).
-- ---------------------------------------------------------------------------
revoke all on public.investment_shortlist_change_events from anon, public;
revoke all on public.investment_notification_prefs       from anon, public;
-- Events: authenticated may read, mark-seen (update), and dismiss (delete) —
-- never insert (definer-only writer).
grant select, update, delete on public.investment_shortlist_change_events to authenticated;
grant select, insert, update, delete on public.investment_notification_prefs to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Least-privilege detector. SECURITY DEFINER with pinned search_path: the
--    only writer of change events. Compares each of the caller's shortlisted
--    suburbs' current accepted official metrics against the latest event already
--    recorded, and inserts a new event when the official observation advanced to
--    a newer period with a changed value (or a mandatory metric went missing).
--    Deterministic, additive, and scoped to (select auth.uid()) only.
-- ---------------------------------------------------------------------------
create or replace function public.detect_shortlist_change_events_v1()
returns integer
language plpgsql
security definer
set search_path to 'public', 'core', 'mart'
as $function$
declare
  v_user uuid := (select auth.uid());
  v_inserted integer := 0;
begin
  if v_user is null then
    return 0;  -- unauthenticated: nothing to do, no leak.
  end if;

  -- Value-advance events: for each shortlisted suburb + its scoring inputs,
  -- emit a row when the current accepted metric period_end is newer than the
  -- newest period we've already recorded for that (suburb, metric, ptype).
  with shortlist as (
    select s.geography_id, coalesce(p.inputs->>'propertyType', 'house') as property_type
    from public.investment_shortlist_items s
    left join public.investment_profiles p
      on p.id = s.profile_id and p.user_id = s.user_id
    where s.user_id = v_user
  ),
  current_metrics as (
    select sl.geography_id, sl.property_type,
           m.key   as metric,
           (m.value->>'value')::numeric        as value,
           m.value->>'unit'                     as unit,
           (m.value->>'period_end')::date       as period_end,
           m.value->>'source_id'                as source_id,
           m.value->>'attribution'              as attribution
    from shortlist sl
    join mart.suburb_scoring_input_v1 s
      on s.geography_id = sl.geography_id and s.property_type = sl.property_type
    cross join lateral jsonb_each(s.metrics) as m(key, value)
  ),
  last_seen as (
    select geography_id, metric, property_type, max(new_period_end) as last_period
    from public.investment_shortlist_change_events
    where user_id = v_user and new_period_end is not null
    group by geography_id, metric, property_type
  ),
  prior_value as (
    select e.geography_id, e.metric, e.property_type, e.new_value
    from public.investment_shortlist_change_events e
    join last_seen ls
      on ls.geography_id = e.geography_id and ls.metric = e.metric
     and ls.property_type = e.property_type and ls.last_period = e.new_period_end
    where e.user_id = v_user
  )
  insert into public.investment_shortlist_change_events
    (user_id, geography_id, metric, property_type, direction,
     old_value, new_value, old_period_end, new_period_end, unit, source_id, attribution)
  select
    v_user, cm.geography_id, cm.metric, cm.property_type,
    case
      when ls.last_period is null then 'new'
      when cm.value > pv.new_value then 'up'
      when cm.value < pv.new_value then 'down'
      else 'flat'
    end,
    pv.new_value, cm.value, ls.last_period, cm.period_end, cm.unit, cm.source_id, cm.attribution
  from current_metrics cm
  left join last_seen ls
    on ls.geography_id = cm.geography_id and ls.metric = cm.metric and ls.property_type = cm.property_type
  left join prior_value pv
    on pv.geography_id = cm.geography_id and pv.metric = cm.metric and pv.property_type = cm.property_type
  where cm.period_end is not null
    and (ls.last_period is null or cm.period_end > ls.last_period)
  on conflict (user_id, geography_id, metric, property_type, new_period_end) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$function$;

comment on function public.detect_shortlist_change_events_v1() is
  'Least-privilege change detector (V7A). SECURITY DEFINER, pinned search_path. Sole writer of investment_shortlist_change_events; scoped to the calling user (auth.uid()) and their shortlisted suburbs only. Records a value-advance event when an accepted official metric reaches a newer period_end. Deterministic and idempotent (ON CONFLICT DO NOTHING). Never fabricates: it copies official values + provenance verbatim.';

revoke all on function public.detect_shortlist_change_events_v1() from public;
grant execute on function public.detect_shortlist_change_events_v1() to authenticated;
