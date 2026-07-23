-- Sprint 14 WS2 — user_onboarding_preferences table.
--
-- Backs a one-time, skippable onboarding step shown right after first
-- sign-in (app/onboarding, wired from app/auth/complete). Mirrors the
-- existing notification_preferences table's shape (039_watchlist_change_events.sql-
-- adjacent Sprint 13 migration) — one row per user, upsert-on-conflict,
-- standard auth.uid() = user_id RLS.
--
-- Additive only: creates one new table, no changes to any existing
-- table, policy, or function. Not a destructive migration.
--
-- NOTE: this migration is written and statically verified (see
-- 043_onboarding_preferences.test.ts and warehouse:rls:check) but is
-- NOT applied to production as part of Sprint 14 Workstream 2. The
-- onboarding flow fails open if this table doesn't exist yet (treats
-- "status unknown" as "already completed" so a missing migration can
-- never trap a user in a broken redirect loop) — see
-- lib/supabase/onboardingPreferences.ts. Applying this migration
-- requires the same explicit approval as every other production
-- database change in this project.

create table if not exists public.user_onboarding_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  primary_goal text,
  states_of_interest text[] not null default '{}',
  completed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_onboarding_preferences enable row level security;

-- auth.uid() is wrapped in (select ...) per Supabase's own performance
-- advisor guidance (Sprint 15 baseline audit) — this lets Postgres
-- evaluate it once per statement (an InitPlan) instead of once per row.
-- No behavioural change from the unwrapped form, purely a performance fix.
drop policy if exists "Users can view their own onboarding preferences" on public.user_onboarding_preferences;
create policy "Users can view their own onboarding preferences"
  on public.user_onboarding_preferences for select
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own onboarding preferences" on public.user_onboarding_preferences;
create policy "Users can insert their own onboarding preferences"
  on public.user_onboarding_preferences for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own onboarding preferences" on public.user_onboarding_preferences;
create policy "Users can update their own onboarding preferences"
  on public.user_onboarding_preferences for update
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own onboarding preferences" on public.user_onboarding_preferences;
create policy "Users can delete their own onboarding preferences"
  on public.user_onboarding_preferences for delete
  using ((select auth.uid()) = user_id);
