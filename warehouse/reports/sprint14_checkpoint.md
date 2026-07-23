# Sprint 14 Checkpoint

**Stopping reason**: context/token checkpoint, per the brief's own
token-management instructions — not a blocker, not an error. This
session has now delivered the entirety of Sprint 13 (21 workstreams)
plus all of Sprint 14 Tier 1 and Tier 2 (7 workstreams). Checkpointing
here, at the natural end of the Tier 2 execution-plan boundary, rather
than pushing into Tier 3's higher-risk items (WS5 AI copilot in
particular) without a fresh safety margin.

## Current branch and latest commit

- Branch: `feature/sprint14-production-readiness` (off
  `feature/sprint13-private-beta` @ `89f1766`)
- Latest commit: `afb1cd5` — "feat(warehouse): Sprint 14 Workstream 11 —
  report builder generalization"
- All commits pushed to `origin/feature/sprint14-production-readiness`.
- Working tree: clean.
- CI: green on every commit this session, most recently confirmed on
  `afb1cd5` (run `30003069368`, success).

## Completed workstreams

**Tier 1**
- **WS0 — Baseline, branch, and release architecture**: verified real
  git/CI/Vercel/Supabase state; `main` confirmed to contain zero unique
  content beyond this branch's own ancestry; wrote all 4 required
  reports.
- **WS16 — Security and privacy hardening**: found and fixed a real
  gap — zero security headers existed anywhere in the app. Added a
  scoped CSP + 4 other headers, live browser-verified. Added the first
  per-route bound-enforcement tests for `/api/v1/compare` and
  `/api/v1/search`. 14 new tests.
- **WS12 — Subscription and entitlement enforcement**: fixed a real bug
  (`saved_scenarios` mistier-gated). Built unbypassable server-side
  enforcement via a new additive database trigger (migration 041,
  per-tier volume caps). **Applied to production with explicit user
  approval**, independently re-verified live. 14 new tests.

**Tier 2 (completed this session, all CI-green)**
- **WS9 — Watchlist and change intelligence v2**: added transaction-
  volume-movement detection (a metric that was captured but never
  diffed) and a provider-neutral, dry-run-only digest preview (no real
  email/push wired — explicit guardrail compliance). Added a manual
  "Check now" refresh button. 9 new tests. Commit `3a38999`.
- **WS6 — Property analysis v2**: added a rate/vacancy stress-test tab
  to the Deal Analyser — re-runs the existing, unmodified
  `analyzeProperty()` model under a small shock grid (rate +1/+2/+3%,
  vacancy +5pp, combined) with zero new financial-calculation logic of
  its own. 6 new tests. Commit `4c76a34`.
- **WS7 — Scenario Lab v2 extensions**: added a sixth scenario
  dimension, accelerated/extra loan repayments, via a new iterative
  pure function (`calculateLoanBalanceWithExtraRepayments`,
  cross-checked against the existing closed-form function at zero extra
  repayment). New "+$X extra equity by year N" comparison line. 5 new
  tests. Commit `4927e56`.
- **WS11 — Report builder generalization**: made the Sprint 13 research-
  report bundle's `area` input optional and added a `propertyAnalysis`
  section, so the same bundle/CSV/JSON/print builder now serves the
  Deal Analyser (which has no linked warehouse geography) as well as
  the Scenario Lab. Wired `ResearchReportExportButtons` into
  `AnalysePropertyClient.tsx` for the first time. 6 new tests. Commit
  `afb1cd5`.

## In-progress workstream

None — WS11 was finished cleanly, tested, built, committed, pushed, and
confirmed CI-green before this checkpoint. No partial work exists.

## Remaining workstreams (Tier 3, 4 — see `sprint14_execution_plan.md`)

**Tier 3** (next up): WS5 (AI research copilot — deterministic evidence
layer first, no new paid provider), WS2 (onboarding), WS3/WS4
(discovery v2 / area-intelligence v2 polish).

**Tier 4**: WS13 (refresh engine v4), WS14 (data-quality monitoring),
WS15 (ops console v2), WS17 (performance), WS18 (accessibility), WS19
(analytics), WS20 (beta admin), WS21 (feedback), WS22 (legal copy).

**Always last**: WS23 (release engineering), WS24 (UAT pack), WS25
(final independent audit) — written against whatever subset actually
ships, not the brief's full aspirational list.

## Exact current state

- Tests: 350/350 passing (grew from 325 at the last checkpoint, 297 at
  the end of Sprint 13).
- Lint: 0 errors on every file touched this session (6 pre-existing
  warnings elsewhere in the repo, unchanged baseline).
- Build: passes.
- `warehouse:check` / `warehouse:rls:check`: both pass, 10 tables
  verified (run most recently before the WS9 commit; no schema changes
  since, so still current).
- CI: green on every commit this session.

## Database state (independently verified this session, not re-quoted)

- Production (`oshquaxsloolqucwvigc`): migrations through 041 (unchanged
  since the last checkpoint — Tier 2 added zero new migrations by
  design; every Tier 2 workstream was scoped to stay application-layer
  only).
- Warehouse-validation branch (`lzonauinzatmtytyoems`): unchanged this
  session.
- Preview Vercel env vars: unchanged — still scoped to
  `feature/sprint13-private-beta` only, not the Sprint 14 branch (same
  note as the last checkpoint: adding a Sprint 14 preview would need
  the same 7 vars added to this branch's Preview scope, with the same
  approval gate).
- Production Vercel env vars: untouched (4 original vars only).

## Production safety verification

- No `vercel deploy --prod` run this session.
- No merge to `main`.
- No production database changes since migration 041 (applied and
  reported in the prior checkpoint) — Tier 2 was entirely
  application-layer.
- No paid infrastructure, billing, email/SMS, or new third-party service
  added or activated.

## Known issues (honest, not hidden)

- Carried from the last checkpoint, still true: 3 pre-existing
  dependency vulnerabilities remain unforced; no proactive
  saved-scenario usage counter (only reactive limit-reached messaging);
  no admin UI to grant tiers; Sprint 14 branch has no Preview
  deployment.
- New this checkpoint:
  - WS9's digest preview covers watchlist change events only — saved
    Scenario Lab assumption drift and previously-analysed property
    input drift are explicitly not monitored (documented in the WS9
    report as deferred, not silently dropped).
  - WS7's "extra repayments" scenario field is not yet reflected in the
    exported CSV/JSON report (`ReportScenarioCase` doesn't carry it) —
    saved `scenario_json` does capture it, only the human-readable
    export is affected.
  - WS11's report builder generalization has no true multi-section
    custom-report UI and no export path from `/compare-properties` —
    scoped deliberately to reusing the existing bundle for two tools,
    not building a new report system.

## Exact next action

Resume with Tier 3, starting with **WS5 (AI research copilot)** per
`sprint14_execution_plan.md` — the brief is explicit that this must
start with a deterministic evidence/retrieval layer and use only an
already-configured provider, never activate a new paid one. This is the
highest-risk remaining item (new UI surface, new query/retrieval logic
over warehouse data) so it deserves a fresh context/attention budget
rather than being started at the tail of an already-long session.

## Exact resume prompt

> Continue Sprint 14 from the checkpoint at commit afb1cd5 on branch
> feature/sprint14-production-readiness. Read
> warehouse/reports/sprint14_checkpoint.md and
> warehouse/reports/sprint14_execution_plan.md first, verify the
> repository/CI/database state independently (don't trust this
> checkpoint blindly), then resume with Tier 3 Workstream 5 (AI research
> copilot — deterministic evidence layer first, no new paid provider)
> and continue through the remaining tiers autonomously, checkpointing
> again per the same token-management discipline if needed.

## On the "1:10 AM scheduled restart" instruction

Unchanged from the last checkpoint: this session runs as a background
job without a persistent scheduler/loop attached for this conversation.
No scheduled restart is claimed. This checkpoint and the exact resume
prompt above remain the real mechanism for continuing.
