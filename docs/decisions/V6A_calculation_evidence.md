# V6A — calculation evidence

Machine-checked evidence for the Find My Investment vertical slice. All figures are
**real official SA warehouse values** observed on Production (V5B); no synthetic values.

## Test gates (all pass on `feature/v6a-find-my-investment`)
- `lib/opportunity/scoring.test.ts` (9) — sub-index knots, weighting, confidence, fit.
- `lib/opportunity/engine.test.ts` (10) — A1 determinism, A2 weight-explainability,
  A3 missing-can't-improve, A4 cash-flow == independent deal engine, A5 no ineligible
  leak, A6 provenance.
- `supabase/migrations/059_investment_opportunity_engine.test.ts` (9) — additive/least-
  privilege static checks + PGlite run proving A7 (client-role isolation) and A8
  (cross-user RLS).
- Repo-wide: **795 tests pass** (99 files); ESLint clean; `tsc` 39 (baseline, 0 new);
  `next build` OK; secret scan clean; `warehouse:rls:check` pass.

## Worked ranking on real SA values
Profile: maxPrice A$1,800,000 · deposit A$500,000 · strategy **Growth** ·
acceptable holding A$800/wk · house · SA · asOf 2026-08-04.

### Grange (`SAL_40530`) — real: price 1,690,000 · rent 825 · yield 2.54% · volume 18 · growth −6.11%
- **Eligible**: price ≤ budget; holding cost A$727/wk ≤ A$800 limit.
- Sub-indices: growth **0** (−6.11% ≤ −5 floor), demand **54.2** (18 sales), yield **1.8** (2.54%).
- `opportunity_score_v1` (Growth 60/25/15) = round(.6·0 + .25·54.2 + .15·1.8) = **14** (weak).
- Confidence **80** (high) — mandatory fresh; −20 because supply + demographic optional
  evidence absent. Note: opportunity is **unchanged** by that absence (separate axis).
- Affordability fit **53**. Scenario (not advice): −A$727/wk before tax, LVR 70.4%.
- Reasons against include: "12-month price growth is negative (−6.11%)
  (sa_metro_median_house_sales · 2026-06-30)".
- **Proves:** signed growth genuinely lowers the score; missing optional evidence lowers
  only confidence, not opportunity; every figure carries source + period + freshness.

### Belair (`SAL_40089`) — real: price 1,455,000 · volume 16 · growth **+20.55%**, but NO official rent/yield
- **Excluded** — reason `missing_mandatory_evidence` ("Missing required evidence:
  median_rent, gross_yield"), despite its strong +20.55% growth.
- **Proves:** missing mandatory evidence **excludes** a suburb (surfaced honestly),
  it never inflates a ranking — even when the present metric is excellent.

## UI evidence (screenshots)
Live screenshots require migration 059 applied to a dev/validation database and the
`WAREHOUSE_PREVIEW` flag enabled; that is **deferred to the validation step** (this task
does not touch validation/Production). The flow is fully built and type-checked:
- `app/find-investment/page.tsx` (flag-gated), `components/find-investment/FindInvestmentClient.tsx`
  (questionnaire → ranked results → evidence/calculation drawer → shortlist + compare →
  empty / insufficient-evidence / stale-data / state-blocked states; keyboard + aria dialog).
The ranked-result payload rendered by the UI is exactly the `RankedResult` shown above.
