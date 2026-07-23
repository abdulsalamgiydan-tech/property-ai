# Sprint 14 Checkpoint

**Stopping reason**: context/token checkpoint, per the brief's own
token-management instructions. This session has now delivered the
entirety of Sprint 13 (21 workstreams) plus all of Sprint 14 Tier 1
(3 workstreams), Tier 2 (4 workstreams), and all of Tier 3
(WS5, WS2, WS3/WS4 — 3 more workstreams). Checkpointing here, at the
natural end of the Tier 3 boundary, before starting Tier 4.

## Current branch and latest commit

- Branch: `feature/sprint14-production-readiness` (off
  `feature/sprint13-private-beta` @ `89f1766`)
- Latest commit before this checkpoint file: `e87c842` — "feat(warehouse):
  Sprint 14 Workstreams 3/4 — discovery polish (sort + clear filters)"
- All commits pushed to `origin/feature/sprint14-production-readiness`.
- Working tree: clean.
- CI: green on every commit this session, most recently confirmed on
  `e87c842` (run `30037508607`, success).

## Completed workstreams

**Tier 1**: WS0 (baseline), WS16 (security headers + route bound
tests), WS12 (entitlement enforcement via migration 041, applied to
production with approval).

**Tier 2** (all CI-green): WS9 (watchlist/change intelligence v2), WS6
(property analysis v2 — stress test), WS7 (Scenario Lab v2 —
accelerated repayments), WS11 (report builder generalization).

**Tier 3** (all CI-green — Tier 3 now fully complete)
- **WS5 — Grounded AI research copilot**: deterministic evidence +
  grounding layers built and tested before any LLM call; reuses the
  existing production `ANTHROPIC_API_KEY` (no new provider). Off in
  production by default (`RESEARCH_COPILOT_ENABLED` unset; migration
  042 written/tested, not applied). 39 tests. Commit `7977346`.
- **WS2 — Onboarding**: short, skippable, one-time step after first
  sign-in. Migration 043 written/tested, not applied (fails open).
  Live-verified via the `browse` tool — caught and fixed a real
  redirect-default bug. 6 tests. Commit `2a6e991`.
- **WS3/WS4 — Discovery polish**: investigated "national discovery"
  first and found it blocked on a real, already-documented warehouse
  data-quality gap (postcode jurisdiction/state_code unreliable outside
  NSW/VIC, VIC rent has no time series) — explicitly did NOT widen
  state filtering to avoid surfacing unverified data as reliable.
  Delivered instead: a stable client-side sort control on Explore
  results ("has market data first" / "name") and a working
  "Clear all filters" link on the empty-results state. Live-verified.
  5 tests. Commit `e87c842`.

## In-progress workstream

None — WS3/WS4 was finished cleanly, tested, built, live-verified,
committed, pushed, and confirmed CI-green before this checkpoint. No
partial work exists.

## Remaining workstreams (Tier 4 — see `sprint14_execution_plan.md`)

**Tier 4** (all remaining): WS13 (refresh engine v4), WS14
(data-quality monitoring), WS15 (ops console v2), WS17 (performance),
WS18 (accessibility), WS19 (analytics), WS20 (beta admin), WS21
(feedback), WS22 (legal copy).

**Always last**: WS23 (release engineering), WS24 (UAT pack), WS25
(final independent audit) — written against whatever subset actually
ships, not the brief's full aspirational list.

Tier 4 has 9 items and is explicitly the tier the execution plan
flagged as "unlikely to all be reached in genuine depth" — the next
session should pick a small number of the highest-value items (e.g.
WS18 accessibility, WS19 analytics, WS22 legal copy are typically
lower-risk/bounded; WS13 refresh engine v4 and WS15 ops console v2 are
larger) rather than attempting all 9, and state honestly in the final
audit (WS25) which were not reached.

## Exact current state

- Tests: 401/401 passing (grew from 396 at the last checkpoint, 297 at
  the end of Sprint 13).
- Lint: 0 errors on every file touched this session (6 pre-existing
  warnings elsewhere in the repo, unchanged baseline).
- Build: passes.
- `warehouse:check` / `warehouse:rls:check`: both pass.
- CI: green on every commit this session.

## Database state (independently verified this session, not re-quoted)

- Production (`oshquaxsloolqucwvigc`): migrations through 041 only —
  unchanged since the last checkpoint. Migrations 042
  (`research_copilot_queries`) and 043 (`user_onboarding_preferences`)
  remain written, statically verified, and RLS-checker-covered, but
  **NOT applied to production** — both features fail safe/open without
  them. Applying either requires the same explicit approval as
  migration 041.
- Warehouse-validation branch (`lzonauinzatmtytyoems`): unchanged this
  session — no warehouse-schema work was done in Tier 3 (WS3/WS4 was
  UI-only by design, given the documented data-quality blocker).
- Preview Vercel env vars: unchanged — still scoped to
  `feature/sprint13-private-beta` only.
- Production Vercel env vars: untouched (4 original vars only).

## Production safety verification

- No `vercel deploy --prod` run this session.
- No merge to `main`.
- No production database changes since migration 041.
- No paid infrastructure, billing, email/SMS, or new third-party
  service added or activated.
- `RESEARCH_COPILOT_ENABLED` unset in production — copilot fully inert.

## Known issues (honest, not hidden)

- Carried from earlier checkpoints: 3 pre-existing dependency
  vulnerabilities unforced; no proactive saved-scenario usage counter;
  no admin UI to grant tiers; Sprint 14 branch has no Preview
  deployment; WS9's digest preview covers watchlist events only; WS7's
  extra-repayments field isn't in the exported CSV; WS11's report
  builder has no custom-section UI; WS5's copilot and WS2's onboarding
  both need an explicit apply decision on their respective migrations
  before going fully live; WS2's collected preferences aren't read
  anywhere else in the app yet.
- New this checkpoint:
  - **A real, documented warehouse data-quality gap exists** and was
    surfaced (not created) by WS3/WS4's investigation: postcode-grain
    `jurisdiction`/`state_code` is unreliable outside NSW/VIC across
    `mart.postcode_market_snapshot` and `core.dim_geography`, and VIC's
    rent data has no time series (single latest-value only). This was
    already known from a Sprint 12 audit but is re-flagged here because
    it directly blocks any future "national discovery" UI work until
    fixed at the mart/data layer — a materially larger effort than a
    Tier 3/4 polish item.
  - Given the above, genuine "national discovery" (the brief's
    aspiration) remains unimplemented and would need to be scoped as
    its own dedicated data-engineering workstream in a future sprint,
    not attempted as a polish item.

## Exact next action

Start Tier 4. Given 9 items remain and full depth on all of them is
unrealistic, recommend prioritizing WS18 (accessibility) and WS19
(analytics) first — both are typically bounded, testable, low-risk, and
build on infrastructure that already exists (the analytics event
contract from Sprint 13, and standard a11y patterns already followed
elsewhere in this codebase) — then continue down the list as budget
allows, checkpointing again if needed.

## Exact resume prompt

> Continue Sprint 14 from the checkpoint at commit e87c842 on branch
> feature/sprint14-production-readiness. Read
> warehouse/reports/sprint14_checkpoint.md and
> warehouse/reports/sprint14_execution_plan.md first, verify the
> repository/CI/database state independently (don't trust this
> checkpoint blindly), then start Tier 4 — pick 2-3 of the
> highest-value, lowest-risk remaining items (WS18 accessibility, WS19
> analytics, and WS22 legal copy are good candidates) rather than
> attempting all 9, and continue through as many as the session budget
> allows, checkpointing again per the same token-management discipline
> if needed.

## On the "1:10 AM scheduled restart" instruction

Unchanged from earlier checkpoints this sprint: this session runs
without a persistent scheduler/loop attached for this conversation. No
scheduled restart is claimed. This checkpoint and the exact resume
prompt above remain the real mechanism for continuing.
