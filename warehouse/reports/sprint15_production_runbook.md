# Sprint 15 — Production Runbook

Supersedes `sprint14_ws23_release_runbook.md` with everything verified
this sprint. Still a manual, human-approved runbook — no step here
executes anything automatically, and every production-touching action
requires the same explicit approval this project has required all
along.

## Current state (as of commit `0a95a85`)

- Branch: `feature/sprint14-production-readiness`, CI green throughout.
- 442/442 tests passing, 0 lint errors, clean build.
- Production database: migrations through 041 only. 042/043/044
  written, RLS/security/performance-verified against a real non-
  production branch (with a real fix applied — see
  `sprint15_migration_validation.md`), **not yet applied to production**.
- No merge to `main`. No production deploy.

## Step 1 — Apply migrations 042, 043, 044 to production

Each migration independently, in order, with the **corrected** SQL
(the `(select auth.uid())` InitPlan fix from this sprint, not the
original Sprint 14 text):

1. Apply via whichever mechanism was used for migration 041 (confirm
   this first — see the pre-flight check below).
2. **Pre-flight/post-flight check, new this sprint**: after applying,
   explicitly query
   `information_schema.role_table_grants` for the new table and
   confirm `anon`/`authenticated` have `SELECT, INSERT, UPDATE, DELETE`
   (or the subset the table's design calls for — e.g.
   `research_copilot_queries` and `user_feedback` are select+insert
   only by design). Do not rely on `warehouse:rls:check` alone — it
   only verifies policy text, not the underlying grants. This check
   exists because this sprint found that applying a migration via the
   Supabase MCP `apply_migration` tool to an *existing* branch does
   not automatically establish these grants, even though policies
   apply correctly — see `sprint15_authenticated_uat_report.md`'s
   side-finding. Production's existing tables all have correct grants
   today; this check exists to make sure that stays true after 042/043/044.
3. Re-run `get_advisors` (security) against production after each
   migration — same pattern as migration 041.

## Step 2 — Configure `RESEARCH_COPILOT_ENABLED` (optional, independent decision)

Requires migration 042 to already be applied (Step 1). Set
`RESEARCH_COPILOT_ENABLED=true` in the relevant Vercel environment.
Fails safe if set without the migration (route returns 404, per
`countRecentQueries()`'s "treat a missing table as no-op" design) —
but there is no reason to enable the flag before the migration exists.

## Step 3 — Configure the admin page (optional, independent decision, higher-risk)

Requires **both**:
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Settings →
  API → `service_role` key. **Read `sprint15_security_report.md`
  section 5 before setting this** — it is a full-RLS-bypass credential.
  Must never be prefixed `NEXT_PUBLIC_`.
- `ADMIN_EMAILS` — comma-separated, set to the fewest real addresses
  necessary.

Neither alone enables anything — `/admin` stays a 404 until both are
present.

## Step 4 — Preview deployment

Blocked this session — see `sprint15_preview_deployment_report.md`.
Once Vercel access exists, mirror Sprint 13 WS19's pattern: add the
Preview-scoped env vars for this branch via `vercel env add <NAME>
preview feature/sprint14-production-readiness --value <value> --yes
--non-interactive`, then trigger a Preview deployment.

## Step 5 — Full browser UAT against the live preview

Once Step 4 completes, run through
`sprint14_ws24_uat_pack.md`'s scenario list end to end against the
real deployed URL — the DB-layer UAT this sprint performed (see
`sprint15_authenticated_uat_report.md`) proves the security boundary
but not application-layer behaviour (rate limiting, exports, UI
rendering). The 4 test accounts created this sprint
(`sprint15-uat-*@example.com`, password `Sprint15UAT!`, on the
`warehouse-validation` branch) can be reused if the preview is pointed
at that branch, or fresh accounts created against whatever the preview
actually targets.

## Step 6 — Merge to `main`

Only after Steps 1-5 are resolved to the user's satisfaction (not all
strictly required before merging — see "Decisions are independent"
below). Standard PR flow. This session opens a **draft** PR (see
`sprint15_go_no_go.md`) — merging remains a separate, later, explicit
action.

## Step 7 — Production deploy

`vercel deploy --prod` or whatever the project's normal deploy trigger
is. Never run without explicit, in-the-moment approval.

## Decisions are independent, not sequential-only

Steps 1-3 can happen in any order relative to each other (each fails
safe independently). Step 4 (preview) doesn't require Steps 1-3 to
have happened in production — Preview and Production are separate
Vercel environments with separate env var scopes. The only hard
ordering constraints: Step 2 needs Step 1's migration 042 already
applied (wherever it's applied — production or otherwise); Step 5
needs Step 4; Step 7 should not happen before the user has reviewed
whatever subset of Steps 1-6 they've chosen to complete.

## Rollback

See `sprint15_rollback_runbook.md`.
