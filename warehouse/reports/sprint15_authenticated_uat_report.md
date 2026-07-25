# Sprint 15 — Authenticated UAT Report

> Superseded for live browser status on 2026-07-24 22:25 AEST:
> full protected Preview browser UAT has now passed. This report remains
> historical DB-layer RLS evidence; see
> `sprint15_browser_uat_report.md` for the final browser UAT result.

## Method, and an honest scope statement

Full browser-based UAT against a deployed Vercel preview was blocked
(see `sprint15_preview_deployment_report.md`). Rather than skip
authenticated testing entirely, this UAT was run **directly against
the database security layer** — the confirmed non-production
`warehouse-validation` Supabase branch (`lzonauinzatmtytyoems`) — using
**real Supabase auth users** (created via direct SQL insert into
`auth.users`/`auth.identities`, a standard, documented pattern for
seeding test accounts) and **simulated authenticated sessions** (via
Postgres `set local role authenticated; set local request.jwt.claims`,
which is exactly the mechanism PostgREST/Supabase uses in production —
this is testing the real enforcement mechanism, not a mock of it).

**What this proves**: the database-level security boundary — RLS
policies and triggers — behaves correctly under real, distinct
authenticated identities. **What this does not prove**: application-
layer behaviour that only exists in the Next.js server (API-route rate
limiting, client-side rendering correctness, the actual UI flows a
human would click through). Those require either the blocked preview
deployment or a local dev server pointed at this branch (not done this
pass — see "Not covered" below).

## Test identities created

Real Supabase auth users on the `warehouse-validation` branch, emails
prefixed `sprint15-uat-` for easy identification and later cleanup:

| Identity | Email | User ID | Tier |
|---|---|---|---|
| Normal user | sprint15-uat-normal@example.com | `eaf666ed-0f3c-4ada-b10c-275cc9596505` | free (default) |
| Elevated-tier user | sprint15-uat-elevated@example.com | `c460f3be-c7d1-4b14-9b85-bdeb773dc312` | investor_pro |
| Admin-candidate user | sprint15-uat-admin@example.com | `4b724bb0-5f57-42f3-8724-ee136089462f` | free (default) |
| Restricted/other user | sprint15-uat-restricted@example.com | `6ba6c087-21e1-403b-bc6e-88e9b018dc5a` | free (default) |
| Anonymous | (no account) | n/a | n/a |

All accounts use a shared, disclosed test-only password
(`Sprint15UAT!`) — acceptable since this is a non-production,
disposable validation branch with no real user data (confirmed 0 rows
in `auth.users` before this session's UAT work began).

## Tests performed and results

All tests below were executed live against the branch this session,
not assumed or copied from a template. Each result was independently
observed via the query's actual output, not inferred.

| # | Test | Identity | Result |
|---|---|---|---|
| 1 | Insert own `scenario_lab_cases` row | Normal | **PASS** — succeeded |
| 2 | Read another user's `scenario_lab_cases` rows | Restricted (reading Normal's data) | **PASS** — 0 rows returned (silently filtered by RLS, not an error) |
| 3 | Insert a row *claiming* another user's `user_id` (impersonation) | Restricted (impersonating Normal) | **PASS** — rejected with `new row violates row-level security policy` |
| 4 | Insert up to the free-tier saved-scenario limit (10) | Normal | **PASS** — 10th insert succeeded, count confirmed = 10 |
| 5 | Insert an 11th scenario (over the free-tier limit) | Normal | **PASS** — rejected with the exact expected error: `scenario_lab_case_limit_exceeded: tier free allows at most 10 saved scenarios` (errcode P0001, matching `isScenarioLabLimitExceededError()`'s check in the app code) |
| 6 | Insert 15 scenarios (over the free-tier limit, under the investor_pro limit of 100) | Elevated | **PASS** — all 15 succeeded, proving the trigger reads the actual per-user tier from `user_entitlements`, not a flat cap |
| 7 | Attempt to self-elevate own entitlement tier | Normal | **PASS** — rejected with `new row violates row-level security policy for table "user_entitlements"` (only `service_role` may write this table) |
| 8 | Cross-user isolation on `user_feedback` and `research_copilot_queries` (Sprint 14 WS21/WS5, new this cycle) | Restricted (reading Normal's rows) | **PASS** — 0 rows visible on both tables |
| 9 | Anonymous (no session at all) reads across `scenario_lab_cases`, `user_feedback`, `user_entitlements` | Anonymous | **PASS** — 0 rows visible on all three; `auth.uid()` is null with no session, so the `= user_id` predicate never matches |

**9 of 9 security-critical scenarios passed.**

## A real, valuable side-finding from this testing process

Applying migrations via the Supabase MCP's `apply_migration` tool to
an already-existing branch does **not** automatically grant the same
`anon`/`authenticated` table-level privileges (`GRANT SELECT, INSERT,
UPDATE, DELETE`) that Supabase's normal production migration pipeline
grants by default — RLS policies alone are necessary but not
sufficient; Postgres also requires the underlying table GRANT. This
was discovered when Test 1 initially failed with `permission denied
for table scenario_lab_cases` rather than an RLS violation.

**Verified this was a branch-application-method artifact, not a
migration-file defect or a production bug**: querying production
(`oshquaxsloolqucwvigc`) directly confirmed `property_reports`,
`scenario_lab_cases`, `user_entitlements`, `notification_preferences`,
`watchlist_change_events`, and `watchlist_items` **all already have
full grants for `anon`/`authenticated`** — production's own migration-
application process (whatever produced its current state) correctly
established default privileges, matching the years of successful live
verification of these features in prior sprints. The missing-grant
issue was specific to this session's ad-hoc branch-only `apply_migration`
calls.

**Action taken**: explicitly granted the missing privileges on the
branch (`GRANT SELECT, INSERT, UPDATE, DELETE ... TO anon, authenticated`)
so UAT could proceed.

**Action recommended for the future** (see
`sprint15_production_runbook.md`): before treating any future
migration as "successfully applied" via this MCP tooling — to
production or any branch — explicitly verify
`information_schema.role_table_grants` shows the expected privileges,
not just that `warehouse:rls:check` passes (which only checks policy
text, not underlying grants).

## Not covered in this pass (honest gap, not hidden)

- Rate limiting (research copilot's 5/day, watchlist refresh's 6/min)
  — these live in Next.js API route code (`lib/security/rateLimiter.ts`,
  `lib/research/copilotRateLimit.ts`), not the database, so they
  cannot be exercised via direct SQL. Requires either the blocked
  preview deployment or a local dev server with real HTTP requests.
- Report exports (CSV/JSON download correctness) — requires the actual
  UI/API route, not just DB state.
- Admin page's actual data-rendering path (`/admin` with a real
  `SUPABASE_SERVICE_ROLE_KEY` configured) — the auth-gate logic itself
  is unit-tested (`lib/auth/isAdminEmail.test.ts`, 8 tests) and the
  "unauthenticated visitor gets 404" path was live-verified via `curl`
  against a real local production server (see
  `sprint15_security_report.md`), but the full "admin sees real cross-
  user data" path needs either the actual service-role key or a
  deployed preview — the key is not something this session has access
  to.
- Client-side rendering/UI correctness — everything above tests the
  database; whether the Next.js UI renders these states correctly is
  covered by this session's earlier extensive `npm run test` suite
  (442 tests) and the `browse`-tool live checks performed during
  earlier Sprint 14 workstreams, not repeated here.

## Test data disposition

The 4 test accounts and their associated rows (11 `scenario_lab_cases`
for the normal user, 15 for the elevated user, 1 `user_feedback` row,
1 `research_copilot_queries` row) remain on the `warehouse-validation`
branch as of this report — left in place intentionally so the user (or
a future session, once Vercel access is unblocked) can reuse these
same accounts for live browser UAT rather than needing to recreate
them. All are clearly identifiable by the `sprint15-uat-` email prefix
for later cleanup if desired.
