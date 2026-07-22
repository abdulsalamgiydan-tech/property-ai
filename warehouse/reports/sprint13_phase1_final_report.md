# Sprint 13 Phase 1 — Final Report

**Branch**: `feature/sprint13-private-beta` (off
`feature/national-residential-research-platform-v1`, never `main`).
**Commits this phase**: `c2004b7` → `98119f3` (8 checkpoints on top of the
Workstream 0/1 reconciliation at `ca32cb9`).
**Scope**: Workstreams 2-8 of the Sprint 13 brief — unifying the existing
deal-analysis product with the existing research/warehouse platform into
one coherent private-beta product, per the reconciled understanding in
`sprint13_execution_plan.md` and `sprint13_phase1_reuse_map.md`.

## What shipped, workstream by workstream

**WS2 — Unified navigation**: `components/nav/Navbar.tsx` now shows a
server-computed "Research" entry (desktop nav + mobile bottom bar,
`grid-cols-7` when active) gated on `WAREHOUSE_PREVIEW_ENABLED`, computed
in `app/layout.tsx` and passed down — never a client-only flag read. IA
clarity added between the two "Compare" concepts
(`app/compare-properties` vs `/research/compare`) via in-page copy.

**WS3 — Shared search**: `components/research/GeographySearchBox.tsx` —
one reusable debounced autocomplete (keyboard nav, recent searches via
`lib/research/recentSearches.ts`, loading/empty/error states) backed by a
new internal `/api/research/search-suggest` route. Wired into Explore;
reused by the Watchlist add-suburb flow (WS8a). Live-verified against
real warehouse data in the browser test pass.

**WS4 — Explainability + shared formatters**: extracted
`lib/warehouse/formatMetric.ts` (money/percent/count/period
"unavailable, never zero" formatters, unit-tested including the
`formatX(0) !== "Unavailable"` case) out of `MarketSnapshotView`, and
closed 3 explainability gaps (dwelling stock, approvals, demographics had
no "About this metric" link before this phase — confirmed 4→7 live).

**WS5 — Analyse-Property warehouse integration (trimmed)**:
`lib/suburbAssumptions.ts` was a hardcoded `null` stub; it now calls a
new `/api/analyse/suburb-suggestions` route resolving NSW/VIC suburbs
against real market snapshots. Vacancy is always `null` (no source
exists anywhere in the warehouse). Deal inputs are never overwritten —
only the pre-existing editable Advanced Assumptions fields are
pre-filled. Fixed a second, initially-missed call site in
`components/compare/useComparePropertyFormSlice.ts` that the
type-checker caught.

**WS6 — Scenario Lab v2 (trimmed)**: replaced the single-scenario
`ScenarioLabClient` with `ScenarioLabClientV2` — up to 4 side-by-side
cases (Base/Conservative/Stress presets), each with deposit/term/rate/
vacancy/expenses, real loan amount/repayment/yield/cashflow/break-even
rent/debt-equity-path outputs (3 new pure formulas added to
`lib/warehouse/affordability.ts`, all unit-tested against known reference
values). New `scenario_lab_cases` table (migration 037) lets signed-in
users save a case. Property price held constant throughout — equity
reflects debt paydown only, never a growth assumption.

**WS7 — Comparison v2 (trimmed)**: extracted `CompareTable.tsx` (client
component) supporting in-place reorder via left/right buttons,
round-tripped through the existing `?ids=` query param — live-verified
the URL updates on reorder. Print layout tightened. Historical
(trend-over-time) comparison view deliberately deferred — flagged as a
separable follow-up rather than rushed.

**WS8a — Saved research workspace (trimmed)**: `watchlist_items` extended
(migration 038, additive) with `geography_id`/`geography_code`/
`geography_type`/`postcode`/`tags`/`updated_at`. Watchlist's add-suburb
form offers the shared search box for NSW/VIC (geography-linked) while
keeping free-text entry for every other state. Dashboard gets a new
"Saved research" section using the existing card-grid pattern.

**WS8b — Static RLS policy checker**: new `npm run warehouse:rls:check`
(`check_rls_policies.mjs`), cloned from the proven `check_warehouse_files.mjs`
pattern, parses migration SQL and verifies every `public.*` table has RLS
+ correct `auth.uid() = user_id` policies on every required operation.
Running it against real migrations surfaced two legitimate pre-existing
narrower tables (`waitlist`, `strategy_generations`) which are now
explicit, reasoned exceptions rather than silent gaps.

## Validation, re-run clean at the end of this phase

- `npm run lint` — 0 errors, 6 pre-existing warnings (unchanged from
  Sprint 12 baseline, none in Phase 1 files).
- `npm run build` — compiles clean, all 31 routes generated (was 29
  before Phase 1; +2 new API routes).
- `npm run test` — **227/227 passing** (was 163 at the reconciliation
  checkpoint; +64 new tests this phase, 0 removed, 0 weakened).
- `npm run warehouse:check` — passes, no raw data committed.
- `npm run warehouse:rls:check` — passes, all 7 `public.*` tables covered.
- Real browser smoke test against local dev server with real warehouse
  data — see `sprint13_phase1_browser_test_report.md` for exact coverage
  and honest gaps.
- Secret/large-file scan of the full Phase 1 diff — clean (see
  `sprint13_phase1_security_report.md`).

## Guardrails respected

- No production Supabase write, no production Vercel deploy/env change.
- No `main` merge — all 9 commits on `feature/sprint13-private-beta`.
- Both new migrations (037, 038) are additive only — verified by
  `warehouse:check`'s destructive-DDL scan.
- No paid infrastructure, no billing/payment code, no Buy/Pass/
  Recommended labels, no forecasts presented as expected outcomes.
- Feature flags stay server-enforced, default-off (`WAREHOUSE_PREVIEW_ENABLED`
  etc. unchanged from Sprint 12's default-false posture).

## Known limitations carried forward (not fixed by design, not silently ignored)

1. Live cross-user RLS integration testing remains out of scope — static
   policy verification only, per an explicit decision this phase (no
   safe non-production Supabase branch for the main app schema).
2. Comparison's historical/trend-over-time view (part of the original
   WS7 spec) was deferred to keep the shipped reorder+print work
   correctly scoped rather than rushing a larger N-geography x M-period
   surface.
3. `AnalysePropertyClient`'s "suggestions applied" success-state banner
   wasn't re-confirmed in a live browser click-through this pass (covered
   by 10 automated tests instead — see browser test report).
4. Neither new API route (`search-suggest`, `suburb-suggestions`) has its
   own rate limit — consistent with the rest of the codebase at this
   point, not a regression, but not fixed either; Workstream 13 scope.
5. Authenticated flows (watchlist geography-linked add, Scenario Lab
   save) weren't exercised as a signed-in user in this session's browser
   pass (no live magic-link email round-trip available); RLS/save-path
   correctness relies on the existing proven pattern plus static checks.

## What's left of the original 21-workstream Sprint 13 scope

Workstreams 9-21 (watchlist change-detection, entitlement schema,
operations console extension, remaining security/performance/
accessibility passes, report export, analytics, full release-candidate
test suite, preview deployment, operating pack, final audit) are not
started. This phase deliberately covered 2-8 (plus 0/1) as agreed with
the user; the remaining workstreams are a distinct follow-on phase.
