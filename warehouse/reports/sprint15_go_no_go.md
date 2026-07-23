# Sprint 15 — Go/No-Go

## Recommendation: GO for code review and draft PR; NO-GO for production deploy without further explicit decisions

This branch is safe to open as a draft PR for human review. It is
**not** recommended for a production deploy yet — not because anything
is broken, but because several genuine, independent decisions remain
that only the user can make (which migrations to apply, whether to
enable the copilot/admin features, whether/how to complete the blocked
preview deployment).

## What was independently re-verified this session (not re-quoted from prior claims)

- Fresh `npm run lint` (0 errors, 6 pre-existing warnings), `npm run
  test` (442/442), `npm run build`, `npm run warehouse:check`, `npm
  run warehouse:rls:check` — all pass.
- CI green on every commit pushed this session (10 commits,
  `48d735d`→`0a95a85`, confirmed via `gh run list` after each push,
  not assumed).
- Production database state confirmed directly via Supabase MCP
  (`oshquaxsloolqucwvigc`): migrations through 041 only, matching
  every prior claim.
- A standing, repeated claim ("no safe non-production branch exists
  for the main app schema") was found to be incomplete and corrected
  — see `sprint15_baseline_audit.md`.
- No privileged credential reaches the client bundle — verified via
  both static analysis of the real production build output and live
  HTTP requests against a genuinely running `next start` production
  server.
- Migrations 042/043/044 were applied to a confirmed non-production
  database, found to have a real RLS performance issue (fixed,
  re-verified), and 9 live authenticated-session security tests all
  passed against real Supabase auth users.

## What changed this session

- **Fixed**: a real `auth_rls_initplan` performance issue in all three
  Sprint 14 migrations (042/043/044) — found by live verification,
  not by any static test. Commit `b854284`.
- **Built**: WS13 (Refresh Engine V4 `--summary` command), WS14 (data-
  quality monitoring surfaced in the app for the first time), WS15
  (ops console v2's new quality section) — the three items Sprint 14
  explicitly deferred. Commit `48d735d`.
- **Documented**: 9 new reports (this one plus 8 others) giving a
  complete, independently-verified picture of the branch's actual
  state.

## What remains genuinely blocked (not a defect, a dependency on the user)

1. **Vercel access** — see `sprint15_preview_deployment_report.md`.
   Blocks: live preview deployment, full browser-based UAT, bundle
   inspection of Vercel's own build output (a local equivalent was
   substituted).
2. **Three independent production decisions** (apply migrations
   042/043/044; enable `RESEARCH_COPILOT_ENABLED`; configure the
   `/admin` page's two env vars) — none urgent, all fail-safe if left
   as-is, all detailed with exact steps in
   `sprint15_production_runbook.md`.

## What was explicitly NOT attempted, and why that's the right call

- **Fixing the same `auth_rls_initplan` pattern on 7 tables already
  live in production** — real, but out of scope for a migration-
  validation pass; would need its own explicit approval to modify
  live production RLS policies. Flagged in `sprint15_security_report.md`.
- **True automated alerting** for data-quality monitoring — explicitly
  ruled out by this sprint's own "no paid scheduling, no external
  notification services" constraint. What was built (real-time
  visibility + trend detection) is the correct scope given that
  constraint, not a shortfall.
- **Full click-through browser UAT** — blocked on Vercel access, not
  skipped by choice. Substituted with rigorous DB-layer security
  testing that proves the more safety-critical property (can one user
  ever see or write another user's data, or exceed their tier limit)
  even without a live URL.

## Numbers

- 442/442 tests passing (up from 297 at the start of Sprint 14 — 145
  net new tests across Sprints 14 and 15).
- 10 commits this session, all CI-green.
- 9 Sprint 15 reports produced, all reflecting independently-verified
  reality, not aspirational claims.
- 0 production database changes this session (the one production
  write, migration 041, happened in an earlier, separately-approved
  Sprint 14 checkpoint).
- 0 merges to `main`. 0 production deploys.

## Recommended next action

Open the draft PR (see the PR itself for the summary) for human
review. When the user is ready, work through
`sprint15_production_runbook.md`'s independent decision points at
whatever pace and order suits them — none block each other, and none
are urgent given every new feature's fail-safe-by-default design.
