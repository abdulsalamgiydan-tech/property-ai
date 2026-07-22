# Sprint 12, Workstream 16 — Testing and Clean-Clone Reproduction

## Fresh clean-clone reproduction (dedicated pass, current HEAD `828bff7`)

Cloned the branch fresh into a disposable directory (separate from the
working session, matching the Foundation Block's own validation
convention) at the current HEAD, after all 18 workstreams this session
(WS3-WS15 plus checkpoints):

```
git clone --branch feature/national-residential-research-platform-v1 --single-branch . <disposable dir>
```

- `git log -3` confirms HEAD `828bff7`, `git status --short` clean.
- `npm ci` — succeeds.
- `npm run warehouse:check` — passes, all required files present.
- `npm test` — **155/163 pass, 8 correctly skipped** (the two
  `describe.skipIf(!hasLocalData)` integration test suites —
  `dwelling_construction_activity.test.ts`,
  `build_2016_2021_geography_bridge.test.ts` — correctly detect no
  gitignored raw source files exist in a fresh clone and skip cleanly
  rather than fail).
- `npm run lint` — 0 errors, 6 pre-existing warnings (unchanged).
- `npm run build` — passes; all 40+ routes compile, including every
  route added this session (`/api/v1/*` × 10, `/research/sources`,
  `/research/scenario/[geographyCode]`).
- `warehouse/data/local/` appeared during the test run (created by
  `refresh_engine_v2.test.ts`'s lock-file/resumability tests) — verified
  gitignored (`git check-ignore -v` confirms) and untracked (`git
  ls-files` returns nothing for it) — a genuine runtime artifact, never
  committed.
- No raw data, no secrets tracked (`.env.example` only).

## Migration sequence integrity

All 40 tracked migrations (`003` through `036`, plus the pre-Sprint-2
`remote_schema`) confirmed sequential with **no gaps**, via
`list_migrations` against the live branch — the entire schema state is
reconstructible from this history alone.

## Test suite growth this session

| Session start | Session end | New this session |
|---|---|---|
| 85 tests (10 files) | 163 tests (16 files) | +78 tests, +6 files |

New test files: `rule_engine.test.ts` (18), `quality_scripts_safety.test.ts`
(8), `refresh_lib.test.ts` (14), `refresh_engine_v3.test.ts` (10),
`apiV1.test.ts` (8), `export.test.ts` (4), plus additions to existing
`env.test.ts` (+3, `isPublicApiV1Enabled`), `lineage_service.test.ts`,
`validate_metric_lineage_completeness` refactor tests.

## What this project's test suite deliberately does NOT do (and why, not silently)

- **No mocked-database "integration" tests for branch-write scripts** —
  every write script's real behaviour is verified live against the
  actual branch (documented in each workstream's own report: dry-run
  checks, idempotency checks via repeated live runs, post-write
  independent re-queries) rather than a mock that could silently diverge
  from real Postgres behaviour. This matches this project's own
  standing "don't mock the database" convention.
- **No React component unit tests** — this codebase has no established
  pattern for testing React components in isolation (no existing
  `*.test.tsx` files at session start, none added this session either).
  UI correctness for WS7/WS12's new components was instead verified via
  live browser sessions against a real running dev server (documented in
  each workstream's report) — consistent with the project's own
  "start the dev server and use the feature in a browser" convention for
  frontend changes, not a gap silently left uncovered.
- **No test-count padding** — every new test asserts something that
  could plausibly fail (a deliberately wrong input, a genuine edge case,
  a real regression this session found and fixed) rather than trivial
  assertions chasing a target number.

## Validation

- Clean clone: pass (see above).
- Migrations: sequential, no gaps.
- Production: unaffected by this workstream (read-only verification pass).

## Exact next workstream

WS17 — documentation and operations.
