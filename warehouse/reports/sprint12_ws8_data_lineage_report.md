# Sprint 12, Workstream 8 — Field-Level Data Lineage

## Starting finding: most lineage entities already existed

Inspecting `meta` before writing any code showed most of the mission's
requested lineage entity list already exists: `meta.source` (source org),
`meta.dataset` (dataset), `meta.source_file` (file + checksum + retrieval
event — `file_hash`/`downloaded_at`), `meta.load_run` (load-run),
`meta.data_quality_result` (quality-result), `meta.dataset_refresh_run`
(refresh-event), `core.bridge_geography_correspondence` (correspondence,
built Sprint 12 WS4). The genuinely missing piece: nothing linked a
**specific metric on a specific mart** back to which dataset,
transformation, and (where relevant) geography-correspondence version
produced it — the "derived-metric"/"mart-row" entities from the mission's
list.

## Design decision: registry grain, not per-row grain

A per-mart-row lineage table would mean roughly 15,000 rows x 10 metric
families just for `suburb_market_snapshot` — almost entirely redundant,
since lineage is identical for every row within a jurisdiction (every NSW
suburb's sales metric comes from the same dataset via the same pipeline).
Instead, `meta.metric_lineage_registry` (migration 030) registers lineage
at `(mart_table, metric_name, jurisdiction_code)` grain — the STATIC
"what source/methodology" fact. Each mart row's own `metric_provenance`
jsonb + `confidence_label`/period columns remain the DYNAMIC "which
specific observation this row got" fact (already built by earlier
sprints). `warehouse/scripts/lineage/lineage_service.mjs` joins both layers
together into one answer.

`NULL jurisdiction_code` means "one national methodology applies to every
jurisdiction present" (approvals, demographics, dwelling stock, population
growth, affordability) — not "unknown". A real bug surfaced during this
workstream: Postgres treats `NULL <> NULL` for uniqueness, so the original
`unique (mart_table, metric_name, jurisdiction_code)` constraint did not
actually prevent duplicate national-metric rows on re-run (caught by
running the population script twice and seeing the row count grow instead
of staying stable). Fixed with migration 031, `unique nulls not distinct`
(PostgreSQL 15+, confirmed running 17.6 on this branch) — verified
idempotent by running the population script 3 times in a row with a
stable row count each time.

## What was built

1. **`meta.metric_lineage_registry`** (migrations 030, 031) — 35 rows
   covering every metric family x jurisdiction combination currently
   populated across `suburb_market_snapshot`/`postcode_market_snapshot`,
   plus `core.fact_dwelling_construction_activity`.
2. **`warehouse/scripts/lineage/build_metric_lineage_registry.mjs`** —
   idempotent registry population script. Every `dataset_id`/`source_id`/
   `jurisdiction_code` referenced is validated against the live
   `meta.dataset`/`meta.source`/`meta.jurisdiction` tables before any
   write — a typo fails the whole run rather than silently registering a
   dangling reference.
3. **`warehouse/scripts/lineage/validate_metric_lineage_completeness.mjs`**
   — the "no mart metric may be considered publishable if mandatory
   lineage is absent" enforcement mechanism. Read-only; for every
   `(mart_table, metric_family, jurisdiction)` combination that actually
   has non-null data in the branch, checks the registry has a matching
   entry (jurisdiction-specific or national fallback). Exits non-zero on
   any mandatory gap.
4. **`warehouse/scripts/lineage/lineage_service.mjs`** — the "About this
   metric" query function the mission asked for, suitable for a future
   public API route or UI panel (WS12). Given a mart table + geography_id
   + metric family, returns the row's own values/confidence/period
   alongside the registry's methodology (source, publisher, licence,
   dataset, transformation, correspondence version). Live-smoke-tested
   against the real branch (not just mocked) for both a QLD suburb rent
   lookup and an NSW postcode population-growth lookup — both returned
   complete, correct lineage.

## A real gap the completeness validator found (and did not paper over)

First validator run: **86/88 (97.7%)**, 2 mandatory gaps —
`postcode_market_snapshot.sales` for QLD and ACT. Investigating instead of
just registering a blanket rule: every one of these rows' own
`metric_provenance.sales_source` is `nsw_vg_sales`, with tiny volumes
(1-5 transactions per postcode). Two different, NOT resolved explanations:

- **QLD** (e.g. postcode 4380, Goondiwindi): plausibly a genuine
  border-straddling postal catchment — a NSW border-town rural property
  can carry a QLD-numbered postcode for delivery purposes.
- **ACT** (e.g. postcodes 2611, 2612, 2618 — central Canberra): these are
  firmly inside Canberra, not a plausible border catchment. More likely a
  small number of mis-matched records in the underlying NSW sales
  geography join.

Registered as exactly what is verifiably true (`source_id = nsw_vg_sales`,
`transformation_method = 'cross_border_postcode_attribution_unresolved'`),
not guessed at. Flagged explicitly for a future WS9 data-quality rule to
investigate the join — not resolved here, and not silently hidden by
marking it `mandatory: false` either. Second validator run after
registering this: **88/88 (100%)**.

## Validation

- `npm test`: 98/98 pass (9 new — lineage service unit tests using a
  mocked pg client to exercise the actual branching logic: unknown-metric
  rejection, not-found handling, jurisdiction resolution from
  `state_code`, national-rule fallback, and — critically — that an
  unmatched metric honestly reports `lineageComplete: false` rather than
  fabricating a methodology; plus safety-pattern tests for both scripts).
- Live smoke test (not part of the CI suite, run manually against the
  real branch): both a QLD rent lookup and an NSW postcode
  population-growth lookup returned complete, correct methodology and
  row-level data.
- `validate_metric_lineage_completeness.mjs`: **PASSED**, 100% (88/88).
- `npm run warehouse:check`: pass.
- `npm run lint`: 0 errors, 6 warnings (all pre-existing, unrelated — 2
  new warnings introduced by this workstream's own code were found and
  fixed before commit, not left in).
- `npm run build`: pass.
- Production (`oshquaxsloolqucwvigc`): re-confirmed zero warehouse schema
  tables.
- Idempotency: population script run 3 times consecutively, registry row
  count stable at 35 each time (confirms the migration-031 fix actually
  works, not just that it compiles).

## Storage impact

Negligible — 35 small metadata rows in a new `meta` table.

## Files

- `supabase/migrations/030_metric_lineage_registry.sql` (new table)
- `supabase/migrations/031_metric_lineage_registry_null_jurisdiction_fix.sql`
  (fixes the NULL-jurisdiction uniqueness bug found live during this
  workstream)
- `warehouse/scripts/lineage/build_metric_lineage_registry.mjs` (new)
- `warehouse/scripts/lineage/validate_metric_lineage_completeness.mjs` (new)
- `warehouse/scripts/lineage/lineage_service.mjs` (new)
- `warehouse/scripts/lineage/lineage_service.test.ts` (new)
- `warehouse/reports/metric_lineage_registry_build_report.json` (generated)
- `warehouse/reports/metric_lineage_completeness_report.json` (generated)

## Exact next workstream

WS9 — automated data-quality monitoring. Should incorporate the
future-reference-period rule WS1 already justified, AND the new
cross-border postcode attribution anomaly this workstream found
(QLD/ACT-heuristic postcodes carrying `nsw_vg_sales` data) as a candidate
first real rule.
