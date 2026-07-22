# Sprint 12 Delivery Plan — National Residential Research Platform V1

## Scale acknowledgement

Sprint 12's brief specifies 18 workstreams: 3 new jurisdictions, a second
national geometry version, a full data-lineage system, an automated
data-quality framework, a refresh-engine rewrite, a versioned public API,
a 12-area UI rebuild, a research-publication catalogue, and 120+ new
tests — each workstream is comparable in scope to an entire Sprint 11
workstream, and Sprint 11 took 23 workstreams to deliver a smaller
mission. This is explicitly a multi-session mission (the brief's own
"context and token checkpoint rule" anticipates this).

**Execution priority, in order, chosen to maximise genuinely working,
independently-verified functionality rather than shallow coverage of
every bullet:**

1. **Phase 0** (this document + capacity plan + baseline) — done.
2. **WS1 (coverage audit)** — foundational; every later workstream needs
   an honest source-by-source map of what exists before building on it.
3. **WS2 (TAS/ACT/NT onboarding)** — the mission's clearest concrete,
   bounded deliverable: 3 jurisdictions, real official sources, real
   loads. Directly closes the "8 jurisdictions in the registry" gate from
   WS18's acceptance criteria.
4. **WS4 (2016-2021 boundary reconciliation)** — unblocks the
   `population_growth_2016_2021` metrics that WS6's marts need, and was
   explicitly deferred from Sprint 11 as a known gap.
5. **WS6 (national canonical marts)** — depends on WS2/WS4 output;
   consolidates rather than duplicates.
6. **WS8 (lineage) + WS9 (quality monitoring)** — metadata-layer systems,
   cheap in storage, high value for WS18's "every metric has lineage"
   acceptance gate.
7. **WS7 (Scenario Lab)** — self-contained, no data dependency (uses
   `SCENARIO_LAB_ENABLED`, already reserved in WS18 of Sprint 11), can be
   built independently of the data workstreams.
8. **WS11 (API v1) + WS12 (UI rebuild)** — depend on WS6's marts being in
   a stable shape; sequenced after.
9. **WS3 (broader national demand/supply), WS5 (research catalogue), WS10
   (refresh engine v3), WS13 (export), WS14 (security), WS15
   (performance), WS16 (testing), WS17 (docs)** — built incrementally
   alongside/after the above as context allows, each with genuinely
   working, tested output rather than stub coverage.
10. **WS18 (final validation)** — only after the above are real and
    tested, not a formality.

## What "done" means for this sprint

Consistent with Sprint 11's practice: a workstream is only marked complete
in the final report if its actual code/data/tests exist and were
independently verified (re-queried after commit, tested via `npm test`,
smoke-tested live where UI is involved). Workstreams not reached by the
time a hard stop or context checkpoint occurs will be recorded honestly in
`sprint12_known_gaps.md` / the checkpoint report — not silently marked
done.

## Non-negotiables carried into every workstream

- Local-first: raw and detailed facts never leave local DuckDB/Parquet
  unless a specific mart genuinely needs them promoted.
- No invented geography correspondence, no invented values for missing
  metrics — NULL/unavailable stays NULL/unavailable.
- No forecasts, AVMs, rankings, scores or buy/sell recommendations —
  Scenario Lab is a calculator only.
- Every commit validated (`npm run warehouse:check`, `npm test`, lint,
  build) before push; GitHub Actions checked green after push, not
  assumed.
- Production never touched; `main` never merged into.

## Branch and PR state at Phase 0 completion

- Sprint 11 branch `feature/australia-property-intelligence-v3` final
  commit: `b3913e1`, GitHub Actions run `29887974106` — conclusion
  `success`.
- Sprint 11 draft PR: [#4](https://github.com/abdulsalamgiydan-tech/property-ai/pull/4)
  (`feature/australia-property-intelligence-v3` → `main`, draft, open,
  not merged).
- Sprint 12 branch: `feature/national-residential-research-platform-v1`,
  created from `b3913e1`.
- Baseline (`npm ci`, `warehouse:check`, `lint`, `test`, `build`,
  `git diff --check`, `git status --short`) all pass — see
  `sprint12_baseline.json`.
