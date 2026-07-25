# Sprint 15.3 Dependency Security Inventory

Date: 2026-07-25
Branch: `feature/sprint14-production-readiness`
Baseline HEAD: `069f12df42b2d990d88b1a4e1c8647bec1306b48`

## Captured Evidence

Machine-readable and command-output evidence was captured under `warehouse/reports/dependency_security_artifacts/`.

| Command | Evidence file | Result |
| --- | --- | --- |
| `node --version` | `node_version.txt` | `v24.14.1` |
| `npm --version` | `npm_version.txt` | `11.11.0` |
| `npm audit --json` | `npm_audit.json`, `final_npm_audit.json` | Reproduced findings |
| `npm audit --audit-level=high` | `npm_audit_high.txt`, `final_npm_audit_high.txt` | Fails after remediation only for dev/tooling paths |
| `npm audit --omit=dev --audit-level=high` | `npm_audit_omit_dev_high.txt`, `final_npm_audit_omit_dev_high.txt` | Failed before remediation, passes after remediation |
| `npm ls --all` | `npm_ls_all.json` | Captured clean install graph |
| `npm ls brace-expansion minimatch exceljs eslint next` | `npm_ls_focus.json`, `post_remediation_focus.json` | Captured focused graph |
| `npm explain brace-expansion` | `npm_explain_brace_expansion.txt` | Captured exact dependency paths |
| `npm explain minimatch` | `npm_explain_minimatch.txt` | Captured exact dependency paths |
| `npm explain exceljs` | `npm_explain_exceljs.txt` | Captured exact dependency path |

## High-Severity Advisory Inventory

| Audit node | Advisory identifier | Installed version/path | Patched range or fixed version | Direct? | Prod/dev | Use surface | Production output | User-input reachable | Safe remediation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `postcss` | `GHSA-qx2v-qp2m-jg93`, `GHSA-6g55-p6wh-862q`, `GHSA-r28c-9q8g-f849` | `next > postcss@8.4.31` | `8.5.23` retained | Transitive | Production dependency via `next` | Build/server framework CSS processing | Yes before fix; patched after fix | No app route accepts user CSS/source maps | Fixed by `next`-scoped override |
| `sharp` | `GHSA-f88m-g3jw-g9cj` | `sharp@0.34.5` optional via `next` | `0.35.3` retained | Transitive/optional | Production dependency via `next` | Next image optimization dependency | Yes before fix; patched after fix | No `next/image` imports found; dependency may still ship with Next | Fixed by `next`-scoped override |
| `brace-expansion` | `GHSA-mh99-v99m-4gvg` | `@typescript-eslint/typescript-estree > minimatch > brace-expansion@5.0.7` | `5.0.8` for the v5 line | Transitive | Dev only | ESLint parser tooling | No | No | Exception; parent-compatible safe graph not available without broader tooling risk |
| `brace-expansion` | `GHSA-mh99-v99m-4gvg` | `eslint/@eslint/*/plugins > minimatch@3.1.5 > brace-expansion@1.1.16` | No v1 patched release exists | Transitive | Dev only | ESLint config/plugin glob matching | No | No | Exception; forcing major broke validation previously |
| `brace-expansion` | `GHSA-mh99-v99m-4gvg` | `exceljs > archiver > readdir-glob > minimatch@5.1.9 > brace-expansion@2.1.2` | No v2 patched release exists | Transitive | Dev only | Warehouse local XLSX ingestion scripts | No | No | Exception; warehouse-only, not runtime |
| `minimatch` | Derived from `GHSA-mh99-v99m-4gvg` | `minimatch@3.1.5`, `5.1.9`, `10.2.5` | Audit wants incompatible parent changes | Transitive | Dev only | ESLint and ExcelJS/archiver tooling | No | No | Exception |
| `@eslint/config-array` | Derived from vulnerable `minimatch` | `@eslint/config-array@0.21.2` | Audit suggests `eslint@10.8.0` | Transitive | Dev only | ESLint | No | No | Rejected: ESLint 10 broke plugin compatibility |
| `@eslint/eslintrc` | Derived from vulnerable `minimatch` | `@eslint/eslintrc@3.3.5` | Audit suggests `eslint@10.8.0` | Transitive | Dev only | ESLint | No | No | Rejected: ESLint 10 broke plugin compatibility |
| `eslint` | Derived from vulnerable `minimatch` | `eslint@9.39.4` | Audit suggests `eslint@10.8.0` | Direct dev | Dev only | Lint command | No | No | Rejected: incompatible with current plugin chain |
| `eslint-config-next` | Derived from vulnerable ESLint plugins | `eslint-config-next@16.2.11` | Audit suggests downgrade to `12.0.4` | Direct dev | Dev only | Next ESLint config | No | No | Rejected: downgrade is incompatible with Next 16 release branch |
| `eslint-plugin-import` | Derived from vulnerable `minimatch` | `eslint-plugin-import@2.32.0` | Audit says fix available through parent churn | Transitive | Dev only | ESLint | No | No | Exception |
| `eslint-plugin-jsx-a11y` | Derived from vulnerable `minimatch` | `eslint-plugin-jsx-a11y@6.10.2` | Audit suggests `eslint-config-next@12.0.4` | Transitive | Dev only | ESLint | No | No | Rejected: unsafe downgrade |
| `eslint-plugin-react` | Derived from vulnerable `minimatch` | `eslint-plugin-react@7.37.5` | Audit suggests `eslint-config-next@12.0.4` | Transitive | Dev only | ESLint | No | No | Rejected: unsafe downgrade |
| `glob` | Derived from vulnerable `minimatch` | `exceljs > archiver-utils > glob@7.2.3` | Audit suggests `exceljs@3.4.0` | Transitive | Dev only | Warehouse XLSX scripts | No | No | Rejected: downgrade |
| `archiver-utils` | Derived from vulnerable `glob/minimatch` | `exceljs > archiver > archiver-utils` | Audit suggests `exceljs@3.4.0` | Transitive | Dev only | XLSX read/write support | No | No | Exception |
| `archiver` | Derived from vulnerable `archiver-utils/readdir-glob` | `exceljs > archiver@5.3.2` | Audit suggests `exceljs@3.4.0` | Transitive | Dev only | XLSX tooling | No | No | Exception |
| `readdir-glob` | Derived from vulnerable `minimatch` | `exceljs > archiver > readdir-glob@1.1.3` | Audit suggests `exceljs@3.4.0` | Transitive | Dev only | XLSX tooling | No | No | Exception |
| `rimraf` | Derived from vulnerable `glob/minimatch` | `exceljs > unzipper > fstream > rimraf@2.7.1` | Audit says fix available | Transitive | Dev only | XLSX tooling dependency | No | No | Exception |
| `zip-stream` | Derived from vulnerable `archiver-utils` | `exceljs > archiver > zip-stream@4.1.1` | Audit says fix available | Transitive | Dev only | XLSX tooling dependency | No | No | Exception |

Moderate advisory retained in full audit: `uuid <11.1.1` (`GHSA-w5hq-g745-h8pq`) via `exceljs`. It is dev-only and excluded from production installs.
