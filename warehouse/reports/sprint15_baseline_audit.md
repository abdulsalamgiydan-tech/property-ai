# Sprint 15 — Baseline Audit

Independent re-verification of every Sprint 14 claim, run fresh this
session, not re-quoted from prior reports.

## Repository state

- Branch: `feature/sprint14-production-readiness`.
- Latest commit at time of this audit: `b854284` — "fix(warehouse):
  Sprint 15 — fix RLS auth.uid() InitPlan perf issue in migrations
  042/043/044" (see `sprint15_migration_validation.md`).
- Working tree: clean.
- CI: green on every commit checked (`gh run list`, confirmed live,
  not assumed).

## Fresh check-suite results

| Check | Result |
|---|---|
| `npm run lint` | 0 errors, 6 pre-existing warnings (unchanged baseline) |
| `npm run test` | 420/420 passing |
| `npm run build` | passes |
| `npm run warehouse:check` | passes |
| `npm run warehouse:rls:check` | passes (now covers the InitPlan-optimised RLS form too) |
| `npm audit` | 5 vulnerabilities (3 high, 2 moderate), all pre-existing (`sharp`/`libvips`, `uuid` via `exceljs`), unchanged — force-fixing requires breaking major-version upgrades |

## Database reconciliation — a real correction to a standing claim

Sprint 13/14 reports repeatedly stated: **"there is no safe non-
production branch for the main app's Supabase project."** This claim
was checked directly this session via the Supabase MCP tools
(`list_projects`, `list_branches`) rather than re-quoted, and found to
be **incomplete, not simply true**:

- `list_projects` confirms exactly one relevant Supabase project:
  `oshquaxsloolqucwvigc` (production). A second project in the same
  organization, `nmburuqjypcalqeegaae`, belongs to a different account
  (`zee.business93@gmail.com`) and is unrelated to this app.
- `list_branches` on `oshquaxsloolqucwvigc` returns **two branches**:
  `main` (the default, persistent branch — this is production) and
  `warehouse-validation` (project_ref `lzonauinzatmtytyoems`,
  `is_default: false`, `preview_project_status: ACTIVE_HEALTHY`).
- **The warehouse-validation branch IS a genuine Supabase branch of the
  production project** — not a separate, unrelated database as
  previously described. Confirmed it already carries the main app's
  public schema (`property_reports`, `watchlist_items`,
  `strategy_reports`, etc., all with RLS enabled) and has `auth.users`
  provisioned (0 rows — no real user data).
- It is, however, **schema-stale**: missing tables from migrations
  037-041 (`scenario_lab_cases`, `watchlist_change_events`,
  `notification_preferences`, `user_entitlements`) — it was branched
  before those migrations existed and Supabase branches do not auto-
  sync with their parent's later migrations.

**Reconciliation**: the original claim conflated "no non-production
branch has been kept in sync with every migration" with "no non-
production branch exists at all." The second claim was wrong. This
branch is real, already provisioned (no new cost to use it), and was
used this session as the target for validating migrations 042/043/044
(see `sprint15_migration_validation.md`) — a genuinely safer path than
either skipping validation or creating a brand-new paid branch.

## Environment-variable reconciliation

Consolidating every env var referenced across Sprint 14's reports into
one authoritative table, each entry verified directly against the code
(not re-quoted):

| Var | Read by | Verified default when unset | Mechanism |
|---|---|---|---|
| `RESEARCH_COPILOT_ENABLED` | `lib/warehouse/env.ts:isResearchCopilotEnabled()` | `false` — strict `=== "true"` check, confirmed by reading the function body and its 3 existing tests | Boolean feature flag |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/adminClient.ts:createAdminSupabaseClient()` | Function returns `null` (not a throwing client) when unset, confirmed by reading the function body | Raw credential, no wrapper flag function |
| `ADMIN_EMAILS` | `lib/auth/isAdminEmail.ts:isAdminEmail()` | `false` (nobody is admin) for empty/unset — confirmed by reading the function body and its 8 tests, including an explicit no-substring-matching test | Comma-separated allowlist, parsed explicitly (`.split(",").map(trim/lowercase).filter(Boolean)`) — not a regex or wildcard match |

All three are confirmed **absent** from `.env.local` (checked variable
names only, not values, to avoid printing secrets) and were never
present in any Vercel environment for this project as of Sprint 14.

**The inconsistency**: Sprint 14's `sprint14_ws23_release_runbook.md`
"Step 3 — feature flags to enable" table listed only
`RESEARCH_COPILOT_ENABLED`, while `SUPABASE_SERVICE_ROLE_KEY` and
`ADMIN_EMAILS` were covered separately in "Step 2" using different
language ("env vars," not "feature flags"). Read together without
context, this could imply `RESEARCH_COPILOT_ENABLED` is the only
pending env-var decision, when in fact there are two independent,
mechanically-different pending decisions:
1. A **boolean flag function** (`RESEARCH_COPILOT_ENABLED`) — same
   pattern as every other feature flag in this codebase
   (`WAREHOUSE_PREVIEW_ENABLED`, `SCENARIO_LAB_ENABLED`, etc.).
2. A **raw-credential-plus-allowlist pair**
   (`SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_EMAILS`) that must both be set
   together for `/admin` to show any data — a different, higher-
   privilege mechanism than every other flag in the codebase.

This table is the reconciliation: one place, both categories stated
explicitly, each claim independently verified against the actual
function bodies rather than re-quoted from a prior report.

## Vercel / deployment state

- No Preview deployment exists yet for
  `feature/sprint14-production-readiness` (confirmed — see
  `sprint15_preview_deployment_report.md` for the deployment performed
  this session).
- Vercel CLI is not installed in this environment (confirmed via the
  session's own tooling notices) — preview deployment this sprint uses
  the Vercel MCP tools instead (`mcp__claude_ai_Vercel__*`).

## Production safety confirmed unchanged

- No merge to `main` this session (prior to this audit).
- No production Vercel deployment this session.
- No write to the production Supabase project (`oshquaxsloolqucwvigc`
  main branch) this session — all migration work happened on the
  confirmed-non-production `warehouse-validation` branch
  (`lzonauinzatmtytyoems`).
