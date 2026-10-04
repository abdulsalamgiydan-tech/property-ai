# V7C — CI workflow (real, least-privilege PR gate)

Before V7C the repo had **no test/lint GitHub Actions gate** — all assurance was local-only. `.github/workflows/ci.yml`
adds a real PR gate.

## What runs (on every `pull_request`)
1. **Deterministic install** — `npm ci` (lockfile-exact).
2. **ESLint** — `npm run lint`.
3. **TypeScript** — `npm run typecheck:ci` (see scope below).
4. **Vitest** — `npm test` (includes the PGlite migration/static validation tests, e.g. `062`/`063`).
5. **Build** — `npm run build` (`next build`).
6. **RLS/security checker** — `npm run warehouse:rls:check`.
7. **Secret scan** — `npm run security:secrets:check` (source + built artifacts + source maps).

## Least-privilege + supply-chain hardening
- `permissions: contents: read` only — **no** write, deploy, PR/issue, or package permissions.
- **No secrets referenced**, no database access, no Production env, no deploy capability. `next build` runs
  with only `NEXT_TELEMETRY_DISABLED=1` (the local build already compiles without Production credentials).
- Actions **pinned to full commit SHAs** (`actions/checkout` v4.2.2 `11bd719…`, `actions/setup-node` v4.1.0
  `39370e3…`) with the version in a trailing comment.
- `concurrency` cancels superseded runs; `timeout-minutes: 25` bounds the job.

## Truthful TypeScript gate (no hidden errors)
`tsc` under `strict` currently reports **40 `error TS` diagnostics — all in `*.test.ts(x)` files** (39
pre-existing warehouse/app test-harness typing issues + 1 introduced-and-fixed here). **Shipping source
(`app/`, `lib/`, `components/`, non-test `warehouse/`) typechecks with ZERO errors.** `next build` already
ignores test files, so it never surfaced this debt.

Rather than hide the errors (e.g. blanket-skipping tsc) **or** make a broad, risky edit across unrelated
warehouse test files, the gate uses **`tsconfig.ci.json`** which extends the base config and excludes
`**/*.test.ts(x)`. This is a **documented, narrow scope**: it proves everything that ships is type-safe, and
it does not pretend the test-file debt doesn't exist.

**Tracked exclusion → follow-up issue (Abdul to open / assign):**
> "CI TypeScript: clear 39 pre-existing `error TS` diagnostics in `*.test.ts` files so the CI gate can
> typecheck tests too." Affected files (error counts): `warehouse/scripts/orchestration/refresh_lib.test.ts` (10),
> `warehouse/scripts/quality/check_rls_policies.test.ts` (7), `warehouse/scripts/lineage/lineage_service.test.ts` (7),
> `warehouse/scripts/snapshot/snapshot.test.ts` (3), `warehouse/config/refresh_registry.test.ts` (3),
> `app/api/research/copilot/route.test.ts` (3), `warehouse/scripts/quality/rule_engine.test.ts` (2),
> `lib/warehouse/export.test.ts` (2), `warehouse/scripts/geography/build_2016_2021_geography_bridge.test.ts` (1),
> `app/api/v1/search/route.test.ts` (1). Each should be fixed at the test-harness typing level (mock/spread
> signatures, `TimeseriesRowV2` shape), not by loosening `strict`.

When that issue is closed, drop the `exclude` in `tsconfig.ci.json` (or point the gate at the base config) so
CI typechecks tests as well.

## Local parity
Every CI step maps to a script runnable locally: `npm run lint`, `npm run typecheck:ci`, `npm test`,
`npm run build`, `npm run warehouse:rls:check`, `npm run security:secrets:check`.
