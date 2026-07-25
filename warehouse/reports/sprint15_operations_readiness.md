# Sprint 15 — Operations Readiness

Status of the three previously-deferred Tier 4 workstreams
(WS13 refresh engine v4, WS14 data-quality monitoring, WS15 ops
console v2), completed this sprint.

## Method: investigate before building

All three were re-investigated from scratch before writing any code,
since Sprint 14's deferral reasoning ("needs real scoping work") turned
out to be only partly accurate — the existing infrastructure
(`refresh_engine_v2.mjs`, `refresh_engine_v3.mjs`, the quality rule
engine, `getQualitySummary()`/`v_quality_summary_v1`) was more mature
and closer to app-safe exposure than initially assessed. Building
blind against the Sprint 14 deferral notes would have either
duplicated existing capability or missed a much smaller, safer, real
gap.

## WS13 — Refresh Engine V4

**What already existed**: v2 (build/validate/branch-load, resumable,
locked) and v3 (adds a blocking quality gate, freshness updates,
dependency-aware selection, domain/jurisdiction filtering, stale
selection, bounded retry) — both mature, tested, dry-run-by-default.

**The real gap**: an operator answering "is it safe to run a refresh
right now, and has anything gotten worse recently?" had to separately
run `plan_refresh.mjs`, `run_quality_check.mjs`, and
`check_freshness.mjs` and mentally combine the output.

**What v4 adds**: exactly one new command, `--summary`, composing
dataset selection + current freshness counts + a quality-run trend
(comparing the latest run against the previous one) into one read-only
report (text or `--json`). **v4 defines no `--execute` flag of its
own** — running a refresh remains exclusively v3's job. No paid
scheduling introduced (still a manually-invoked CLI command). No
external notification service (stdout/JSON only).

**Verification**:
- Trend-computation logic (`refresh_v4_lib.mjs`) is pure and unit
  tested (14 tests) without needing a live DB.
- Process-safety tests (8) verify the production hard-stop, the
  absence of any execute path, and clean failure when
  `WAREHOUSE_VALIDATION_DB_URL` is unset — all live-run via `spawnSync`,
  matching v3's own test convention (CI doesn't provision this DB
  credential, so live-DB-dependent modes are verified manually instead
  of in an automated test that would be flaky in CI).
- **Live-verified end to end** against the real `warehouse-validation`
  branch this session, both text and `--json` output modes — actual
  output:
  ```
  Datasets in scope: 25
  Latest quality run: 2026-07-22T12:21:14.868Z
  Rules passed: 32 / 35, Blocking failures: 0 (trend: stable)
  Recommendation: no blocking quality failures recorded in the latest run
  ```

## WS14 — Automated Data-Quality Monitoring

**What already existed**: `getQualitySummary()` (app-layer function)
and its backing view `v_quality_summary_v1` — already safely
anon-readable, already exposed via the public `/api/v1/quality` route
— but **never surfaced in any internal UI**. Same unused-capability
shape as Sprint 14 WS19's `profile_opened` finding.

**What was built**: wired `getQualitySummary()` into the internal ops
console (below) — zero new credentials, zero new database access
pattern, using infrastructure that was already safe and already tested.

**"Automated" scope, honestly stated**: true automated alerting (e.g.
a scheduled job that pages someone when a blocking rule fails) is
explicitly out of scope per this sprint's "no paid scheduling, no
external notification services" constraint. What this delivers instead
is: real-time visibility (the ops console section) plus trend detection
(v4's `--summary`, comparing runs over time) — monitoring in the sense
of "an operator or a future automated system has a single place to
check," not in the sense of "pages a human automatically."

## WS15 — Ops Console V2

**What already existed**: Sprint 11's console at
`/research/data-status` — operations summary (dataset counts, branch
size, run counts), per-dataset freshness table, refresh-run history.

**What was added**: one new section, "Data quality monitoring" —
active/blocking/advisory rule counts, the latest run's pass rate
(colour-coded), open incidents (with the blocking-incident count
called out separately), total quarantined rows, and a visible warning
banner when a blocking rule is currently failing. Purely additive —
every existing section is unchanged.

**Verification**: `npx eslint` clean; part of the 442-test suite that
passed in full (no dedicated new test — this is a page-composition
change using an already-tested data-fetching function,
`getQualitySummary()`, consistent with this codebase's established
convention of not adding React component tests for pure composition
changes).

## Combined operational value

An operator now has, for the first time in one place: whether it's
currently safe to run a refresh (v4 `--summary`), the live state of
that assessment reflected in the internal UI (ops console v2's new
section), and no new paid infrastructure, credential, or external
dependency introduced to get there.
