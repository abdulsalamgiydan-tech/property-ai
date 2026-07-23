# Sprint 14 Checkpoint

**Stopping reason**: context/token checkpoint, per the brief's own
token-management instructions. This session has now delivered the
entirety of Sprint 13 (21 workstreams) plus all of Sprint 14 Tier 1
(3 workstreams), Tier 2 (4 workstreams), and the two riskiest Tier 3
items (WS5, WS2). Checkpointing here rather than pushing into the
remaining, lower-priority Tier 3 polish items without a fresh margin.

## Current branch and latest commit

- Branch: `feature/sprint14-production-readiness` (off
  `feature/sprint13-private-beta` @ `89f1766`)
- Latest commit: `2a6e991` — "feat(warehouse): Sprint 14 Workstream 2 —
  onboarding"
- All commits pushed to `origin/feature/sprint14-production-readiness`.
- Working tree: clean.
- CI: green on every commit this session, most recently confirmed on
  `2a6e991` (run `30011607173`, success).

## Completed workstreams

**Tier 1**: WS0 (baseline), WS16 (security headers + route bound
tests), WS12 (entitlement enforcement via migration 041, applied to
production with approval).

**Tier 2** (all CI-green): WS9 (watchlist/change intelligence v2 —
transaction volume tracking, digest preview), WS6 (property analysis v2
— rate/vacancy stress test), WS7 (Scenario Lab v2 — accelerated
repayments), WS11 (report builder generalization).

**Tier 3 (this session, both CI-green)**
- **WS5 — Grounded AI research copilot**: the highest-risk remaining
  item. Deterministic evidence layer (`lib/research/copilotEvidence.ts`,
  8 tests) and a code-level grounding checker
  (`lib/research/copilotGrounding.ts`, 10 tests, caught and fixed a
  real regex bug) built and tested BEFORE any LLM call, per the
  brief's explicit instruction. Reuses the existing production
  `ANTHROPIC_API_KEY` (already live for `/strategy`) — no new paid
  provider activated. The load-bearing security property (evidence is
  always re-fetched server-side from `geographyCode`, never accepted
  from the client) is verified by an explicit test. Feature is
  deliberately OFF in production: `RESEARCH_COPILOT_ENABLED` is unset,
  and its rate-limit/audit migration (042) is written and statically
  verified but **not applied**. 39 new tests. Commit `7977346`.
- **WS2 — Onboarding**: a short, always-skippable, one-time step after
  first sign-in (goal + states of interest, both optional). Wired into
  `/auth/complete`'s existing redirect flow. Migration 043 (new table)
  written and statically verified but **not applied** — the client
  fails open (treats a missing table as "already completed") so this
  is safe either way. **Live-verified via the browse tool against the
  dev server** (not just unit tests) — this caught and led to fixing a
  real bug: "Skip for now" fell through to `/` instead of `/dashboard`
  when no `next` param was present, because `safeInternalNextPath(null)`
  returns the truthy string `"/"`, defeating a `|| "/dashboard"`
  fallback. 6 new tests. Commit `2a6e991`.

## In-progress workstream

None — WS2 was finished cleanly, tested, built, live-verified,
committed, pushed, and confirmed CI-green before this checkpoint. No
partial work exists.

## Remaining workstreams (Tier 3 remainder, Tier 4 — see `sprint14_execution_plan.md`)

**Tier 3 remainder**: WS3/WS4 (discovery v2 / area-intelligence v2
polish) — explicitly the lowest-priority Tier 3 item per the execution
plan ("largely incremental UI polish over Sprint 9-13's already-
substantial research platform").

**Tier 4**: WS13 (refresh engine v4), WS14 (data-quality monitoring),
WS15 (ops console v2), WS17 (performance), WS18 (accessibility), WS19
(analytics), WS20 (beta admin), WS21 (feedback), WS22 (legal copy).

**Always last**: WS23 (release engineering), WS24 (UAT pack), WS25
(final independent audit) — written against whatever subset actually
ships, not the brief's full aspirational list.

## Exact current state

- Tests: 396/396 passing (grew from 350 at the last checkpoint, 297 at
  the end of Sprint 13).
- Lint: 0 errors on every file touched this session (6 pre-existing
  warnings elsewhere in the repo, unchanged baseline).
- Build: passes; all new routes (`/api/research/copilot`,
  `/research/copilot/[geographyCode]`, `/onboarding`) confirmed present
  in build output.
- `warehouse:check` / `warehouse:rls:check`: both pass — the RLS
  checker now covers `research_copilot_queries` and
  `user_onboarding_preferences` in addition to every table from before.
- CI: green on every commit this session.

## Database state (independently verified this session, not re-quoted)

- Production (`oshquaxsloolqucwvigc`): migrations through 041 only —
  **unchanged since the last checkpoint**. Migrations 042
  (`research_copilot_queries`) and 043 (`user_onboarding_preferences`)
  are written, statically verified, and RLS-checker-covered, but **NOT
  applied to production** — both features they back
  (`RESEARCH_COPILOT_ENABLED`, and the onboarding flow) are designed to
  fail safe/open if their migration isn't applied, so this is
  intentional, not an oversight requiring urgent follow-up. Applying
  either requires the same explicit approval as migration 041.
- Warehouse-validation branch (`lzonauinzatmtytyoems`): unchanged this
  session.
- Preview Vercel env vars: unchanged — still scoped to
  `feature/sprint13-private-beta` only.
- Production Vercel env vars: untouched (4 original vars only,
  including the pre-existing `ANTHROPIC_API_KEY` that WS5 reused).

## Production safety verification

- No `vercel deploy --prod` run this session.
- No merge to `main`.
- No production database changes since migration 041 (applied and
  reported in an earlier checkpoint this sprint) — everything since
  then, including both new migrations this pass, has stayed either
  application-layer or written-but-unapplied.
- No paid infrastructure, billing, email/SMS, or new third-party
  service added or activated. WS5 explicitly reuses an existing
  provider rather than adding one.
- `RESEARCH_COPILOT_ENABLED` unset in production — the copilot feature
  is fully inert (both API route and page 404) until explicitly turned
  on.

## Known issues (honest, not hidden)

- Carried from the last checkpoint: 3 pre-existing dependency
  vulnerabilities unforced; no proactive saved-scenario usage counter;
  no admin UI to grant tiers; Sprint 14 branch has no Preview
  deployment; WS9's digest preview covers watchlist events only; WS7's
  extra-repayments field isn't in the exported CSV; WS11's report
  builder has no custom-section UI.
- New this checkpoint:
  - WS5's research copilot is fully built and tested but genuinely not
    usable in production yet — turning it on requires two separate
    explicit actions (the `RESEARCH_COPILOT_ENABLED` flag, and applying
    migration 042), neither done in this pass. Its grounding check is
    numeric-claims-only (documented limitation) — it cannot catch a
    fabricated qualitative claim with no attached number.
  - WS2's onboarding preferences (goal, states of interest) are
    collected but not yet read anywhere else in the app — no
    personalised defaults are wired up from them yet. That's the
    natural next step, not attempted this pass to keep the workstream
    bounded.
  - Two migrations (042, 043) are now queued for a future explicit
    apply-to-production decision, in addition to the general
    known-issue that there's no safe non-production branch for the
    main app schema (every schema change requires this same
    write-now/apply-later-with-approval pattern).

## Exact next action

Resume with the remaining Tier 3 item, **WS3/WS4 (discovery v2 / area-
intelligence v2 polish)**, per `sprint14_execution_plan.md` — explicitly
the lowest-priority, lowest-risk item left in Tier 3. After that,
proceed into Tier 4 in whatever order remains feasible, documenting
honestly what doesn't get reached, per the execution plan's own stated
approach.

## Exact resume prompt

> Continue Sprint 14 from the checkpoint at commit 2a6e991 on branch
> feature/sprint14-production-readiness. Read
> warehouse/reports/sprint14_checkpoint.md and
> warehouse/reports/sprint14_execution_plan.md first, verify the
> repository/CI/database state independently (don't trust this
> checkpoint blindly), then resume with the remaining Tier 3 item
> (WS3/WS4 — discovery v2 / area-intelligence v2 polish) and continue
> through Tier 4 autonomously, checkpointing again per the same
> token-management discipline if needed.

## On the "1:10 AM scheduled restart" instruction

Unchanged from earlier checkpoints this sprint: this session runs
without a persistent scheduler/loop attached for this conversation. No
scheduled restart is claimed. This checkpoint and the exact resume
prompt above remain the real mechanism for continuing.
