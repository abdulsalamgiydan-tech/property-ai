# GitHub Actions Failure Diagnosis

Evidence obtained directly from GitHub via the authenticated `gh` CLI
(`gh run view 29886166152 --repo abdulsalamgiydan-tech/property-ai` and
`--log-failed`), not guessed. `gh` was not previously installed in this
environment — installed via `winget install --id GitHub.cli` and
authenticated interactively by the user (`gh auth login`) specifically to
retrieve this run's real logs, per the mission's instruction not to guess
when actual annotations can be accessed.

## Run identity

- Repository: `abdulsalamgiydan-tech/property-ai`
- Branch: `feature/australia-property-intelligence-v3`
- Commit: `a713931`
- Workflow: **Warehouse Validation** (`.github/workflows/warehouse-validation.yml`)
- Run ID: `29886166152`
- Job: `Build, lint, test, warehouse file checks` (ID `88817042822`)
- Duration: 52s
- Conclusion: **failure**

## Workflow configuration (`.github/workflows/warehouse-validation.yml`)

| aspect | value |
|---|---|
| Trigger | `push` on `main`, `feature/**`; `pull_request` on `main`; `workflow_dispatch` |
| Runner | `ubuntu-latest` (Linux — local dev is Windows) |
| Node version | `20` (`actions/setup-node@v4`, `node-version: 20`) |
| Package install | `npm ci` |
| Env vars | none set at workflow or step level |
| Permissions | `contents: read` only |
| Cache | `cache: npm` (setup-node built-in, keyed on `package-lock.json`) |
| Timeout | 10 minutes (job-level) |
| Concurrency | `warehouse-validation-${{ github.ref }}`, `cancel-in-progress: true` |
| Shell | `/usr/bin/bash -e {0}` (default on ubuntu-latest) |
| Command sequence | checkout → setup-node → `npm ci` → `npm run warehouse:check` → `npm test` → `npm run lint` → `npm run build` → large-file scan |
| Depends on gitignored/local files? | No — every step in this workflow operates only on committed source (confirmed by reading the workflow and, independently, by the job step list below: `warehouse:check` and `Unit tests` both *succeeded*, so no gitignored-file dependency was in play for the steps that ran) |

Note: GitHub's automatic runner-image annotation also reported
`actions/checkout@v4`/`actions/setup-node@v4` (which declare Node 20 as
their own action-runtime target) being forced onto the runner's Node 24 —
this is a GitHub platform-level deprecation notice about the *actions'
own* execution environment, not this project's `node-version: 20` input,
and is unrelated to the failure (see Phase 3D below).

## Job step results (from `gh run view`)

```
✓ Set up job
✓ Run actions/checkout@v4
✓ Run actions/setup-node@v4
✓ Run npm ci
✓ warehouse:check (required warehouse files present, no raw data committed)
✓ Unit tests
X Lint                                          <-- FAILED HERE
- Build                                          (never ran)
- Refresh registry integrity + no-large-file scan (never ran)
✓ Post Run actions/setup-node@v4
✓ Post Run actions/checkout@v4
✓ Complete job
```

**The failure is entirely in the `Lint` step.** `warehouse:check` and
`Unit tests` (the two things this project's local reports most recently
verified) both genuinely passed in CI, exactly as claimed. `npm run
build` and the large-file scan never got a chance to run because the
workflow has no `continue-on-error` — the job stopped at the first
failing step, as designed.

## Exact error (from `gh run view --log-failed`, full text in the run log)

```
> property-ai@0.1.0 lint
> eslint

/home/runner/work/property-ai/property-ai/components/analyse/AnalysePropertyClient.tsx
  2351:31  error    Error: Cannot access refs during render                     react-hooks/refs

/home/runner/work/property-ai/property-ai/components/compare/ComparePropertiesClient.tsx
   97:19  error  Compilation Skipped: Existing memoization could not be preserved   react-hooks/preserve-manual-memoization
  104:19  error  Compilation Skipped: Existing memoization could not be preserved   react-hooks/preserve-manual-memoization

/home/runner/work/property-ai/property-ai/components/reports/SavedReportClient.tsx
  208:28  error  React Hook "useMemo" is called conditionally. ...  react-hooks/rules-of-hooks
  236:31  error  React Hook "useMemo" is called conditionally. ...  react-hooks/rules-of-hooks

/home/runner/work/property-ai/property-ai/components/strategy/StrategyForm.tsx
  732:14  error  Error: Cannot create components during render  react-hooks/static-components
  751:14  error  Error: Cannot create components during render  react-hooks/static-components
  770:14  error  Error: Cannot create components during render  react-hooks/static-components

✖ 15 problems (8 errors, 7 warnings)
  0 errors and 1 warning potentially fixable with the `--fix` option.

Process completed with exit code 1.
```

(7 warnings — all `@typescript-eslint/no-unused-vars` — are present but do
not affect the exit code; `npm run lint` is a bare `eslint` invocation
with no `--max-warnings`, so only the 8 errors above are load-bearing.)

## Root cause

**These are genuine ESLint errors that exist in the committed source on
this branch.** They are not a CI infrastructure problem, not a
Node-version mismatch, not a gitignored-file dependency, and not a
Windows/Linux path issue. `npm run lint` on this exact commit, in this
exact repository state, exits 1 — in GitHub's Ubuntu runner and (verified
independently, see the clean-worktree reproduction in
`github_actions_ci_reconciliation.md`) in a clean local reproduction too.

**Why the local session's prior reports were misleading**: Sprint 11's
final report (`sprint11_final_report.md`) and WS22's commit message
described these same 8 errors as "pre-existing, unrelated to and
unchanged by any Sprint 11 work" and treated that as sufficient reason to
consider `npm run lint` acceptable. That reasoning is wrong for CI
purposes: GitHub Actions runs `npm run lint` with a real exit-code check
and no `continue-on-error` — it does not care whether an error predates
the current branch of work, only whether the command exits 0. "Pre-
existing and unrelated" is a true statement about *origin*, but a false
implication about *CI outcome*. The two are different questions, and the
final report conflated them.

## Files responsible (all 4 are unrelated to warehouse/research work — confirmed by `git log`, all last touched by `ebc6552`, a pre-Sprint-11 ancestor commit)

1. `components/analyse/AnalysePropertyClient.tsx:2351` — reads
   `ref.current` directly inside JSX during render (React Compiler /
   `react-hooks/refs` violation).
2. `components/compare/ComparePropertiesClient.tsx:97,104` — two
   `useMemo` calls the React Compiler cannot safely auto-memoize given
   their current structure.
3. `components/reports/SavedReportClient.tsx:208,236` — two `useMemo`
   calls positioned after a conditional early return, violating the
   Rules of Hooks (hooks must run unconditionally, in the same order,
   every render).
4. `components/strategy/StrategyForm.tsx:732,751,770` — a `CharCount`
   component function is declared *inside* the parent component's body
   (`react-hooks/static-components` — a new component identity is
   created every render, resetting its internal state each time).

Full remediation, clean-environment verification, and the CI re-run
result are in `github_actions_ci_reconciliation.md`.
