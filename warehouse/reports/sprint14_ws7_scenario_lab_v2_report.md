# Sprint 14 — Workstream 7: Scenario Lab v2 Extensions

## Scope delivered this pass

Sprint 13's Scenario Lab v2 (`ScenarioLabClientV2.tsx`) already lets a
user compare up to 4 cases across five editable assumptions (deposit,
loan term, rate, vacancy, expenses) against a geography's real recorded
median sale price. This workstream adds one genuinely new scenario
dimension rather than reshuffling the existing five:

**Extra/accelerated repayments.** A new pure function,
`calculateLoanBalanceWithExtraRepayments()` in
`lib/warehouse/affordability.ts`, models a constant extra monthly
repayment on top of the standard amortising schedule. Unlike the
existing `calculateLoanBalanceAfterMonths()` (which has a closed-form
geometric solution), extra repayments have no closed form — each
month's interest depends on the balance left over from every prior
month's extra paydown — so this iterates month by month. Verified
against the existing closed-form function at zero extra repayment
(should match exactly) as a regression guard.

Each scenario case in `ScenarioLabClientV2.tsx` gained a sixth slider,
"Extra repayments ($/mo)" (0-2,000, step 50). The debt/equity path table
now uses the accelerated-payoff balance when a case has a non-zero extra
repayment, and a new line shows "+$X extra equity by year N from
accelerated repayments, vs. the standard schedule" — directly comparing
the standard and accelerated balance at the same elapsed time.

## Why this scope, and what was deliberately not done

"More scenario types and sensitivity tables" is broad. Extra repayments
was chosen because it is (a) a real, common investor lever not currently
modellable at all in the Lab, (b) implementable as a small, independently
testable pure function with no dependency on new data, and (c) directly
comparable against the existing debt-path display rather than requiring
a new UI paradigm.

Not implemented in this pass, stated explicitly:
- A rate/vacancy sensitivity table analogous to the one added to the
  Deal Analyser in WS6 — could be added to the Scenario Lab too, but
  was left out to avoid duplicating that exact pattern twice in one
  session; worth doing as a follow-up if there's demand.
- The extra-repayment assumption is not yet reflected in the report
  export (`lib/export/researchReport.ts`'s `ReportScenarioCase` type
  doesn't carry it) — exported reports for an accelerated-payoff case
  will still show the standard debt path fields. `scenario_json` saved
  to `scenario_lab_cases` on "Save this scenario" DOES capture the
  accelerated numbers (since it stores the full `computeOutputs()`
  result), so saved-case history is not affected — only the
  human-readable exported report.
- No new database column for `extraMonthlyRepayment` — it lives entirely
  in `scenario_json` (already a flexible jsonb column), so no migration
  was needed for this workstream.

## Testing

- `lib/warehouse/affordability.test.ts`: +5 tests for
  `calculateLoanBalanceWithExtraRepayments` — matches the closed-form
  function at zero extra repayment; pays down faster than standard with
  a positive extra repayment; correctly floors at 0 once a small loan is
  fully repaid early rather than going negative; returns full principal
  at month 0 regardless of the extra amount; treats a negative extra
  repayment as zero rather than slowing paydown below standard.
- Full suite: 345/345 passing (up from 340 after WS6).
- `npx eslint components/research/ScenarioLabClientV2.tsx
  lib/warehouse/affordability.ts lib/warehouse/affordability.test.ts`:
  clean.
- `npm run build`: passes.

## Database changes

None. `extraMonthlyRepayment` is a local-only UI state field; when a
case is saved, it flows into the existing flexible `scenario_json`
column rather than requiring a new typed column or migration.

## Risk / correctness notes

- The iterative extra-repayment function was cross-checked against the
  existing closed-form function at zero extra repayment as a regression
  guard — if the two ever diverged at zero it would indicate a bug in
  the new iteration logic, not a genuine behavioural difference.
- All new UI copy keeps the existing Scenario Lab framing: illustrative
  scenario modelling against a real recorded median sale price, not a
  forecast or recommendation.
