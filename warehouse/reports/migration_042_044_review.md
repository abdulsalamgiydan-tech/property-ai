# Sprint 15 Migration Review: 042-044

Generated: 2026-07-24 23:07 AEST

## Scope

Reviewed migrations:

- `supabase/migrations/042_research_copilot_queries.sql`
- `supabase/migrations/043_onboarding_preferences.sql`
- `supabase/migrations/044_user_feedback.sql`

Reviewed dependent code:

- `lib/research/copilotRateLimit.ts`
- `app/api/research/copilot/route.ts`
- `app/research/copilot/[geographyCode]/page.tsx`
- `lib/supabase/onboardingPreferences.ts`
- `app/auth/complete/page.tsx`
- `lib/supabase/feedback.ts`
- `components/feedback/FeedbackWidget.tsx`
- `app/admin/page.tsx`
- `warehouse/scripts/quality/check_rls_policies.mjs`

## Independent State Verification

- Branch: `feature/sprint14-production-readiness`
- Commit reviewed: `cddc7ae3152d6ec1b5dd2079b6f6f6a46f9960c3`
- PR #23: open, draft, unmerged; head `cddc7ae3152d6ec1b5dd2079b6f6f6a46f9960c3`, base `main`
- Latest GitHub Actions for this commit: `Warehouse Validation` succeeded
- Production Supabase project ref: `oshquaxsloolqucwvigc`
- Production migration ledger before and after rehearsal: `remote_schema`, `037`, `038`, `039`, `040`, `041`; migrations `042`, `043`, `044` absent
- Disposable rehearsal branch: `sprint15-migration-042-044-rehearsal`, ref `umdpjizroetwblwowcrx`, non-default, non-persistent, `with_data=false`, parent `oshquaxsloolqucwvigc`
- Disposable branch status before SQL: `FUNCTIONS_DEPLOYED`, `ACTIVE_HEALTHY`
- Disposable branch was deleted after evidence collection; it no longer appears in the Production project's branch list

## Migration 042: `research_copilot_queries`

Creates `public.research_copilot_queries`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `geography_id uuid not null`
- `question text not null`
- `grounded boolean not null`
- `created_at timestamptz not null default now()`

Indexes:

- Primary key on `id`
- `research_copilot_queries_user_created_idx` on `(user_id, created_at desc)`

RLS:

- Enables row level security
- Drops/recreates select-own policy: `(select auth.uid()) = user_id`
- Drops/recreates insert-own policy: `(select auth.uid()) = user_id`
- No update/delete policy, intentionally append-only

Application dependency:

- `countRecentQueries()` counts recent rows for DB-backed daily copilot rate limiting.
- `recordQuery()` inserts the audit/rate-limit row after generation.
- `app/api/research/copilot/route.ts` remains gated by `WAREHOUSE_PREVIEW_ENABLED` and `RESEARCH_COPILOT_ENABLED`; if the feature flag is off, the route returns 404 before auth.
- Missing table handling is safe: count returns `null` only for undefined table; record is best-effort for undefined table.

Risk notes:

- No destructive statement.
- No backfill or data scan.
- `geography_id` has no FK because warehouse geography lives outside this app database. The route validates geography server-side before insert.
- `create table`, PK creation, and index creation take locks only on newly-created objects; FK creation references `auth.users`.
- Rollback drops the table and loses copilot query/rate-limit history.

## Migration 043: `user_onboarding_preferences`

Creates `public.user_onboarding_preferences`.

Columns:

- `user_id uuid primary key references auth.users(id) on delete cascade`
- `primary_goal text null`
- `states_of_interest text[] not null default '{}'`
- `completed_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- Primary key on `user_id`; no additional index required for current access patterns.

RLS:

- Enables row level security
- Select, insert, update, and delete policies all restrict to `(select auth.uid()) = user_id`

Application dependency:

- `getOnboardingStatus()` reads the current user's row and fails open if the table is missing or a query fails.
- `saveOnboardingPreferences()` upserts the current user's row by `user_id`.
- `app/auth/complete/page.tsx` redirects to onboarding only when status is conclusively incomplete.

Risk notes:

- No destructive statement.
- No backfill or data scan.
- `updated_at` has a default but no update trigger; current app writes do not set it on update, so it may not reflect later edits. This is a product accuracy limitation, not a deployment-lock blocker.
- Rollback drops the table and causes users to lose onboarding completion/preferences.

## Migration 044: `user_feedback`

Creates `public.user_feedback`.

Columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `category text not null`
- `message text not null`
- `page_path text null`
- `created_at timestamptz not null default now()`

Indexes:

- Primary key on `id`
- `user_feedback_user_created_idx` on `(user_id, created_at desc)`

RLS:

- Enables row level security
- Select-own policy: `(select auth.uid()) = user_id`
- Insert-own policy: `(select auth.uid()) = user_id`
- No update/delete policy, intentionally append-only

Application dependency:

- `FeedbackWidget` renders only for signed-in users.
- `submitFeedback()` sanitizes message text and inserts into `user_feedback`.
- `app/admin/page.tsx` reads recent feedback only after authenticated-user and `ADMIN_EMAILS` checks pass, and only if the service-role admin client is configured.

Risk notes:

- No destructive statement.
- No backfill or data scan.
- `category` is free text at the DB layer; the client limits it to `bug`, `idea`, or `other`. A DB `check` constraint would harden this later, but absence does not block the migration.
- Rollback drops feedback records permanently unless exported first.

## Rehearsal Evidence

One disposable Supabase branch was created after explicit hourly-cost confirmation.

Branch identity:

- Name: `sprint15-migration-042-044-rehearsal`
- Ref: `umdpjizroetwblwowcrx`
- Parent: `oshquaxsloolqucwvigc`
- Non-production proof: `is_default=false`, `persistent=false`, `with_data=false`, own API URL `https://umdpjizroetwblwowcrx.supabase.co`

Baseline on the branch before applying 042-044:

- `remote_schema`
- `037_scenario_lab_cases`
- `038_watchlist_geography_linking`
- `039_watchlist_change_events`
- `040_user_entitlements`
- `041_scenario_lab_case_limits`

Applied to the disposable branch only:

- `042_research_copilot_queries`: success; observed MCP wall time 10.98s
- `043_onboarding_preferences`: success; observed MCP wall time 1.12s
- `044_user_feedback`: success; observed MCP wall time 1.36s

Post-apply migration ledger on branch:

- `20260724123953 042_research_copilot_queries`
- `20260724124009 043_onboarding_preferences`
- `20260724124022 044_user_feedback`

Post-apply schema checks:

- All three tables exist with expected columns, nullability, defaults, primary keys, indexes, and `auth.users` cascade FKs.
- RLS enabled on all three tables.
- Policies use optimized `(select auth.uid())` predicates.
- No triggers were created on the three tables.
- No new `public` functions matching copilot/onboarding/feedback were created.
- No lingering locks existed on the new tables after migration completion.
- Row changes from migration itself: zero backfilled rows; branch rows existed only from synthetic RLS probes.

## RLS Probe Evidence

Synthetic branch-local auth rows were created only on the disposable branch for policy probing.

Observed results:

- User A own inserts/selects succeeded across `research_copilot_queries`, `user_feedback`, and `user_onboarding_preferences`.
- User B saw zero User A rows across all three tables.
- User B cross-user insert into `user_feedback` failed with `42501: new row violates row-level security policy`.
- User B update attempt against User A onboarding row did not expose or mutate User A data under RLS.

The disposable branch containing these synthetic rows was deleted after evidence capture.

## Advisor Findings

Supabase security/performance advisors were run on the disposable branch after 042-044.

No advisor finding was attributable to `research_copilot_queries`, `user_onboarding_preferences`, or `user_feedback`.

Pre-existing findings were observed on earlier objects:

- Security: `public.set_updated_at` mutable search path, `public.waitlist` permissive anonymous insert, `public.rls_auto_enable()` executable as `SECURITY DEFINER`, leaked password protection disabled.
- Performance: unindexed FKs and `auth_rls_initplan` policies on existing tables such as portfolio, comparison, report, strategy, watchlist, scenario, entitlement, and notification objects.

Those findings are not introduced by migrations 042-044 and were not modified.

## Compatibility

Current Production app against schema 044:

- Compatible by inspection because 042-044 are additive only: no existing table, column, index, function, policy, or grant is removed or altered.
- The old app branch has no references to `research_copilot_queries`, `user_onboarding_preferences`, `user_feedback`, or `RESEARCH_COPILOT_ENABLED`.

Sprint 15 app against schema 044:

- Compatible by code inspection and tests.
- Existing Preview UAT evidence previously passed against `warehouse-validation`, which already contains 042-044.
- The live UAT rerun on 2026-07-24 failed before auth because `tests/uat/sprint15-preview-browser-uat.mjs` could not prove the Preview public Supabase URL from the currently loaded root chunks. Redacted chunk scanning found no Production Supabase ref and no forbidden secret markers, but the rerun did not satisfy the full authenticated-UAT gate.

## Clean Migration Chain Limitation

A fully local empty-database rebuild from repository migration `001` through `044` could not be executed in this environment because `psql`, Docker, and the Supabase CLI are not installed. The single approved paid resource was a Supabase branch created from the Production baseline, which proves the production-shaped `041 -> 044` upgrade path but is not a blank database replay of `001 -> 044`.

This is a release evidence limitation. It does not indicate that 042-044 failed, but it prevents claiming the full clean-chain rebuild requirement as passed in this session.

## Verdict

Database migration recommendation: **CONDITIONAL GO** for applying migrations 042-044 in a separately approved Production migration window.

Conditions:

- Abdul must explicitly approve the Production database migration.
- Operator must run the pre-flight checks in `production_migration_runbook.md` immediately before execution and stop if Production is not still at 041.
- The full blank `001 -> 044` replay should be run in an environment with `psql`/Supabase CLI/Docker before changing PR #23 out of draft, or the risk must be explicitly accepted.
- Production deployment remains blocked until the current live Preview UAT rerun/config-proof issue is reconciled.
