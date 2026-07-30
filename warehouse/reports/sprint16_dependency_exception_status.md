# Sprint 16 Dependency Exception Status

Date: 2026-07-25
Exception expiry: 2026-08-24

## Current Gate Status

- `npm audit --omit=dev --audit-level=high`: passed with 0 vulnerabilities.
- Full `npm audit --audit-level=high`: failed on the approved dev/tooling dependency exception.

## Remaining Full-Audit Findings

The full audit still reports high-severity `brace-expansion` and dependent `minimatch` paths through development/build tooling chains, plus a moderate `uuid` advisory under the ExcelJS/archiver chain.

Observed examples:

- `eslint` / `@eslint/config-array` / `@eslint/eslintrc` / `eslint-config-next` paths
- `@typescript-eslint/typescript-estree` path
- `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react` paths
- `exceljs` via `archiver`, `archiver-utils`, `glob`, `readdir-glob`, `minimatch`, `brace-expansion`

Production-only install reachability check:

- `npm ls ... --omit=dev` showed only `next` and `@vercel/analytics` in the queried package set.
- The high-severity audit gate with dev dependencies omitted passed.

## Exception Controls

- Exception owner: Abdul / Propellect release owner.
- Exception expiry: 2026-08-24.
- Hard release gate: `npm audit --omit=dev --audit-level=high` must continue to pass.
- Immediate reconsideration triggers:
  - Any high-severity finding appears in `npm audit --omit=dev --audit-level=high`.
  - A vulnerable package becomes reachable in Production runtime output.
  - A compatible non-breaking parent package upgrade becomes available.
  - Next.js, ESLint, ExcelJS, or related tooling receives a compatible patch path.

## Decision

Dependency exception status: ACCEPTED, TIME-LIMITED.

Core Production deployment remains acceptable under the approved exception because the production-only high-severity audit passes.
