# Sprint 12 — Refresh Engine v3 (Summary)

Full detail: `warehouse/reports/sprint12_ws10_refresh_engine_report.md`.
This is the mission-requested summary pointer.

## What shipped

`refresh_engine_v3.mjs` — extends (not rewrites) `refresh_engine_v2.mjs`
(Sprint 11, already tested: dry-run default, production refusal,
locking, resumable checkpoints). Adds:

- A **blocking WS9 quality gate** after branch-load — a blocking rule
  failure marks the run `promotion_blocked`, not `succeeded`.
- **Freshness updates** on every successful promotion.
- **Dependency-aware `--affected-by=<dataset_id>`** — real transitive
  traversal of the registry's `depends_on` graph, live-verified: a
  geography change affects 24 downstream datasets; a rate change affects
  only 2; a rent change never pulls in unrelated supply facts.
- **`--domain=`, `--stale`, bounded retry with exponential backoff.**

## Two real gaps found and fixed while building this

1. `refresh_registry.mjs`'s `dataset_id` and `meta.dataset.dataset_id`
   were two never-reconciled id namespaces — `--stale` would have
   silently returned 0 results forever. Fixed with a `meta_dataset_ids`
   cross-reference field (17 of 25 entries mapped; the rest honestly left
   unmapped, not guessed).
2. Every dataset built in Sprint 12 (TAS/ACT/NT sales, dwelling
   construction activity, the 2016-2021 boundary bridge, WS6's national
   snapshot rollup, WS8's lineage registry) had never been registered —
   the orchestrator had zero awareness of 5 real, working datasets.
   Registered now, with correct tiers/dependencies (verified against the
   registry's own pre-existing dependency-ordering test).

## Validation

148/148 tests pass (24 new this workstream). Live-verified `--plan`,
`--domain=`, `--affected-by=`, `--stale`, `--status` against the real
registry; `--validate` live-verified against the real branch (connects,
runs the WS9 quality gate read-only, PASSED). A full `--execute
--branch-load` run was NOT performed unattended this workstream — most
registry datasets need gitignored local raw source files not uniformly
present in this environment; the underlying build/branch-load scripts
were each individually validated in their own prior workstream.

## Scheduling

Designed, not activated. See `warehouse/docs/REFRESH_SCHEDULING_DESIGN.md`
— Windows Task Scheduler and GitHub Actions cron designs for human
review. No cron/task registered anywhere.
