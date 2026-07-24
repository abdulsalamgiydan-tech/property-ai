# Production Migration Rollback: 042-044

Generated: 2026-07-24 23:07 AEST

## Scope

Rollback for migrations:

- `042_research_copilot_queries`
- `043_onboarding_preferences`
- `044_user_feedback`

These migrations are additive. Rollback is technically simple but data-destructive for rows created after the migration.

## Rollback Trigger

Consider rollback only if:

- A migration partially applies and leaves an inconsistent schema.
- RLS verification fails and cannot be fixed immediately with a policy-only correction.
- The app returns persistent 5xx errors that are conclusively caused by the new tables/policies.
- Supabase advisors identify a new critical issue on one of the three new tables.

Do not rollback just because Copilot/Admin remain disabled; those are intended feature states.

## Pre-Rollback Export

If the migration has been live long enough to collect rows, export data before dropping tables:

```sql
select * from public.user_feedback;
select * from public.user_onboarding_preferences;
select * from public.research_copilot_queries;
```

Store exports only in an approved secure location. Do not commit exports.

## Rollback SQL

Run in reverse dependency order:

```sql
drop table if exists public.user_feedback;
drop table if exists public.user_onboarding_preferences;
drop table if exists public.research_copilot_queries;
```

Expected:

- Tables are removed.
- Dependent indexes and policies are removed with the tables.
- Existing Production tables are not modified.

## Rollback Validation

Run:

```sql
select
  to_regclass('public.research_copilot_queries') is null as copilot_removed,
  to_regclass('public.user_onboarding_preferences') is null as onboarding_removed,
  to_regclass('public.user_feedback') is null as feedback_removed;
```

Expected:

- `copilot_removed=true`
- `onboarding_removed=true`
- `feedback_removed=true`

Disposable-branch validation result:

- Rollback SQL was tested inside a transaction on branch `umdpjizroetwblwowcrx`.
- All three `to_regclass` checks returned `true`.
- Transaction was rolled back after validation.

## Rollback Limitations

- Drops all feedback submitted after migration 044 unless exported first.
- Drops all onboarding preference/completion rows after migration 043 unless exported first.
- Drops all copilot query/rate-limit/audit rows after migration 042 unless exported first.
- Does not remove entries from Supabase migration history if manually run outside a proper migration framework.
- Does not rollback application code, Preview deployments, PR state, or Vercel configuration.

## Post-Rollback Application Behaviour

Expected safe degradation:

- Copilot remains disabled while `RESEARCH_COPILOT_ENABLED` is unset.
- Onboarding status fails open if `user_onboarding_preferences` is missing.
- Feedback submission displays a friendly error if `user_feedback` is missing.
- Admin remains inaccessible while `ADMIN_EMAILS` and service-role config are unset.

Run after rollback:

```powershell
npm run test
npm run warehouse:rls:check
```

Stop if any new failure affects core authenticated flows.
