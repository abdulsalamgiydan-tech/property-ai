# Sprint 14 — Workstream 6: Property Analysis v2

## Scope delivered this pass

The existing Deal Analyser (`AnalysePropertyClient.tsx` /
`lib/propertyAnalysis.ts`) already produces a full single-property
analysis: yields, loan/upfront costs, year-one cashflow, tax and
depreciation effects, a deal score, and 30-year projections including a
tax-scenario comparison tab. This workstream adds one genuinely new
analytical capability rather than re-touching what already works:

**Rate & vacancy stress test.** A new `lib/propertyAnalysisSensitivity.ts`
module (`buildStressTestRows`) re-runs the existing, unmodified
`analyzeProperty()` function under a small grid of interest-rate and
vacancy shocks (rate +1/+2/+3%, vacancy +5pp, and a combined rate+2%/
vacancy+5pp scenario, plus the unshocked baseline). It deliberately adds
no new financial modelling logic of its own — it is purely a shocked
re-run of the already-proven model, so results can never drift from the
headline analysis. Results are surfaced as a new "Stress test" tab
alongside the existing "Analysis" and "Compare scenarios" tabs in
`AnalysePropertyClient.tsx`, showing scenario, shocked rate, shocked
vacancy, resulting after-tax cashflow (colour-coded pass/fail), and deal
score for each row.

## Why this scope, and what was deliberately not done

The brief's "property analysis v2" language could cover a lot of ground
(comparable-sales evidence linking, confidence-banded projections,
break-even-rate solving, multi-property batch analysis). Given this is
one workstream within a much larger session, the highest-leverage,
lowest-risk addition was picked: something that (a) reuses the existing
proven calculation engine with zero new financial logic to get wrong,
(b) is immediately useful to a real investor decision ("how much rate
buffer does this deal have?"), and (c) is fully covered by pure-function
unit tests. Comparable-evidence linking and break-even-rate solving are
not implemented in this pass — stating this explicitly rather than
implying broader v2 coverage.

## Testing

- `lib/propertyAnalysisSensitivity.test.ts` (new): 6 tests — the
  zero-shock row exactly matches the unshocked `analyzeProperty()`
  result; increasing rate shocks monotonically worsen after-tax
  cashflow on a leveraged deal; shocked rate is floored at 0 rather than
  going negative; shocked vacancy is clamped to [0, 100] on both ends;
  the default shock grid covers rate-only, vacancy-only, and combined
  cases; the function never mutates its input.
- Full suite: 340/340 passing (up from 334 after WS9).
- `npx eslint components/analyse/AnalysePropertyClient.tsx
  lib/propertyAnalysisSensitivity.ts lib/propertyAnalysisSensitivity.test.ts`:
  clean.
- `npm run build`: passes.

## Database changes

None — entirely a client-side computation over data the user already
entered into the (unauthenticated-safe) Deal Analyser form. No new
Supabase table, RLS surface, or API route.

## Risk / correctness notes

- `buildStressTestRows` is a pure function with no side effects; the
  UI only reads `lastSavedInputs` (state that already existed for the
  Save Report feature), so no new state-management risk was introduced.
- The stress table sits behind the same `GatedBlur`-independent results
  area as the existing Analysis/Compare tabs — no change to the
  free/gated access boundary.
