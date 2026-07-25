# Sprint 15.3 Dependency Release Exception

Date: 2026-07-25
Owner: Abdul
Expiry: 2026-08-24

## Exception Summary

A time-limited release exception is recommended for the remaining full-install `npm audit --audit-level=high` findings because all remaining high-severity paths are development or warehouse tooling only and are excluded from production installs.

This exception does not apply to production dependencies. Production-only audit now passes at high severity.

## In-Scope Advisories

| Advisory | Affected paths | Reason exception is defensible |
| --- | --- | --- |
| `GHSA-mh99-v99m-4gvg` (`brace-expansion` DoS) | ESLint parser/config/plugin chains via `minimatch`; `exceljs > archiver/readdir-glob/glob > minimatch` | Dev/warehouse-only; excluded by `npm ci --omit=dev`; absent from `.next/server` and `.next/static`; no production route imports the affected tooling. |
| Derived npm audit nodes for `minimatch`, `eslint`, `eslint-config-next`, ESLint plugins, `glob`, `archiver`, `archiver-utils`, `readdir-glob`, `rimraf`, `zip-stream`, `exceljs` | Same chains as above | These are dependency-path nodes caused by the `brace-expansion/minimatch` advisory and remain outside production runtime. |

Moderate retained advisory: `GHSA-w5hq-g745-h8pq` (`uuid`) via `exceljs`, also dev/warehouse-only.

## Exception Criteria Check

| Criterion | Result |
| --- | --- |
| Advisory remains only in devDependencies/tooling | Pass |
| `npm ci --omit=dev` excludes affected dependency | Pass for remaining exception paths |
| Affected code absent from production browser/server output | Pass |
| No production runtime route imports it | Pass |
| No user-controlled production input reaches it | Pass |
| Functional and security checks remain green | Pass |
| No compatible non-breaking fix currently available | Pass |
| Named owner, expiry and remediation trigger defined | Pass |

## Compensating Controls

- Production installs must use `npm ci --omit=dev` or Vercel’s equivalent production dependency pruning.
- Keep `npm audit --omit=dev --audit-level=high` as a hard release gate.
- Keep full `npm audit --audit-level=high` visible as a tracked dev/tooling risk until fixed.
- Do not run warehouse XLSX ingestion against untrusted arbitrary uploads; current warehouse scripts operate on controlled source datasets and local operator execution.

## Remediation Triggers

Revisit immediately if any of the following becomes true:

- A compatible ESLint/Next/plugin release removes the vulnerable minimatch/brace-expansion chain.
- A compatible `exceljs` or replacement XLSX parser removes the vulnerable archiver/glob chain without breaking warehouse scripts.
- Any affected package moves into `dependencies`.
- Any production route imports `exceljs`, ESLint tooling, `archiver`, `glob`, `minimatch`, or `brace-expansion`.
- `npm audit --omit=dev --audit-level=high` fails again.

## Review Date

Review no later than 2026-08-24, or earlier if one of the remediation triggers occurs.
