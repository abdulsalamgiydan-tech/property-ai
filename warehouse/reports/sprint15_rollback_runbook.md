# Sprint 15 — Rollback Runbook

## Code rollback (Vercel)

If a production deploy of this branch needs to be reverted: Vercel
keeps every prior deployment addressable and instantly promotable —
`vercel rollback` (CLI) or the "Promote to Production" action on any
prior deployment in the Vercel dashboard. No code changes required, no
database rollback required for a pure code revert, since every
migration this sprint is additive-only (see below) — an older code
version simply won't query tables that don't exist yet, or will
correctly treat a missing table as absent (the explicit "fails safe"
design of `getOnboardingStatus()`, `countRecentQueries()`, and
`submitFeedback()`'s error handling).

## Database rollback (migrations 042, 043, 044)

Each migration is a single new table with no foreign keys pointing
*into* it from any other table (only outward, to `auth.users`), so
each can be dropped independently and safely, in any order, without
cascading into unrelated data:

```sql
-- 044
drop table if exists public.user_feedback;

-- 043
drop table if exists public.user_onboarding_preferences;

-- 042
drop table if exists public.research_copilot_queries;
```

**Before running any of these against production**: confirm the
target connection string does NOT reference a branch ref other than
production's own (`oshquaxsloolqucwvigc`) — the same hard-stop
convention every script in this codebase already follows. Get the same
explicit approval this project requires for any production database
change, even a rollback.

**Impact of dropping each table**, so the decision-maker knows what's
actually lost:
- Dropping `research_copilot_queries`: loses copilot rate-limit history
  and the audit trail of past questions. The copilot feature itself
  degrades to un-rate-limited (fails open) rather than breaking,
  per its own design — but this removes the audit trail entirely, not
  just the enforcement.
- Dropping `user_onboarding_preferences`: every user re-sees the
  onboarding step once. No other data loss — the step is explicitly
  designed to be skippable and non-blocking.
- Dropping `user_feedback`: loses all submitted feedback permanently.
  This is real user-submitted content, unlike the other two tables'
  more operational nature — consider exporting
  (`select * from public.user_feedback`) before dropping, if any
  feedback has been submitted.

## Rollback of the RLS performance fix (migration 045-equivalent)

The `(select auth.uid())` fix applied to the `warehouse-validation`
branch this session (mirrored into the 042/043/044 source files) is
not itself a separate migration file — it's the *correct* form of
042/043/044's own policies. There is nothing to roll back here
independently; rolling back 042/043/044 (above) removes it along with
everything else in those tables.

## Rollback of WS13/14/15 (Refresh Engine V4, ops console v2)

Pure code, no database changes. Reverting the commit(s) that
introduced `refresh_engine_v4.mjs`, `refresh_v4_lib.mjs`, and the
ops-console additions to `app/research/data-status/page.tsx` is
sufficient — no data migration, no state to clean up (v4 has no
`--execute` mode and writes no state file of its own; v3's existing
`v3_last_run.json` is untouched by any of this sprint's changes).

## Rollback of test data (Sprint 15 UAT)

The 4 test accounts and their rows on the `warehouse-validation`
branch (`sprint15-uat-*@example.com`) are non-production and can be
removed at any time with no impact on anything else:

```sql
delete from public.scenario_lab_cases where user_id in (select id from auth.users where email like 'sprint15-uat-%');
delete from public.user_feedback where user_id in (select id from auth.users where email like 'sprint15-uat-%');
delete from public.research_copilot_queries where user_id in (select id from auth.users where email like 'sprint15-uat-%');
delete from public.user_entitlements where user_id in (select id from auth.users where email like 'sprint15-uat-%');
delete from auth.identities where user_id in (select id from auth.users where email like 'sprint15-uat-%');
delete from auth.users where email like 'sprint15-uat-%';
```

Left in place intentionally for now — see
`sprint15_authenticated_uat_report.md`'s "Test data disposition"
section for why.

## What is NOT reversible, and was therefore never done without approval

- Migration 041 (applied to production in an earlier Sprint 14
  checkpoint, with explicit approval) is not covered by this rollback
  runbook — it was a separate, already-approved, already-verified
  action from a prior session.
- No `main` merge occurred this sprint — nothing to revert there.
- No production deploy occurred this sprint — nothing to roll back on
  Vercel's production environment.
