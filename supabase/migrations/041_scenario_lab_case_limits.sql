-- ============================================================
-- Sprint 14, Workstream 12 — tier-aware volume limit on saved Scenario
-- Lab cases. Additive only: adds a new BEFORE INSERT trigger, does NOT
-- modify the existing (working, already-tested) insert policy from
-- migration 037. Deliberately kept as a separate trigger rather than
-- rewriting the RLS policy's WITH CHECK clause, so a bug here can be
-- fixed/dropped without any risk to the existing, proven RLS shape.
--
-- Mirrors lib/auth/entitlements.ts's FEATURE_LIMITS.saved_scenarios
-- exactly (free=10, research=25, investor_pro=100, professional=
-- unlimited) — this trigger is the actual source of truth for
-- enforcement (runs at the database level, cannot be bypassed by any
-- client, including a direct Supabase REST/JS call that skips this
-- app's own API routes entirely); the TypeScript copy exists only so
-- the UI can show a usage count and upgrade prompt before a user hits
-- this hard limit.
--
-- SECURITY INVOKER (the default — no `security definer` used): the
-- inserting user already has RLS SELECT access to their own
-- user_entitlements row and their own scenario_lab_cases rows, so no
-- elevated privilege is needed, avoiding the exact "SECURITY DEFINER
-- function callable by anon/authenticated" class of issue the security
-- advisor already flags elsewhere in this project (see
-- sprint13_phase2_security_report.md and sprint14_ws16_security_report.md).
-- ============================================================

create or replace function public.enforce_scenario_lab_case_limit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tier text;
  v_limit integer;
  v_count integer;
begin
  v_tier := coalesce(
    (select tier from public.user_entitlements where user_id = new.user_id),
    'free'
  );

  v_limit := case v_tier
    when 'professional' then null
    when 'investor_pro' then 100
    when 'research' then 25
    else 10
  end;

  if v_limit is not null then
    select count(*) into v_count
    from public.scenario_lab_cases
    where user_id = new.user_id;

    if v_count >= v_limit then
      raise exception 'scenario_lab_case_limit_exceeded: tier % allows at most % saved scenarios', v_tier, v_limit
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_scenario_lab_case_limit on public.scenario_lab_cases;
create trigger enforce_scenario_lab_case_limit
  before insert on public.scenario_lab_cases
  for each row execute function public.enforce_scenario_lab_case_limit();
