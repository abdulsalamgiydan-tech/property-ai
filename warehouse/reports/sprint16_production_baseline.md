# Sprint 16 Production Baseline

Date: 2026-07-25
Scope: read-only Production stabilisation baseline after the Sprint 15.2 core release.

## Repository And Release State

- Local branch: `feature/sprint14-production-readiness`
- Local branch HEAD: `7f764f4e48b6e00b030d0108ceff69b7a6421953`
- PR #23 state: merged
- PR #23 merge commit on `main`: `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`
- Latest `main` CI observed: Warehouse Validation run `30138040564`, success, commit `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`

## Production Deployment

- Production URL: `https://app.propellect.com.au`
- Active Vercel deployment: `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x`
- Vercel target: `production`
- Deployment status: `READY`
- Deployment source branch: `main`
- Deployed commit: `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`
- Project: `property-ai`
- Vercel project id observed: `prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`
- Rollback target retained from release: `dpl_HgpyHuNS49Q51F69ZHfUGFL9mxcw`

## Production Environment Names

Observed Production-scoped Vercel environment variable names only:

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`

Absent from the Production environment name list:

- `ADMIN_EMAILS`
- `RESEARCH_COPILOT_ENABLED`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_API_V1_ENABLED`
- `WAREHOUSE_PREVIEW_ENABLED`
- `MULTI_STATE_RESEARCH_ENABLED`

No values were printed or persisted.

## Feature Gates

- Admin: disabled. `/admin` returned HTTP 404.
- Research Copilot: disabled. `POST /api/research/copilot` returned HTTP 404.
- Research pages: disabled. `/research/map` returned HTTP 404.
- Public API v1: disabled. `/api/v1/search?q=richmond&limit=2` returned HTTP 404.

## Production Database

- Supabase Production project ref: `oshquaxsloolqucwvigc`
- Migration ledger ends at `044_user_feedback`.
- Recent ledger sequence: `042_research_copilot_queries`, `043_onboarding_preferences`, `044_user_feedback`.

Sprint 15 tables:

| Table | Rows | RLS |
| --- | ---: | --- |
| `research_copilot_queries` | 0 | enabled |
| `user_onboarding_preferences` | 0 | enabled |
| `user_feedback` | 0 | enabled |

Observed policies on Sprint 15 tables use owner-scoped `auth.uid()` predicates. `research_copilot_queries` and `user_feedback` expose select-own and insert-own only. `user_onboarding_preferences` exposes select, insert, update, and delete for the owning user.

## Core Table Counts

Read-only count snapshot:

| Table | Rows |
| --- | ---: |
| `notification_preferences` | 0 |
| `portfolio_properties` | 1 |
| `property_comparisons` | 1 |
| `property_reports` | 0 |
| `scenario_lab_cases` | 0 |
| `strategy_generations` | 1 |
| `strategy_reports` | 1 |
| `user_entitlements` | 0 |
| `waitlist` | 2 |
| `watchlist_change_events` | 0 |
| `watchlist_items` | 1 |

This Sprint 16 baseline did not create, update, or delete Production data.

## Database Health Snapshot

- `pg_stat_database.conflicts`: 0
- `pg_stat_database.deadlocks`: 0
- `pg_stat_database.temp_files`: 0
- Visible `auth.audit_log_entries` events in last 24h: 0
- Visible `auth.audit_log_entries` events in last 1h: 0

## Conclusion

Core Production baseline is healthy and fail-closed for disabled optional surfaces. No Production mutation was performed in this phase.
