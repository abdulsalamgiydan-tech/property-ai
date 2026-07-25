# Sprint 15.3 Dependency Remediation Results

Date: 2026-07-25

## Retained Fix

Added a narrow `next`-scoped override:

```json
{
  "overrides": {
    "next": {
      "postcss": "8.5.23",
      "sharp": "0.35.3"
    }
  }
}
```

This is intentionally scoped to the vulnerable production dependency owner (`next`) and does not force a broad package override across unrelated tooling.

## Why This Fix Is Acceptable

| Package | Previous version | Retained version | Reason |
| --- | --- | --- | --- |
| `next > postcss` | `8.4.31` | `8.5.23` | Patches the PostCSS advisories while preserving PostCSS 8 API compatibility. |
| `sharp` | `0.34.5` | `0.35.3` | Patches libvips-related advisory; supports current Node (`>=20.9.0`). Current runtime is Node `v24.14.1`. |

Disposable override testing showed `npm audit --omit=dev --audit-level=high` returned `found 0 vulnerabilities`.

## Rejected Fixes

| Candidate | Reason rejected |
| --- | --- |
| `npm audit fix --force` | Proposes breaking changes including downgrades such as `next@9.3.3`, `eslint-config-next@12.0.4`, and `exceljs@3.4.0`. Prohibited by release rules. |
| Broad `brace-expansion` override | Previously broke ESLint/minimatch compatibility with `expand is not a function`. Also no compatible patched v1/v2 `brace-expansion` release exists for older minimatch lines. |
| Upgrade `eslint` to `10.8.0` | Previously broke current ESLint plugin compatibility (`contextOrFilename.getFilename is not a function`) and produced invalid peer dependency ranges. |
| Downgrade `eslint-config-next` to `12.0.4` | Incompatible with the Next 16 application release line and would be a high-risk regression. |
| Downgrade `exceljs` to `3.4.0` | Audit proposes a lower major version; this is not a safe remediation for warehouse XLSX processing. |
| Replace `exceljs` | Not justified for this release because it is dev/warehouse-only and excluded from production installs. Replacement would be larger scope than the release blocker. |

## Validation Results

| Command/check | Result |
| --- | --- |
| `npm ci` | Pass; deterministic install from updated lockfile |
| `npm run lint` | Pass with 6 existing warnings, 0 errors |
| `npm run test` | Pass; 50 files, 447 tests |
| `npm run build` | Pass |
| `npm run warehouse:check` | Pass |
| `npm run warehouse:rls:check` | Pass |
| `npm run warehouse:lineage:check` | Pass; 88/88 lineage combinations |
| `npm audit --omit=dev --audit-level=high` | Pass; `found 0 vulnerabilities` |
| `npm audit --audit-level=high` | Fails only on dev/tooling paths documented in exception |
| Changed-file secret scan | Pass |
| Built-artifact secret scan | Pass |

## Package-Lock Scope

The lockfile churn is limited to the retained runtime override:

- `next/node_modules/postcss` updated to `8.5.23`.
- `sharp` updated to `0.35.3`.
- `sharp` platform optional packages and libvips packages updated accordingly.
- No broad minimatch/brace-expansion override was retained.
