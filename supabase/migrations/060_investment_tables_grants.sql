-- 060 — explicit table-privilege grants for the investment user tables.
--
-- STATUS: PREPARED, NOT APPLIED REMOTELY. Additive only (GRANT statements — no
-- schema/data change). Do NOT apply without separate human approval.
--
-- WHY (found during the V6B validation rehearsal): migration 059's user tables
-- (public.investment_profiles / investment_shortlist_items) rely — like every
-- existing user-table migration (038/043/044) — on Supabase's default privileges
-- to grant the `authenticated` role DML. Those default privileges are applied by
-- the tracked migration-runner role, but the V6B rehearsal applied 059 through the
-- controlled RAW-SQL path, which did NOT trigger the `authenticated` DML grant.
-- Result on the validation branch: `authenticated` had SELECT but not
-- INSERT/UPDATE/DELETE, so the save/shortlist writes fail closed. RLS still gates
-- every row to its owner; this only restores the intended DML surface.
--
-- This migration makes the grant EXPLICIT so the tables are correct regardless of
-- application path (raw-SQL or migration runner), removing the default-privilege
-- fragility. RLS (059) remains the row-level guard: authenticated can only touch
-- rows where (select auth.uid()) = user_id.

grant select, insert, update, delete on public.investment_profiles        to authenticated;
grant select, insert, update, delete on public.investment_shortlist_items to authenticated;

-- anon (unauthenticated) needs no write access; RLS returns zero rows to anon.
grant select on public.investment_profiles        to anon;
grant select on public.investment_shortlist_items to anon;
