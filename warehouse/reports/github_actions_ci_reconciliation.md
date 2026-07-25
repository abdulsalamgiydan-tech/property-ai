# GitHub Actions CI Reconciliation

Resolves the contradiction the user flagged: the Sprint 11 final report
claimed the codebase was in a passing state while GitHub Actions was
failing repeatedly. This report is the record of the diagnosis, the fix,
and the proof that CI is now genuinely green.

## The original failure

- Repository: `abdulsalamgiydan-tech/property-ai`
- Branch: `feature/australia-property-intelligence-v3`
- Commit: `a713931`
- Workflow: **Warehouse Validation**
- Run ID: `29886166152`
- Failed job: `Build, lint, test, warehouse file checks`
- Failing step: **Lint**
- Exit code: 1
- Annotations: 10 (8 real errors, 7 warnings, 1 platform Node-version
  deprecation notice unrelated to this repo's config)

Full evidence (exact annotations, full log excerpt, workflow
configuration table) is in `github_actions_failure_diagnosis.{md,json}`.

## Exact root cause

8 real ESLint/React-Compiler errors existed in 4 files on this branch:

1. `components/strategy/StrategyForm.tsx:268,732,751,770` —
   `react-hooks/static-components`: a `CharCount` component was declared
   *inside* `StrategyForm`'s body, creating a new component identity every
   render.
2. `components/reports/SavedReportClient.tsx:208,236` —
   `react-hooks/rules-of-hooks`: two `useMemo` calls sat after 5 early
   returns, violating the rule that hooks must run unconditionally, in the
   same order, every render.
3. `components/compare/ComparePropertiesClient.tsx:97,104` —
   `react-hooks/preserve-manual-memoization`: `handleSaveComparison`
   referenced `resultA`/`resultB` via closure before their `useMemo`
   declarations later in the component body — the React Compiler couldn't
   statically verify the manual memoization was preserved.
4. `components/analyse/AnalysePropertyClient.tsx:2351` —
   `react-hooks/refs`: `lastSavedInputsRef.current` was read directly
   during render; refs may only be read from effects/handlers.

## Why the local session's checks gave a misleading result

`npm run lint` was run locally multiple times throughout Sprint 11 and
correctly reported these same 8 errors every time — **the local tool
output was never wrong.** The mistake was in *interpretation*: because all
4 files were last touched by `ebc6552` (a pre-Sprint-11 ancestor commit,
Budget 2026 tax modelling — confirmed via `git log`), the session's own
reports (Sprint 11's final report, the WS22 commit message) treated the
errors as "pre-existing and unrelated to this sprint's work" and therefore
acceptable to leave as-is. That reasoning is a true statement about
*origin* but a false implication about *CI outcome*: GitHub Actions'
`npm run lint` step checks the command's exit code on the current tree,
with no `continue-on-error` — it has no concept of "whose commit this bug
belongs to." The two questions ("did I introduce this?" and "does CI
pass?") were conflated, and only the first one was actually being
answered. Cross-checking `gh run list` (after installing/authenticating
`gh` specifically for this diagnosis) showed CI had in fact failed on
**every single run since the workflow was created** (`20b248e`, WS15)
through the report's own commit (`a713931`) — 10 consecutive failing runs,
never once green, the entire time Sprint 11's reports were describing the
codebase as passing.

## Reproduction

Created a disposable git worktree at commit `a713931` (`git worktree add
--detach`), containing none of the local session's state (no
`node_modules`, no `.env.local`, no `warehouse/data`) — verified directly
before running anything. Downloaded a portable Node 20.19.0 build (matching
the CI runner's `node-version: 20` exactly; the local dev machine runs
Node 24) and ran the exact workflow command sequence:

| command | result (before fix) |
|---|---|
| `npm ci` | pass |
| `npm run warehouse:check` | pass |
| `npm test` | pass (72/72) |
| `npm run lint` | **fail — same 8 errors, byte-identical to the CI log** |
| `npm run build` | pass (proven independently; CI itself never reached this step because Lint failed first) |
| `git diff --check` | pass |
| `git status --short` | clean |

This confirms the failure is isolated entirely to real source-code lint
errors — not a Node-version mismatch, not a gitignored/local-only file
dependency, not an environment variable, not a Windows/Linux path or
case-sensitivity issue, not a workflow YAML problem, and not related to
the previously-fixed migration 020 bug (separately reconfirmed present and
correct on this branch). Full root-cause elimination table in
`github_actions_failure_diagnosis.json`.

## Fix

Fixed each error at its actual cause, no rule suppression, no
`continue-on-error`, no scope narrowing of what lint covers:

- `StrategyForm.tsx`: moved `CharCount` (and its `FREE_MAX` constant) to
  module scope, outside the component.
- `SavedReportClient.tsx`: moved both `useMemo` calls (and the
  `result`/`inputs` derivation they depend on) above every early return,
  with null-safe fallbacks inside each memo callback.
- `ComparePropertiesClient.tsx`: reordered so `resultA`/`resultB`'s
  `useMemo` declarations precede `handleSaveComparison`, the function that
  closes over them.
- `AnalysePropertyClient.tsx`: added a `lastSavedInputs` state that mirrors
  `lastSavedInputsRef.current`, set at all 3 existing assignment sites;
  the render-time read now uses the state instead of the ref.

## Verification

**Local (main working directory)**: `npm run lint` → 0 errors, 6 warnings,
exit 0. `npm test` → 72/72. `npm run build` → pass.

**Clean worktree, Node 20, no local state** (the 4 fixed files copied in
pre-commit): `npm run lint` → 0 errors, exit 0. `npm run warehouse:check`
→ pass. `npm test` → 72/72. `npm run build` → pass. `git diff --check` →
pass.

**Live smoke test** (dev server + `gstack /browse`): filled and submitted
`/analyse-property`'s form (exercises the ref→state fix directly) — deal
score, projections, and the `SaveReportButton` (fed by the new
`lastSavedInputs` state) all rendered correctly, no console errors beyond
a pre-existing, unrelated Recharts container-size warning. Filled and
compared two properties on `/compare-properties` (exercises the
`resultA`/`resultB` reordering fix) — both results rendered (scores 54 and
55), no console errors, no crash.

## Push and CI result

- Commit: `158ff85` — pushed to
  `origin/feature/australia-property-intelligence-v3`
- New workflow run: `29887704890`
- **Conclusion: `success`** ✅ (confirmed via `gh run view
  29887704890 --repo abdulsalamgiydan-tech/property-ai`)
- Job `Build, lint, test, warehouse file checks`: 1m23s, all steps green
- Remaining annotations: 6 pre-existing unused-var warnings (unrelated,
  don't affect exit code) + 1 GitHub-platform Node-version deprecation
  notice (about the actions' own runtime, not this repo's `node-version:
  20` config — not actionable from this repo)

## Files changed

- `components/analyse/AnalysePropertyClient.tsx`
- `components/compare/ComparePropertiesClient.tsx`
- `components/reports/SavedReportClient.tsx`
- `components/strategy/StrategyForm.tsx`
- `warehouse/reports/github_actions_failure_diagnosis.md` (new)
- `warehouse/reports/github_actions_failure_diagnosis.json` (new)
- `warehouse/reports/github_actions_ci_reconciliation.md` (this file)
- `warehouse/reports/github_actions_ci_reconciliation.json` (new)
- `warehouse/reports/sprint11_final_report.md` — corrected the lint/CI
  section, added an explicit correction note
- `warehouse/reports/sprint11_final_report.json` — same correction,
  machine-readable

## Environment note (disclosed, not hidden)

`gh` (GitHub CLI) was not installed in this environment. Per the mission's
instruction to use the first available method to obtain real annotations
rather than guess, it was installed via `winget install --id GitHub.cli`
and authenticated by the user (`gh auth login`, interactive — required
human action, could not be automated). This was necessary to retrieve the
actual failing-run logs and to verify the fix's resulting run; without it,
this diagnosis would have had to guess at the failure from local
reasoning alone, which is exactly the kind of gap that produced the
original contradiction.

## Confirmations

- Production touched: **NO**
- Raw data committed: **NO**
- CI checks weakened: **NO** — no `continue-on-error`, no ESLint rule
  disabled or narrowed, no file excluded from lint scope, no lint rule
  softened; every fix addresses the actual React/hooks issue the rule
  correctly flagged
- Sprint 12 started: **NO**

## Sprint 11 completion status

Sprint 11 (WS0-22) is now genuinely complete, verified by both local
checks and a real, green GitHub Actions run — not just local execution as
before. `sprint11_final_report.md` has been corrected to reflect this
explicitly rather than silently amended.
