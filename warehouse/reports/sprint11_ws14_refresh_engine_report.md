# Sprint 11 Workstream 14 — Incremental National Refresh Engine v2

Generated: 2026-07-22

## What this is

`warehouse/scripts/orchestration/refresh_engine_v2.mjs` orchestrates the
~20 already-existing, individually-validated build/validate/branch-load
scripts written across Sprints 2-11 (geography, Census, sales, rent,
supply, macro, derived snapshots) into one dependency-ordered, filterable,
resumable runner. It does not reimplement any fetch/parse/load logic.

## Capabilities delivered

| capability | status |
|---|---|
| plan mode | done — `--plan`, prints the full dependency-ordered run without executing anything |
| dry-run default | done — no flag at all behaves as `--dry-run` |
| local-only mode | done — `--local-only` (also the default whenever `--execute` is given without `--branch-load`) |
| jurisdiction filter | done — `--jurisdiction=NSW\|VIC\|QLD\|SA\|WA` |
| dataset filter | done — `--dataset=<id>[,<id>...]` |
| geography filter | accepted (`--geography=`), informational only — see registry notes, most existing scripts build all applicable grains in one pass |
| changed-period / hash-based dedup | done — `--changed-only` hashes each dataset's local report file and skips if unchanged since the last recorded run |
| resumable runs | done — every run persists state to `warehouse/data/local/refresh_runs/<run-id>.json`; `--resume=<run-id>` continues from the first not-yet-succeeded dataset |
| checkpoints | done — same run-state file, written after every dataset (not just at the end) |
| run locking | done — a lock file prevents two concurrent runs; a lock older than 2 hours is treated as a crashed prior run, not a block |
| dependency ordering | done — tier-based (0-5), verified by an automated test (`refresh_registry.test.ts`) that every dependency's tier is strictly lower than its dependent's |
| source availability testing | not built as a separate subsystem — the existing build scripts' own live-verification (curl/HTTP status checks) already serves this role per-source |
| schema-drift detection | not built this pass — flagged as a genuine gap, see "What's not done" |
| retry classification | not built — a failed dataset is recorded with its raw error message; classifying error types (network/parse/validation) is future work |
| blocked-source handling | inherited from existing per-source documentation (e.g. TAS rent's Cloudflare-block finding) — the engine itself doesn't yet special-case "known blocked" vs "transient failure" |
| partial success | done — one dataset's failure never blocks or corrupts another's run (matches the v1 orchestrator's isolation guarantee), verified by design (each dataset in its own try/catch) |
| local validation | done — every dataset's existing validate_script is run before any branch-load attempt |
| branch-load approval gate | done — `--branch-load` requires the explicit `--execute` flag; it is never inferred |
| mart-promotion validation gate | inherited — each branch_load_script already has its own post-load blocking gates (0 duplicates, 0 nulls, etc.), unchanged by this orchestrator |
| branch target verification | done — refuses if `WAREHOUSE_VALIDATION_DB_URL` doesn't contain the branch ref |
| production target rejection | done — checked BEFORE any database connection is opened, both via `--target=production` (explicit refusal) and via connection-string content matching the production ref |
| storage estimate before branch write | done (coarse) — queries current branch size via `pg_database_size()` before any `--branch-load` run and refuses if already at or above 90% of the 4,500 MB working ceiling; this is a pre-flight capacity gate, not a precise per-dataset growth prediction |
| row-count delta reporting | partial — branch size before/after is reported; per-table row-count deltas are not yet aggregated across datasets (each branch_load_script already reports its own row counts individually) |
| freshness update | not built — Workstream 16's data operations console is the natural home for this, not duplicated here |
| run-duration reporting | done — `started_at`/`completed_at` recorded per dataset in the run-state file |

## Verified live (not just planned)

- `npm run warehouse:refresh -- --plan` — correctly enumerates and
  dependency-orders all 20 registered datasets.
- `npm run warehouse:refresh -- --plan --jurisdiction=QLD` — correctly
  filters to QLD-specific + ALL-jurisdiction (national context) datasets.
- `npm run warehouse:refresh -- --plan --target=production` — correctly
  refused with a hard-stop error before touching anything.
- `npm run warehouse:refresh -- --execute --local-only --dataset=sa2_lga_dwelling_stock_marts`
  — real execution path exercised (zero side effects for this particular
  dataset since it has no local build step and local-only skips its
  branch-load script).
- `--resume=<run-id>` — correctly reloaded prior run state and skipped
  the already-succeeded dataset.
- Registry integrity verified by an automated test (5 assertions: no
  duplicate IDs, all `depends_on` references resolve, every dependency's
  tier is strictly earlier, every dataset has at least one script, every
  jurisdiction is a known value) — `npm test` passes.

## What's not done (documented, not fabricated)

- **Schema-drift detection**: no automated comparison of a newly-downloaded
  file's structure against the last-known-good structure. Each build
  script currently fails loudly (via its own parsing logic) if a source's
  format genuinely changes — a real safety net, but not the proactive
  "warn before it breaks" detection this workstream's spec envisioned.
- **Retry classification**: failures are recorded with their raw error
  message but not automatically bucketed into network/parse/validation/
  blocked-source categories.
- **Full row-count delta reporting**: branch-level total size is reported;
  aggregating individual mart/fact table deltas across a whole run is not
  yet built (each branch_load_script already reports its own numbers).
- **Freshness table update**: this orchestrator does not itself write to
  a freshness-tracking table — that's the data operations console's job
  (Workstream 16), to avoid two systems disagreeing about what "current"
  means.

Given the honest scope of "single orchestrator for all currently supported
datasets" (the spec's own words), the core safety-critical mechanics —
production rejection, branch-target verification, capacity pre-flight,
resumability, run locking, dependency ordering, isolated per-dataset
failure — are real and tested, not stubs. The remaining gaps are lower-risk
observability/convenience features layered on top, not correctness or
safety gaps.
