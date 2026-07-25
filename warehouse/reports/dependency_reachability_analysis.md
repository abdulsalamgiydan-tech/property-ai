# Sprint 15.3 Dependency Reachability Analysis

Date: 2026-07-25

## Production Install Result

A disposable production-only install was created under `C:\tmp` using only `package.json` and `package-lock.json`.

Before remediation:

- `npm ci --omit=dev` installed 168 production packages.
- `npm audit --omit=dev --audit-level=high` failed on `next > postcss` and `next > sharp`.

After remediation:

- `npm ci --omit=dev` installed 169 production packages in the override test.
- `npm audit --omit=dev --audit-level=high` returned `found 0 vulnerabilities`.
- Evidence:
  - `prod_install_audit_omit_dev_high.txt`
  - `override_test_audit_omit_dev_high.txt`
  - `final_npm_audit_omit_dev_high.txt`
  - `prod_install_focus.json`
  - `override_test_focus.json`

## Runtime Reachability

| Package/finding | In `dependencies`? | In `devDependencies`? | Present in `npm ci --omit=dev` after remediation? | Present in built app output? | Production route imports it? | User-controlled input reaches vulnerable code? | Conclusion |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `next > postcss` | Yes via `next` | No | Yes, patched to `8.5.23` | Framework server/build metadata only | No direct app import | No user CSS/source-map input is accepted | Production-reachable dependency patched |
| `sharp` | Yes via `next` optional dependency | No | Yes, patched to `0.35.3` | Framework dependency metadata only | No `next/image` import found | No app image-transform route found | Production-reachable dependency patched |
| `eslint`, `eslint-config-next`, ESLint plugins | No | Yes | No | No | No | No | Dev-only exception candidate |
| `brace-expansion/minimatch` under ESLint | No | Yes, via lint tooling | No | No | No | No | Dev-only exception candidate |
| `exceljs` | No | Yes | No | No | No app import; only `warehouse/scripts/**` | No production HTTP surface | Warehouse/dev-only exception candidate |
| `archiver/glob/readdir-glob/rimraf/zip-stream` under `exceljs` | No | Yes, via `exceljs` | No | No | No app import | No production HTTP surface | Warehouse/dev-only exception candidate |

## Source Inspection

`exceljs` imports are limited to `warehouse/scripts/**` local data ingestion/build scripts and documentation/report references. No `app/**`, `components/**`, or `lib/**` production route imports `exceljs`.

No `next/image` imports or `<Image>` component usage were found in `app`, `components`, or `lib`; `sharp` remains a Next optional runtime dependency but is now patched.

## Built Artifact Inspection

The production build was scanned after `npm run build`.

- Changed-file secret scan: passed.
- Built-artifact secret scan over `.next/server` and `.next/static`: passed.
- No service-role key assignment, Vercel bypass header assignment, private key, credentialed Postgres URL, or Supabase JWT-like token was detected in production build output.

## Reachability Conclusion

The initial production-reachable high-severity findings were `next > postcss` and `sharp`. Both are remediated by a narrow `next`-scoped override and verified by production-only audit.

The remaining high-severity findings are excluded by `npm ci --omit=dev`, absent from production build artifacts, and limited to lint/warehouse tooling with no production user-input path.
