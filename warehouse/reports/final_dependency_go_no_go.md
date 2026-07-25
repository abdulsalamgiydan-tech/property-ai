# Sprint 15.3 Final Dependency GO/NO-GO

Date: 2026-07-25
Branch: `feature/sprint14-production-readiness`
Base HEAD at start: `069f12df42b2d990d88b1a4e1c8647bec1306b48`

## Final Answers

| Question | Answer |
| --- | --- |
| Does `npm audit --omit=dev --audit-level=high` pass? | YES |
| Are any high-severity vulnerable packages shipped to Production? | NO, after the retained `next`-scoped `postcss`/`sharp` remediation |
| Are any affected paths reachable through user input? | NO for remaining exception paths |
| Were safe remediations applied? | YES |
| Is a release exception required? | YES, for full-install dev/tooling audit findings only |
| Is the exception defensible and time-limited? | YES, owner Abdul, expiry 2026-08-24 |
| Is PR #23 safe to merge? | CONDITIONAL GO |
| Is Production deployment safe? | CONDITIONAL GO |

## Retained Change

`package.json` now contains a narrow `next`-scoped override:

- `next > postcss` -> `8.5.23`
- `next > sharp` -> `0.35.3`

This remediates the production-reachable high-severity findings without broad overrides, framework downgrades, or forced audit fixes.

## Residual Risk

The remaining full-install audit findings are high-severity but limited to dev/warehouse tooling:

- `GHSA-mh99-v99m-4gvg` through `brace-expansion/minimatch` chains used by ESLint and ExcelJS/archiver.
- Derived npm audit nodes: `eslint`, `eslint-config-next`, ESLint plugins, `glob`, `archiver`, `archiver-utils`, `readdir-glob`, `rimraf`, `zip-stream`, `exceljs`.
- Moderate `GHSA-w5hq-g745-h8pq` through `uuid` via `exceljs`.

These are not production dependencies after `npm ci --omit=dev`, are absent from production build artifacts, and have no production user-input path.

## Validation Summary

| Gate | Result |
| --- | --- |
| Clean `npm ci` | PASS |
| Lint | PASS, 6 warnings |
| Tests | PASS, 447/447 |
| Build | PASS |
| Warehouse check | PASS |
| Warehouse RLS check | PASS |
| Warehouse lineage check | PASS |
| Production-only audit | PASS |
| Full audit | FAILS by design on documented dev/tooling exception |
| Changed-file secret scan | PASS |
| Built-artifact secret scan | PASS |

## Release Classification

Dependency gate: **CONDITIONAL GO**

Conditions:

1. Abdul accepts the time-limited dev/tooling audit exception in `dependency_release_exception.md`.
2. `npm audit --omit=dev --audit-level=high` remains passing in CI or immediately before release.
3. No affected dev/tooling package is moved into production dependencies before merge/deploy.
4. The exception is reviewed by 2026-08-24 or sooner if a remediation trigger occurs.

## Approval Sentence

To proceed with the core release despite the full-install dev/tooling audit exception, Abdul should approve exactly:

`I approve the Sprint 15.3 time-limited dev/tooling dependency audit exception through 2026-08-24, with npm audit --omit=dev --audit-level=high remaining a hard release gate.`
