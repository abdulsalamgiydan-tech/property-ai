-- 061 — security hardening for the investment user tables (found in V6C.1 review).
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Additive/forward security migration.
-- Does NOT edit migrations 059 or 060 (both already applied to validation). Do NOT
-- apply without separate human approval.
--
-- Fixes:
--  1. 060 over-granted `anon` SELECT on the user tables — revoke all from anon+PUBLIC.
--  2. 059's policies were role-agnostic — re-scope every ownership policy to
--     `authenticated`, and add an explicit WITH CHECK on UPDATE (belt-and-braces
--     alongside the USING clause) so ownership can never be reassigned.
--  3. A shortlist row's profile_id could reference a profile owned by a DIFFERENT
--     user — enforce same-user at the database level via a composite foreign key
--     (profile_id, user_id) -> investment_profiles(id, user_id), with ON DELETE
--     SET NULL scoped to profile_id only (preserves the documented orphan
--     behaviour: the shortlist row survives, its profile_id becomes null).
--
-- Leaves untouched: the public candidates RPC and its anon EXECUTE; core, mart,
-- meta, warehouse data and ranking logic.

-- 1) Least-privilege: no anon / PUBLIC access to the user tables; only the
--    authenticated role keeps the DML it needs (RLS still gates rows to owners).
revoke all on public.investment_profiles        from anon, public;
revoke all on public.investment_shortlist_items from anon, public;
grant select, insert, update, delete on public.investment_profiles        to authenticated;
grant select, insert, update, delete on public.investment_shortlist_items to authenticated;

-- RLS remains enabled (from 059); reassert defensively.
alter table public.investment_profiles        enable row level security;
alter table public.investment_shortlist_items enable row level security;

-- 2) Ownership policies scoped explicitly to `authenticated`, with explicit
--    WITH CHECK on UPDATE.
drop policy if exists "profiles_select_own" on public.investment_profiles;
create policy "profiles_select_own" on public.investment_profiles for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "profiles_insert_own" on public.investment_profiles;
create policy "profiles_insert_own" on public.investment_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "profiles_update_own" on public.investment_profiles;
create policy "profiles_update_own" on public.investment_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "profiles_delete_own" on public.investment_profiles;
create policy "profiles_delete_own" on public.investment_profiles for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "shortlist_select_own" on public.investment_shortlist_items;
create policy "shortlist_select_own" on public.investment_shortlist_items for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "shortlist_insert_own" on public.investment_shortlist_items;
create policy "shortlist_insert_own" on public.investment_shortlist_items for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "shortlist_update_own" on public.investment_shortlist_items;
create policy "shortlist_update_own" on public.investment_shortlist_items for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "shortlist_delete_own" on public.investment_shortlist_items;
create policy "shortlist_delete_own" on public.investment_shortlist_items for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 3) Same-user guarantee for a linked profile_id (DB-enforced).
alter table public.investment_profiles
  add constraint investment_profiles_id_user_key unique (id, user_id);

alter table public.investment_shortlist_items
  drop constraint if exists investment_shortlist_items_profile_id_fkey;
alter table public.investment_shortlist_items
  add constraint investment_shortlist_items_profile_same_user_fkey
  foreign key (profile_id, user_id)
  references public.investment_profiles (id, user_id)
  on delete set null (profile_id);
