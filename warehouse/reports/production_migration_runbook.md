# Production Migration Runbook: 042-044

Generated: 2026-07-24 23:07 AEST

## Guardrails

Do not execute this runbook until Abdul separately approves a Production database migration.

This runbook does not merge PR #23, does not deploy the app to Production, does not change Production Vercel environment variables, does not enable Admin, and does not enable Copilot.

## Migration Order

Apply in this exact order:

1. `042_research_copilot_queries.sql`
2. `043_onboarding_preferences.sql`
3. `044_user_feedback.sql`

Stop if any earlier migration is missing or if any of 042-044 is already partially applied.

## Pre-Flight Checks

Run these before any Production SQL:

```powershell
git status --short --branch
git branch --show-current
git rev-parse HEAD
gh pr view 23 --json number,state,isDraft,mergedAt,headRefName,headRefOid,baseRefName,url,statusCheckRollup
```

Expected:

- Branch is `feature/sprint14-production-readiness`.
- PR #23 is `OPEN`, `isDraft=true`, `mergedAt=null`.
- Head SHA is the intended release commit.
- CI checks are green.

Confirm Production Supabase target:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Expected latest entries:

- `037_scenario_lab_cases`
- `038_watchlist_geography_linking`
- `039_watchlist_change_events`
- `040_user_entitlements`
- `041_scenario_lab_case_limits`

Stop if:

- The project ref is not `oshquaxsloolqucwvigc`.
- The endpoint, dashboard, CLI context, or connection string points to any non-Production target while attempting Production work.
- Any of migrations 042-044 already appears but the schema objects are missing or inconsistent.
- Any unexpected migration appears after 041.
- A human has not explicitly approved the Production DB migration.

## SQL Execution

Use Supabase dashboard SQL editor or the approved Supabase CLI process. Do not paste credentials into source files, shell history, screenshots, or reports.

For each migration, execute the full file contents exactly as committed:

```powershell
Get-Content -Raw supabase\migrations\042_research_copilot_queries.sql
Get-Content -Raw supabase\migrations\043_onboarding_preferences.sql
Get-Content -Raw supabase\migrations\044_user_feedback.sql
```

Expected result for each migration: completes successfully with no error.

Observed rehearsal timings on disposable branch `umdpjizroetwblwowcrx`:

- 042: 10.98s MCP wall time
- 043: 1.12s MCP wall time
- 044: 1.36s MCP wall time

Estimated downtime: none expected. These migrations create new tables, new indexes on empty new tables, and policies. They do not rewrite existing Production tables.

## Lock Expectations

Expected locks:

- `create table`: locks newly-created relation.
- `create index`: locks newly-created relation.
- `alter table ... enable row level security`: locks newly-created relation.
- FK creation references `auth.users`; no existing application table rewrite.

Stop if:

- Locks wait for more than 30 seconds.
- Any application-facing existing table is blocked.
- The SQL editor reports deadlock, timeout, or FK/schema dependency failure.

## Post-Migration Verification

Run:

```sql
select version, name
from supabase_migrations.schema_migrations
where name in (
  '042_research_copilot_queries',
  '043_onboarding_preferences',
  '044_user_feedback'
)
order by version;
```

Expected: all three appear in order.

Run:

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'research_copilot_queries',
    'user_onboarding_preferences',
    'user_feedback'
  )
order by c.relname;
```

Expected: three rows, all `rls_enabled=true`.

Run:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'research_copilot_queries',
    'user_onboarding_preferences',
    'user_feedback'
  )
order by tablename, policyname;
```

Expected:

- `research_copilot_queries`: select-own and insert-own only.
- `user_onboarding_preferences`: select/insert/update/delete own-row policies.
- `user_feedback`: select-own and insert-own only.
- All predicates use `(select auth.uid()) = user_id`.

Run Supabase advisors:

- Security advisor: no new finding on the three new tables.
- Performance advisor: no `auth_rls_initplan` finding on the three new tables.

Run application checks after migration and before any Production deployment:

```powershell
npm run lint
npm run test
npm run build
npm run warehouse:check
npm run warehouse:rls:check
npm run warehouse:lineage:check
```

Expected:

- Lint: 0 errors. Existing warnings may remain if unchanged.
- Tests: 442/442 pass.
- Build: succeeds.
- Warehouse, RLS, and lineage checks: pass.

## Feature Flags

Keep these unset unless separately approved:

- `RESEARCH_COPILOT_ENABLED`
- `ADMIN_EMAILS`
- Production `SUPABASE_SERVICE_ROLE_KEY`

Applying 042-044 alone must not enable Copilot or Admin.

## Stop Conditions

Stop and do not continue if:

- Production ref is not conclusively `oshquaxsloolqucwvigc`.
- Production migration ledger is not exactly through 041 before execution.
- Any migration fails.
- Any RLS policy is missing or has a non-owner predicate.
- Any privileged secret appears in browser JavaScript, logs, traces, screenshots, or reports.
- The application starts using Production unexpectedly during Preview/UAT checks.
- A Production deployment, promotion, or PR merge would be required to continue.
