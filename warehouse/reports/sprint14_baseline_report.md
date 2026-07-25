# Sprint 14 — Baseline Report (Workstream 0)

Verified directly against the repository, GitHub, Vercel, and Supabase —
not against prior reports' claims.

## Branch and commit topology

- New branch: `feature/sprint14-production-readiness`, created from
  `feature/sprint13-private-beta` @ `89f1766` (Sprint 13's final commit).
- `feature/sprint13-private-beta` is 117 commits ahead of the point where
  it diverged from `main`.
- **`main` divergence check (real finding)**: `origin/main` moved since
  Sprint 13 began (`afd6e80` → `18cb4e9`, merging PR #2 "Budget 2026 tax
  modelling for Deal Analyser", commit `ebc6552`). This looked like a
  reconciliation risk at first glance. Verified it is not:
  `git merge-base feature/sprint13-private-beta origin/main` = `ebc6552`
  itself, and `git diff feature/sprint13-private-beta...origin/main`
  (three-dot, "what's unique to main") is **empty** — main has zero
  content beyond what our branch already contains as an ancestor. No
  reconciliation is needed; `ebc6552`'s Budget 2026 tax modules
  (`lib/tax/budget2026*.ts`, 13 tests) are already live in our tree and
  were already passing throughout Sprint 13.
- Several unrelated `cursor/next-steps-process-*` and
  `cursor/design-system-phase1` / `cursor/property-ai-handover-zip-*`
  branches exist on the remote (13+ branches). These appear to be from a
  different automated tool (Cursor) working on this same repo outside
  this session. **Not inspected or touched** — out of scope, flagged for
  awareness only, since Sprint 14's brief doesn't ask for cross-tool
  branch reconciliation and doing so without understanding their intent
  would be reckless.

## Migration inventory

40 migration files, `001_propellect_schema.sql` through
`040_user_entitlements.sql`, all additive (verified by
`warehouse:check`'s destructive-DDL scan on every commit).
Independently confirmed via `mcp__claude_ai_Supabase__list_migrations`
against production (`oshquaxsloolqucwvigc`): only `remote_schema`
(the pre-existing baseline) plus migrations 037-040 are tracked in
`supabase_migrations.schema_migrations` — migrations 002-036 were
applied historically outside the formal tracking table (consistent with
this project's established pattern of manual/dashboard-applied
migrations for the main app schema, confirmed in Sprint 13's final audit).

## Database state — independently verified this pass, not re-quoted

- **Production** (`oshquaxsloolqucwvigc`, matches `NEXT_PUBLIC_SUPABASE_URL`):
  `property_reports`, `watchlist_items` (now with all Sprint 13 additive
  columns), `scenario_lab_cases`, `watchlist_change_events`,
  `notification_preferences`, `user_entitlements` all confirmed present
  via live query. This is the real, live application database backing
  `app.propellect.com.au`.
- **Warehouse-validation branch** (`lzonauinzatmtytyoems`, child of the
  same parent project): 2,679 MB (independently queried via
  `pg_database_size`), holds only warehouse/research schemas
  (`core`, `mart`, `staging`, `meta`, `audit`) — confirmed the main-app
  tables above do **not** exist here; the two databases are genuinely
  separate concerns by design.
- No `DROP`/`TRUNCATE`/destructive statement exists in any of the 40
  migration files (grepped, not assumed).

## Vercel / environment state

- Production env vars: exactly 4 (`ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL`) — unchanged since before Sprint 13, verified
  live this pass.
- Preview env vars scoped to `feature/sprint13-private-beta` only: the 4
  production vars plus 7 research-flag vars added during Sprint 13 WS19
  (`WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`,
  `SCENARIO_LAB_ENABLED`, `PUBLIC_API_V1_ENABLED`,
  `DATA_OPERATIONS_ENABLED`, `WAREHOUSE_SUPABASE_URL`,
  `WAREHOUSE_SUPABASE_ANON_KEY`).
- No production deployment has been promoted (`vercel deploy --prod` was
  never run in this project's history from this session or the prior
  one) — a preview deployment exists at
  `https://property-66z1ujs87-zeebusiness93-2304s-projects.vercel.app`
  (target: preview, Ready), gated behind Vercel team SSO.
- **Preview and Production share the same main-app Supabase project** —
  only the warehouse-specific vars are Preview-scoped. This is
  pre-existing architecture (confirmed, not assumed), and it's exactly
  why Sprint 13's WS21 migration step went to production directly (with
  explicit approval) rather than a separate non-prod database.

## CI status

Green on the final Sprint 13 commit (`89f1766`), `Warehouse Validation`
workflow, verified via `gh run list` this pass.

## Test suite

297/297 passing, re-run this pass, not re-quoted from a prior report.

## Feature flags (current, `lib/warehouse/env.ts`)

`isWarehousePreviewEnabled`, `isMultiStateResearchEnabled`,
`isScenarioLabEnabled`, `isDataOperationsEnabled`,
`isPublicApiV1Enabled` — all boolean, env-driven, default `false`,
unit-tested. Entitlement tiers (`lib/auth/entitlements.ts`) exist as a
schema/matrix but enforce nothing yet — confirmed by reading the code,
not assumed.

## Route inventory (from the last clean build, re-verified)

31 routes total: static marketing/tool pages
(`/`, `/analyse-property`, `/compare-properties`, `/dashboard`,
`/portfolio`, `/watchlist`, `/strategy`, `/suburb-intelligence`), auth
routes, 10 `/api/v1/*` public API routes, 3 internal `/api/research/*`
and `/api/analyse/*` routes, 1 `/api/watchlist/refresh-changes`, 1
`/api/account/entitlements`, and the `/research/*` tree (home, explore,
map, compare, suburb/[code], postcode/[code], scenario/[code],
data-status, sources).

## Known defects / technical debt (honest, not hidden)

1. Next.js's `middleware.ts` convention is deprecated in favour of
   `proxy` (build-time warning, functional but should migrate eventually).
2. 6 pre-existing ESLint warnings (unused vars in test/script files),
   unchanged baseline, never blocking.
3. 3 low-severity dependency vulnerabilities remain unresolved by design
   (fixing them would require a severe regression — see Sprint 13's
   phase 2 security report) — `sharp`/`postcss` (nested, build-time-only)
   and `uuid` via `exceljs`.
4. No AI research assistant exists yet (Sprint 14 WS5's actual target).
5. No onboarding flow exists yet (Sprint 14 WS2's actual target).
6. Entitlement tiers are schema-only, nothing enforces them at any route
   yet (Sprint 14 WS12's actual target).
7. Rate limiting on Sprint 13's newest routes is best-effort/in-memory,
   not distributed.
8. No first-party analytics events are wired beyond Sprint 13's initial
   6 of 8 event types.

## Recommended merge strategy (not executed — decision only)

Given `main` has zero unique content beyond what we already have as an
ancestor, and given the branch's size (117+ commits of incremental,
well-tested work), a **single non-squash merge preserving history** is
safest once a human approves it — squashing 117 commits into one would
destroy the checkpoint-by-checkpoint audit trail that makes this
sprint's work independently verifiable. A staged integration branch is
unnecessary extra ceremony given `main` isn't independently diverging.
**Not executed this pass** — merging to `main` requires your explicit
approval per the standing guardrail, and is out of scope for an
autonomous session regardless.
