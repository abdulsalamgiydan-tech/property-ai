-- ============================================================
-- Sprint 13 Phase 2, Workstream 9 — watchlist change detection.
-- Additive only: no DROP/TRUNCATE/DELETE. Same RLS shape as every other
-- public.* user table.
--
-- watchlist_items gains a snapshot cache (last_known_snapshot_json,
-- last_checked_at) so change detection has something to diff against —
-- this is a cache of already-public warehouse data, not new PII.
--
-- watchlist_change_events is the persisted, idempotent event log:
-- uniqueness is enforced on (watchlist_item_id, event_type,
-- metric_family, new_value) so re-running detection against an
-- unchanged transition never inserts a duplicate row.
--
-- notification_preferences is schema-only capability per the guardrail
-- "prepare the capability only, do not send". No email/SMS/push is sent
-- by any code in this migration or its application layer.
-- ============================================================

alter table public.watchlist_items
  add column if not exists last_known_snapshot_json jsonb,
  add column if not exists last_checked_at timestamptz;

create table if not exists public.watchlist_change_events (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  watchlist_item_id  uuid not null references public.watchlist_items(id) on delete cascade,
  event_type         text not null,
  metric_family      text not null,
  description        text not null,
  previous_value     text,
  new_value          text,
  read               boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (watchlist_item_id, event_type, metric_family, new_value)
);

alter table public.watchlist_change_events enable row level security;

drop policy if exists "Users can view their own change events" on public.watchlist_change_events;
create policy "Users can view their own change events"
  on public.watchlist_change_events for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own change events" on public.watchlist_change_events;
create policy "Users can insert their own change events"
  on public.watchlist_change_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own change events" on public.watchlist_change_events;
create policy "Users can update their own change events"
  on public.watchlist_change_events for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own change events" on public.watchlist_change_events;
create policy "Users can delete their own change events"
  on public.watchlist_change_events for delete
  using (auth.uid() = user_id);

create index if not exists watchlist_change_events_user_idx
  on public.watchlist_change_events (user_id, created_at desc);

-- ── notification_preferences — schema only, nothing sends yet ──────────
create table if not exists public.notification_preferences (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  digest_frequency  text not null default 'off',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "Users can view their own notification preferences" on public.notification_preferences;
create policy "Users can view their own notification preferences"
  on public.notification_preferences for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notification preferences" on public.notification_preferences;
create policy "Users can insert their own notification preferences"
  on public.notification_preferences for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notification preferences" on public.notification_preferences;
create policy "Users can update their own notification preferences"
  on public.notification_preferences for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own notification preferences" on public.notification_preferences;
create policy "Users can delete their own notification preferences"
  on public.notification_preferences for delete
  using (auth.uid() = user_id);

drop trigger if exists set_notification_preferences_updated_at on public.notification_preferences;
create trigger set_notification_preferences_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();
