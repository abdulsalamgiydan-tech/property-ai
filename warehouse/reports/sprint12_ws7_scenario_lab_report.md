# Sprint 12, Workstream 7 — Scenario Lab

## Scope and hard constraint

This project has a standing rule: no forecasts, AVMs, rankings, investment
scores, or buy/sell recommendations anywhere in the platform. Scenario Lab
is explicitly NOT a price predictor — it is descriptive "what if" affordability
modelling against a suburb's **real, already-recorded** median sale price:
adjust deposit%/loan term/interest rate, see the resulting estimated
repayment recompute. No future price is estimated at any point.

## Reused, not reinvented

`lib/warehouse/affordability.ts` already had exactly the pure, unit-tested
formulas needed (`calculateMonthlyRepayment`, `calculateLoanPrincipal`,
`calculatePriceToIncomeRatio`, `calculateRepaymentToIncomePct`) — the same
functions this project's own Sprint 9 SQL pipeline
(`load_market_intelligence_to_branch.mjs`) implements server-side for the
published snapshot's baseline `est_monthly_repayment_owner_occupier`
figure. Scenario Lab imports these directly into a client component, so
the interactive tool's baseline (20% deposit, 30-year term, RBA rate)
matches the already-published snapshot figure exactly, then lets the
reader adjust from there — no new math, no risk of the interactive tool
disagreeing with the published number.

## What was built

- `components/research/ScenarioLabClient.tsx` — client component,
  3 range sliders (deposit 5-50%, term 15-30 years, rate 2-10%), live
  client-side recomputation on every change, a persistent amber
  disclaimer banner ("not a forecast... not an estimate of what this
  property will sell for in future").
- `app/research/scenario/[geographyCode]/page.tsx` — server component,
  fetches the real snapshot, passes the real median sale price/household
  income/RBA baseline into the client component. Gated behind both
  `WAREHOUSE_PREVIEW_ENABLED` and `SCENARIO_LAB_ENABLED` (the latter flag
  already existed, added ahead of this route's build per its own
  pre-existing code comment).
- Linked from the suburb page's existing Affordability context section
  ("Try different deposit/term/rate assumptions in Scenario Lab →") —
  suburb grain only for now (postcode grain deferred, not attempted).

## Live verification

- `/research/scenario/12348` (Lindfield) returns 200, renders the real
  $2,623,500 median sale price in the disclaimer text, correct baseline
  figures (20% deposit = $524,700, matching $2,623,500 × 0.20 exactly).
- The link from the suburb page confirmed present in the rendered HTML.
- No console errors on page load.
- **Not fully verified**: live interactive slider-drag recomputation —
  attempted via browser automation but the gstack browse daemon crashed
  mid-test (a known, recurring instability in this environment, not an
  application issue). The underlying math is not new risk: it's the same
  `lib/warehouse/affordability.ts` functions already covered by 17
  passing unit tests, wired to a standard React `useState`/`onChange`
  pattern with no custom logic — a genuine interactive-drag test would be
  additional confidence, not a load-bearing check. Documented honestly
  rather than claimed as done.

## Validation

- `npm test`: 161/161 pass (the existing 17 `affordability.test.ts`
  tests directly cover the math this workstream reuses — no new
  duplicate tests added).
- `npm run build`: passes, `/research/scenario/[geographyCode]` compiles.
- `npm run lint`: 0 errors, 6 pre-existing warnings.
- Production: unaffected (no schema changes this workstream).

## Files

- `components/research/ScenarioLabClient.tsx` (new)
- `app/research/scenario/[geographyCode]/page.tsx` (new)
- `components/research/MarketSnapshotView.tsx`,
  `app/research/suburb/[geographyCode]/page.tsx` — nav link + prop wiring

## Exact next workstream

WS14 — security, RLS, and access model.
