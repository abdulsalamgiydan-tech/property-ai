# Sprint 13 Checkpoint

**Status**: Phase 1 (Workstreams 0, 1, 2-8) complete and validated.
**Branch**: `feature/sprint13-private-beta`
**Latest commit**: `98119f3` — "feat(watchlist): Sprint 13 Phase 1
checkpoint 8 — geography-linked watchlist and saved research on
dashboard"
**Working tree**: clean.
**Not merged to `main`.**

## What's done

- Workstream 0/1 reconciliation and Vercel access diagnosis (`ca32cb9`).
- Workstream 2 — unified navigation (Research nav entry, IA copy).
- Workstream 3 — shared `GeographySearchBox` search component.
- Workstream 4 — shared "unavailable, never zero" formatters + 3 closed
  explainability gaps.
- Workstream 5 — Analyse-Property warehouse-backed suburb suggestions
  (trimmed to suggestions-in only).
- Workstream 6 — Scenario Lab v2, multi-case comparison (trimmed to
  4-case cap, deposit/rate/term/vacancy/expenses).
- Workstream 7 — Comparison reorder + print layout (trimmed; historical
  view deferred).
- Workstream 8a — watchlist geography linking + dashboard saved-research
  section (trimmed).
- Workstream 8b — static RLS policy checker (`npm run warehouse:rls:check`).

Full detail in `sprint13_phase1_final_report.md` /`.json`,
`sprint13_phase1_reuse_map.md`, `sprint13_phase1_data_contract.md`,
`sprint13_phase1_security_report.md`,
`sprint13_phase1_browser_test_report.md`.

## Verified clean at this checkpoint

- `npm run lint` — 0 errors, 6 pre-existing warnings.
- `npm run build` — passes, 31 routes.
- `npm run test` — 227/227 passing.
- `npm run warehouse:check` — passes.
- `npm run warehouse:rls:check` — passes (new this phase).
- Real browser smoke test against local dev server (real warehouse
  data, zero console errors on every page tested).
- No secrets, no raw data, no `.env*` files committed.

## What's NOT done (original Sprint 13 brief, Workstreams 9-21)

Not started this phase — a distinct follow-on phase:

- WS9 — Watchlist change detection ("What changed?" panel, event model).
- WS10 — Metric explainability is *mostly* covered by the existing
  `AboutThisMetric` component reused across Phase 1's new surfaces, but
  the brief's fuller "About this metric" spec (formula, transformation
  summary, freshness, limitations all in one place) hasn't been audited
  end-to-end against every metric family.
- WS11 — Private-beta access/entitlement schema (Free/Research/Investor
  Pro/Professional tiers) — not started; today's access model is still
  the pre-existing binary signed-in/not.
- WS12 — Data-status/operations console extension.
- WS13 — Full security hardening pass (this phase's security report
  covers only what Phase 1 touched, not a repo-wide audit).
- WS14 — Performance/cost-control measurement and cost model.
- WS15 — Accessibility/mobile/UX quality pass (beyond what Phase 1's
  components already inherited from existing patterns).
- WS16 — Combined investment-research report export.
- WS17 — Analytics/product-learning event contract.
- WS18 — Full release-candidate test suite (cross-user access tests,
  feature-flag bypass tests, E2E browser tests as an automated suite
  rather than a manual smoke pass).
- WS19 — Preview deployment (Vercel CLI is confirmed working; missing
  warehouse env vars still need to be added to the Preview environment
  with explicit approval before this can happen — see
  `sprint13_ws1_vercel_deployment_access_report.md`).
- WS20 — Private-beta operating pack (test plan, UAT checklist, known
  limitations doc, cost estimate, security summary, invitation copy,
  go/no-go checklist).
- WS21 — Final audit and handoff.

## Exact resume prompt

To continue Sprint 13 from this checkpoint:

> Continue Sprint 13 from the checkpoint at commit 98119f3 on branch
> feature/sprint13-private-beta. Proceed with Sprint 13 Phase 2 —
> Workstreams 9 through 21 (or whichever subset you specify), following
> the same reuse-first, additive-migrations-only, checkpoint-and-commit
> discipline as Phase 1. Read warehouse/reports/sprint13_checkpoint.md
> and sprint13_phase1_final_report.md first to confirm current state
> before starting.

## Environment note for whoever resumes

Local `.env.local` already has `WAREHOUSE_PREVIEW_ENABLED`,
`MULTI_STATE_RESEARCH_ENABLED`, `PUBLIC_API_V1_ENABLED`, and
`SCENARIO_LAB_ENABLED` set, which is what allowed this phase's live
browser smoke testing against real warehouse data. `DATA_OPERATIONS_ENABLED`
is not set locally.
