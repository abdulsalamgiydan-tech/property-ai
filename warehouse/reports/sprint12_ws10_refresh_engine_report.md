# Sprint 12, Workstream 10 — National Refresh Engine v3

## Design decision: extend v2, don't rewrite it

`refresh_engine_v2.mjs` (Sprint 11 WS14) already has real, tested
dry-run-default, production-hard-refusal, run-locking, and resumable
checkpoint logic (12 passing tests). Rewriting it would have thrown away
proven, working code for no benefit. `refresh_engine_v3.mjs` instead
wraps v2 as a subprocess and layers on exactly what WS9's own findings and
this workstream's investigation showed was genuinely missing:

1. **A blocking quality gate.** After a branch-load attempt, v3 runs WS9's
   `run_quality_check.mjs --execute`. Any BLOCKING rule failure marks the
   run `promotion_blocked` (not `succeeded`) and exits non-zero — this is
   the literal implementation of "no continuation after a material
   blocking quality failure." v2 had no such gate at all.
2. **Freshness updates.** WS9 found all 7 tracked datasets stuck at
   `manual_review` specifically because nothing had ever run through a
   tracked orchestrator execution. v3 calls Sprint 10's
   `check_freshness.mjs --execute` after every successful promotion.
3. **Dependency-aware `--affected-by=<dataset_id>`.** The registry already
   stored a `depends_on` graph per dataset (Sprint 11) but nothing ever
   traversed it. `refresh_lib.affectedDatasets()` does real transitive
   graph traversal — live-verified against the actual registry: a
   geography change affects 24 downstream datasets; a rate change affects
   only the 2 snapshot datasets that use it; a rent change never pulls in
   unrelated sales-only datasets.
4. **`--domain=<category>` filtering** — maps directly onto the registry's
   pre-existing `category` field.
5. **`--stale` selection**, querying `meta.dataset_freshness_status`.
6. **Bounded retry with exponential backoff** around script execution
   (v2 had none — a single transient network blip failed the whole
   dataset).

## A real, previously-undiscovered gap found while building this

Two separate id namespaces have existed side by side without ever being
reconciled: `refresh_registry.mjs`'s own `dataset_id` (e.g.
`nsw_sales_full_state`) and `meta.dataset.dataset_id` (e.g.
`nsw_psi_2001_current_full_state`) — the SAME underlying dataset, two
different identifiers, no mapping between them. This meant `--stale`
selection was **silently broken from the moment it was written** — it
would have always returned 0 results, since it compared registry ids
against `meta.dataset_freshness_status` rows that use the other namespace
entirely (confirmed live: the first `--stale` test run returned 0/20
datasets even though 7 real datasets were genuinely stale). Fixed by
adding a `meta_dataset_ids` field to every registry entry with a known
correspondence (17 of 25 entries — the rest are derived/combined-loader
datasets with no single source dataset to map to, left honestly unmapped
rather than guessed) and re-verified live: `--stale` now correctly selects
4 real stale datasets.

## Second gap found and fixed: Sprint 12's own datasets were never registered

`asgs_geography_backbone` through `vic_market_intelligence_snapshot` (20
entries) were all this registry ever knew about — every dataset built in
Sprint 12 (TAS/ACT/NT sales, dwelling construction activity, the
2016-2021 boundary bridge, the WS6 national snapshot rollup, WS8's
lineage registry) existed as working, individually-tested scripts but had
**zero orchestrator awareness**. Added 5 new registry entries with correct
tiers/dependencies (verified against the existing dependency-ordering
test, which passes with all 25 entries).

## Validation

- `npm test`: 148/148 pass (24 new — 14 for `refresh_lib.mjs`'s pure
  functions covering all 4 real-world dependency scenarios named in the
  mission: geography change invalidates transitively, rate change affects
  only affordability outputs, rent change doesn't pull in unrelated
  supply, a leaf dataset only affects itself; plus retry/backoff
  behaviour — immediate success, transient-failure retry with the correct
  exponential delays, exhausting retries, and NOT retrying a deterministic
  failure like a SQL syntax error; 10 for `refresh_engine_v3.mjs` — safety
  pattern checks plus live subprocess tests against the real registry).
- `warehouse/config/refresh_registry.test.ts`'s pre-existing 6 tests (no
  duplicate ids, valid depends_on references, correct tier ordering,
  every dataset has at least one script, known jurisdictions, every
  referenced file exists on disk) all still pass with 25 entries (up from
  20).
- Live-verified `--plan`, `--domain=`, `--affected-by=`, `--stale`, and
  `--status` against the real registry and branch (not just mocked).
- Live-verified `--validate` against the real branch: connects, runs the
  WS9 quality gate read-only, reports PASSED (0 blocking rules currently
  fail) — this is the one `--execute`-adjacent path that needed no local
  raw data and was safe to run for real this workstream.
- `npm run warehouse:check` / `lint` (0 errors, 6 pre-existing warnings) /
  `build`: all pass.
- Production (`oshquaxsloolqucwvigc`): re-confirmed zero warehouse schema
  tables.

## Deliberately not exercised live

A full `--execute --branch-load` run was not performed this workstream —
most registry datasets need gitignored local raw source files that are
either not present for every dataset in this environment, or would
trigger real (slow, sometimes rate-limited or CAPTCHA-protected)
downloads. The orchestrator's SELECTION and SAFETY logic (what v3 actually
adds) is fully tested; the underlying build/branch-load scripts it
dispatches to were each individually validated in their own prior
workstream and are unchanged by this one.

## Scheduling — designed, not activated

`warehouse/docs/REFRESH_SCHEDULING_DESIGN.md` — Windows Task Scheduler and
GitHub Actions cron designs for a human to review. Nothing is activated:
no scheduled task registered, no cron workflow added to this repository.
Recommended first real automation step (if a human chooses): schedule only
`warehouse:refresh:validate` (read-only, no local raw data needed) —
everything else needs the raw-data-download gap addressed first.

## Files

- `warehouse/scripts/orchestration/refresh_engine_v3.mjs` (new)
- `warehouse/scripts/orchestration/refresh_lib.mjs` (new — pure,
  independently testable dependency-graph and retry logic)
- `warehouse/scripts/orchestration/refresh_engine_v3.test.ts`,
  `refresh_lib.test.ts` (new)
- `warehouse/config/refresh_registry.mjs` (extended — `meta_dataset_ids`
  on 17 entries, 5 new Sprint 12 dataset entries, updated `REGISTRY_NOTES`)
- `warehouse/docs/REFRESH_SCHEDULING_DESIGN.md` (new)
- `package.json` — 9 new `warehouse:refresh:*` scripts

## Exact next workstream

Per the mission's own sequencing, the Foundation Block (WS3/WS4/WS6/WS8/
WS9/WS10) is now complete. Next: Foundation Block final validation (clean
worktree/clone reproduction, cross-workstream consistency checks) and the
consolidated `sprint12_foundation_block_report.{md,json}`.
