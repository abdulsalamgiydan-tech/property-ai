-- ============================================================
-- Sprint 13 Phase 2, Workstream 11 — entitlement schema (architecture
-- only, NOT commercial activation). No billing, no payment provider, no
-- feature is gated behind a tier by this migration — it only prepares
-- the data model a future sprint could wire up.
--
-- Absence of a row means 'free' tier by convention — this table only
-- ever holds a NON-default (upgraded) entitlement, so there is no
-- "create a default row on signup" step to get wrong.
--
-- Deliberate deviation from the standard RLS shape: users may SELECT
-- their own entitlement (so the app can show it to them) but there is
-- NO insert/update/delete policy for the anon or authenticated role —
-- only service_role can change a user's tier. This is intentional:
-- allowing a user to write their own entitlement row would let them
-- grant themselves a paid tier. This table is a documented exception in
-- warehouse/scripts/quality/check_rls_policies.mjs for exactly this
-- reason, not an oversight.
-- ============================================================

create table if not exists public.user_entitlements (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  tier        text not null default 'free' check (tier in ('free', 'research', 'investor_pro', 'professional')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

drop policy if exists "Users can view their own entitlement" on public.user_entitlements;
create policy "Users can view their own entitlement"
  on public.user_entitlements for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage entitlements" on public.user_entitlements;
create policy "Service role can manage entitlements"
  on public.user_entitlements for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop trigger if exists set_user_entitlements_updated_at on public.user_entitlements;
create trigger set_user_entitlements_updated_at
  before update on public.user_entitlements
  for each row execute function public.set_updated_at();
