# Comprehensive Testing Across New Work (Sprint 11, Workstream 19)

Honest split: what got genuine new automated test coverage this workstream,
vs. what remains covered only by the live, one-off audits already performed
in WS16/WS17 and documented in their reports.

## New automated coverage added this workstream

### `warehouse/scripts/orchestration/refresh_engine_v2.test.ts` (new, 12 tests)

Integration tests that spawn the **real** orchestrator script as a
subprocess (not a mock/reimplementation), using `--dataset=__nonexistent_test_id__`
wherever `--execute` is needed so `selectDatasets()` returns an empty list —
this proves every safety gate and orchestration behaviour below without
ever invoking a real build/validate/branch-load script (no download, no DB
write):

- Production rejection: `--target=production` refused outright; a
  connection string containing the production ref refused; `--branch-load`
  refused with no connection string configured; `--branch-load` refused
  with a connection string that isn't the validation branch ref.
- Argument validation: `--branch-load` requires `--execute`; `--plan`
  creates no lock file; `--dry-run` is the correct default mode.
- Run locking: a fresh lock blocks a second concurrent run (exact error
  message and offending run_id/pid checked); a lock older than 2 hours is
  correctly treated as stale and bypassed, and the lock is released again
  on clean exit.
- Resumability: `--resume=<unknown-id>` fails clearly; a completed run's
  state file can be resumed and correctly reports how many datasets already
  succeeded.
- Dataset selection: a filter matching zero datasets produces an honest
  "0 selected" summary rather than a crash.

**Not covered by these tests** (would require either a real dataset's
build script to actually run, or a live DB connection):
`--changed-only` hash-skip behaviour against a real `local_report` file,
and the capacity pre-flight's actual `pg_database_size` query path (the
guards that run *before* that query — missing/wrong connection string —
are tested; the query itself is not, since no DB credentials are available
in this environment for automated tests).

### `warehouse/config/refresh_registry.test.ts` (extended, +1 test, 6 total)

Added a drift-detection test: every `build_script`/`validate_script`/
`branch_load_script`/`local_report` path referenced by any of the 20
registry entries must actually exist on disk. This is the kind of gap that
would otherwise only surface mid-refresh, on whichever dataset happens to
be affected — now it fails fast in CI on any commit that renames or
deletes a script without updating the registry.

### `lib/warehouse/env.test.ts` (extended, +8 tests, 14 total)

`isDataOperationsEnabled()` and `isScenarioLabEnabled()` (WS18) — same
absent/invalid/valid/independence pattern as the existing flag tests.

## Total automated test count

72 tests across 6 files (was 53 at the start of this workstream), all
passing. `npm run warehouse:check`, `npm test`, and `npm run build` all
pass clean.

## What remains covered only by live audit, not repeatable automated tests

These were genuinely exercised and verified — via the Supabase MCP
`execute_sql` tool against the live `warehouse-validation` branch — in
WS16/WS17, but the verification isn't captured as a test that re-runs in
CI, because CI has no database credentials for this project (a deliberate
constraint — no secrets configured for the warehouse's own workflows other
than the manual, `workflow_dispatch`-gated branch-load path):

- **Response/row limits**: search clamped 1-50, compare 2-10 geographies,
  map markers bounding-box + 1-1500 row limit — verified live in WS11/WS12,
  re-confirmed by inspection (not re-executed) in WS17's security audit.
- **Grants/security boundary**: `anon`/`authenticated` have zero grants on
  `core`/`mart`/`meta`/`staging`, SELECT-only on the 8 public views — live
  audit in WS17 (`database_security_audit.md`), fixed one real gap
  (migration 023), re-verified live after the fix.
- **NULL semantics**: "has_full_snapshot" and rent-fallback NULL-handling
  bugs found and fixed via live testing in WS11 (see the map explorer's bug
  fixes documented in that workstream's commit).
- **Export correctness**: CSV/JSON/print verified via a live browser test
  in WS13, not a unit test (the export functions are pure client-side
  `Blob` operations against already-rendered page data).
- **Migration safety**: migrations 018-024 were each applied live via the
  Supabase MCP `apply_migration` tool and manually verified against the
  branch schema at application time; WS20 is the dedicated pass to review
  and consolidate all of them together (not yet done as of this
  workstream).
- **Branch capacity**: measured live in WS1 and re-checked at intervals via
  MCP throughout the sprint; the orchestrator's pre-flight gate (this
  workstream's tests confirm the guards *before* the query) is real but
  untested end-to-end without a live connection.

**Recommendation for a future pass**: if CI is ever given a scoped,
read-only credential to the validation branch specifically (never
production), the response-limit and NULL-semantics checks above could
become real `EXPLAIN`/assertion-based integration tests instead of one-off
live audits. Not done this workstream — would be a deliberate, human-
reviewed decision to add a database secret to CI, which this project's
"no new credentials without explicit review" posture treats as out of
scope for an autonomous pass.
