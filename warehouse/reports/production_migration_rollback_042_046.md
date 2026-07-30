# Production Migration Rollback: 042-046

Generated: 2026-07-30

> Supersedes `production_migration_rollback.md` (2026-07-24), which only
> covers 042-044. This extends coverage to the two Sprint 17 migrations
> (045, 046) added since. The 042-044 rollback SQL below is unchanged from
> that report.

## Scope

Rollback for migrations:

- `042_research_copilot_queries`
- `043_onboarding_preferences`
- `044_user_feedback`
- `045_sprint17_preferences_feedback_controls`
- `046_research_api_grant_hardening`

## 042-044 — new tables (unchanged from the prior report)

These three migrations each create one new table with no inbound foreign
keys from any other table, so each can be dropped independently in any
order.

Pre-rollback export, if the migration has been live long enough to collect
rows:

```sql
select * from public.user_feedback;
select * from public.user_onboarding_preferences;
select * from public.research_copilot_queries;
```

Rollback SQL:

```sql
drop table if exists public.user_feedback;
drop table if exists public.user_onboarding_preferences;
drop table if exists public.research_copilot_queries;
```

Validation:

```sql
select
  to_regclass('public.research_copilot_queries') is null as copilot_removed,
  to_regclass('public.user_onboarding_preferences') is null as onboarding_removed,
  to_regclass('public.user_feedback') is null as feedback_removed;
```

**Note:** if 045 has already been applied, run the 045 rollback below
*before* dropping these tables entirely (dropping the table removes the
045 columns anyway, but the 045 rollback is the correct step if the intent
is to keep the base 043/044 tables and only undo the Sprint 17 additions).

## 045 — additive columns on existing tables (new in this report)

Migration 045 added columns, check constraints, and two indexes to the
*existing* `user_onboarding_preferences` (043) and `user_feedback` (044)
tables. It created no new tables, so rollback here means dropping the
added columns/constraints/indexes, not dropping a table.

**This exact SQL is exercised in CI** against a disposable database
immediately after a full 001-046 replay — see
`scripts/rollback-045-replay-test.mjs`, run as a step in the
`clean-migration-replay` job in `.github/workflows/warehouse-validation.yml`
— rather than only asserted manually once on a throwaway branch.

Pre-rollback export of the columns that will be dropped, if needed:

```sql
select id, user_id, satisfaction_score, contact_permission, client_submission_id, technical_context, status, updated_at
from public.user_feedback;

select user_id, strategy_focus, investment_timeframe, budget_range, deposit_range, preferred_property_types,
       risk_tolerance, buyer_context, portfolio_status, guidance_level, notification_frequency, completion_step,
       skipped_at, last_edited_from
from public.user_onboarding_preferences;
```

Rollback SQL (reverse dependency order — indexes and constraints first,
then the columns they depend on):

```sql
drop index if exists public.user_feedback_status_created_idx;
drop index if exists public.user_feedback_user_submission_id_idx;

alter table public.user_feedback
  drop constraint if exists user_feedback_status_check,
  drop constraint if exists user_feedback_message_length_check,
  drop constraint if exists user_feedback_satisfaction_score_check,
  drop constraint if exists user_feedback_category_check;

alter table public.user_feedback
  drop column if exists updated_at,
  drop column if exists status,
  drop column if exists technical_context,
  drop column if exists client_submission_id,
  drop column if exists contact_permission,
  drop column if exists satisfaction_score;

alter table public.user_onboarding_preferences
  drop constraint if exists user_onboarding_preferences_completion_step_check,
  drop constraint if exists user_onboarding_preferences_notification_frequency_check,
  drop constraint if exists user_onboarding_preferences_guidance_check,
  drop constraint if exists user_onboarding_preferences_portfolio_status_check,
  drop constraint if exists user_onboarding_preferences_buyer_context_check,
  drop constraint if exists user_onboarding_preferences_risk_check,
  drop constraint if exists user_onboarding_preferences_deposit_check,
  drop constraint if exists user_onboarding_preferences_budget_check,
  drop constraint if exists user_onboarding_preferences_timeframe_check,
  drop constraint if exists user_onboarding_preferences_strategy_focus_check;

alter table public.user_onboarding_preferences
  drop column if exists last_edited_from,
  drop column if exists skipped_at,
  drop column if exists completion_step,
  drop column if exists notification_frequency,
  drop column if exists guidance_level,
  drop column if exists portfolio_status,
  drop column if exists buyer_context,
  drop column if exists risk_tolerance,
  drop column if exists preferred_property_types,
  drop column if exists deposit_range,
  drop column if exists budget_range,
  drop column if exists investment_timeframe,
  drop column if exists strategy_focus;
```

Validation (also asserted automatically in CI):

- `user_feedback` and `user_onboarding_preferences` still exist.
- Only the pre-045 columns remain (`id, user_id, category, message,
  page_path, created_at` for feedback; `user_id, primary_goal,
  states_of_interest, completed_at, updated_at` for onboarding).
- RLS remains enabled on both tables (rollback never touches
  `enable row level security` or the select/insert policies from 043/044).
- The two 045-added indexes no longer exist.

Limitations: drops all data held only in the removed columns (satisfaction
scores, contact permission, technical context, onboarding preference
detail) unless exported first. Does not affect the base 043/044 columns or
rows.

## 046 — grant hardening (no structural rollback provided, by design)

Migration 046 makes **no schema changes** — no table, view, function,
column, or index is created or dropped. It only revokes then re-grants
`SELECT`/`EXECUTE` on already-existing curated research views and RPCs, to
remove noisy-but-harmless default privileges (`REFERENCES`/`TRIGGER`, and
Postgres's default `EXECUTE ... TO PUBLIC` on new functions) down to the
minimum surface the app actually needs.

There is deliberately no "rollback SQL" here, because the only meaningful
rollback would be re-granting the broader default privileges this
migration exists to remove — which would reintroduce exactly the grant
sprawl it was designed to close, not fix an incident.

**If 046 breaks something in practice** (a route that legitimately needs a
privilege this migration revoked and didn't re-grant), the correct
response is a targeted forward-fix, not a rollback:

1. Identify the exact object and privilege the failing request needs
   (`grant select on table public.<view> to anon, authenticated;` or
   `grant execute on function public.<fn>(...) to anon, authenticated;`).
2. Add a new additive migration (047+) granting only that specific
   privilege back, with the same reasoning documented inline that 046
   itself uses.
3. Do not run a blanket `grant all` against these objects.

## Post-Rollback Application Behaviour

- Feedback submission displays a friendly error if `user_feedback` (or a
  column it references) is missing/changed — see
  `lib/supabase/feedback.ts`.
- Onboarding status fails open (treats "status unknown" as "already
  completed") if `user_onboarding_preferences` or its 045 columns are
  missing — see `lib/supabase/onboardingPreferences.ts`.
- Admin/Copilot remain inaccessible while their respective flags are unset,
  independent of any of the above.

Run after any rollback:

```powershell
npm run test
npm run warehouse:rls:check
```

Stop if any new failure affects core authenticated flows.

## Non-negotiable

Before running any of this against a real database, confirm the target
connection string does **not** reference Production
(`oshquaxsloolqucwvigc`) or, for non-Production database work, that it
matches the intended `warehouse-validation` branch and not Production.
Get the same explicit approval this project requires for any database
change, even a rollback.
