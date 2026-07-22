# Sprint 12, Workstream 15 — Performance and Storage Hardening

## Real, measured finding: WS9's future-dated-observation rule was slow

`EXPLAIN ANALYZE` on the exact query `future_dated_observation` runs
against `core.fact_residential_sales_summary` (270,701 rows, 219 MB)
showed **477ms** — using `fact_sales_period_type_idx` as an index scan,
but inefficiently, since `reference_period` is that index's *second*
column, not the leading one. This rule runs on every
`warehouse:quality:check` invocation (and, once wired up, every
`refresh_engine_v3.mjs --branch-load` promotion gate) — a real,
recurring cost, not a one-off.

**Fixed** (migration 036): added leading-column indexes on
`reference_period` for both `core.fact_residential_sales_summary` and
`core.fact_rental_market_summary` (the same rule runs against both).
Re-measured: **477ms → 0.365ms** — over 1,000x faster. Storage cost:
1.9 MB + 4.5 MB = 6.5 MB total, against a 4,500 MB ceiling.

## Checked and correctly ruled out as non-findings

- **Zero-scan primary key indexes** (`fact_dwelling_stock_pkey` 52 MB,
  `fact_household_tenure_pkey` 37 MB, `bridge_geography_correspondence_pkey`
  15 MB, `suburb_sales_annual_pkey` 9.8 MB) — all show `idx_scan = 0`.
  Investigated rather than assumed wasteful: these are surrogate-UUID
  primary keys that exist for uniqueness *constraint enforcement*, not
  query lookup — no application code queries these tables by their
  surrogate key directly (everything goes through `geography_id`/natural
  keys). Zero scans is the expected, correct state; dropping them would
  remove referential integrity enforcement for no storage benefit worth
  the risk.
- **`mart.suburb_market_snapshot`/`postcode_market_snapshot`/
  `*_market_timeseries`** — already comprehensively indexed (7-8 indexes
  each, covering `geography_id`, `jurisdiction`, `state_code`,
  `coverage_status`, natural keys) from Sprint 11's migration 024 "rent
  mart performance indexes" — this workstream's own new query pattern
  (`get_metric_lineage_v1`, WS11) measured at 6.9ms, no index gap found.
- **New WS8/WS9 metadata tables** (`meta.metric_lineage_registry`,
  `meta.data_quality_result`, `meta.data_incident`,
  `meta.data_quarantine_summary`) — row counts in the tens to low
  hundreds; already have appropriate indexes from their own migrations
  (030-032); no measurable performance concern at this scale.

## Storage

Branch: 2,673 MB → 2,679 MB (+6 MB, entirely the 2 new indexes). Still
59.5% of the 4,500 MB ceiling.

## Validation

- Live `EXPLAIN ANALYZE` before and after the index addition (not
  estimated — actually measured on the real branch).
- Full `warehouse:quality:check` re-run after the fix — completes
  successfully, same 32/35 pass result (the fix changed query speed, not
  query correctness).
- `npm test`: 163/163 pass (no application-layer code changed this
  workstream — purely a database index addition).
- `npm run build`/`lint`: pass.
- Production: re-confirmed zero warehouse schema objects.

## Files

- `supabase/migrations/036_quality_rule_performance_indexes.sql` (new)

## Exact next workstream

WS16 — testing and clean-clone reproduction.
