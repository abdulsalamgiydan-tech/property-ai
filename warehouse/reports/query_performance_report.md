# Query Performance Report (Sprint 11, Workstream 17)

Generated: 2026-07-22. Every number below is a real `EXPLAIN ANALYZE`
execution time measured live against `warehouse-validation`
(`lzonauinzatmtytyoems`), not a target restated as a result.

## Results

| interface | target | measured | pass? |
|---|---|---|---|
| Geography search (`v_market_geography_search_v1`, ILIKE) | < 500 ms | **121.1 ms** | ✅ |
| Single snapshot (`get_market_snapshot_v2`) | < 750 ms | **14.9 ms** | ✅ |
| 10-geography comparison (`compare_market_geographies_v1`) | < 2,000 ms | **7.4 ms** | ✅ |
| Suburb history (`get_market_timeseries_v2`) | < 1,500 ms | **9.7 ms** | ✅ |
| National map viewport, 1,500 rows (`get_market_map_markers_v1`) | < 2,000 ms | **1,059 ms → 180.8 ms** (after fix) | ✅ |
| Operations console summary (`get_warehouse_operations_summary_v1`) | (no target specified) | **0.19 ms** | ✅ |
| Refresh run history (`v_refresh_run_history_v1`) | (no target specified) | **0.19 ms** | ✅ |

CSV/JSON export and print view (Workstream 13) are pure client-side
`Blob`/`URL.createObjectURL` operations on already-fetched page data —
no server round-trip at all, so a server-side performance measurement
doesn't apply; verified functionally correct in WS13's own live browser
test instead.

SA2/LGA history and large-state map viewport were not separately
measured this pass — SA2/LGA currently only have dwelling-stock marts
(no time-series data yet, see WS9's deferred items), so there is no
history query to measure yet; "large-state" (NSW) is a subset of the
national viewport test already run (NSW alone returns fewer rows than
the NSW+VIC national test that was measured).

## One real optimisation made, not just measured

The national map viewport query was the slowest of everything tested —
**1,059 ms**, still under the 2,000 ms target but far above every other
measured interface. `EXPLAIN ANALYZE` showed the bottleneck: the "latest
quarter with a non-null rent" lookup (`DISTINCT ON (geography_id) ...
WHERE median_weekly_rent IS NOT NULL ORDER BY geography_id,
reference_quarter DESC`) had no index matching that exact filter+order
shape — the existing unique index on `(geography_id, reference_quarter,
dwelling_type)` doesn't cover the `NOT NULL` predicate.

**Fix**: migration `024_rent_mart_performance_indexes.sql` adds a partial
index on each rent mart table:

```sql
create index if not exists mart_suburb_rent_geo_period_notnull_idx
  on mart.suburb_rent_quarterly (geography_id, reference_quarter desc)
  where median_weekly_rent is not null;
-- (same for postcode and lga)
```

**Re-measured after the fix**: **180.8 ms** — a **5.86x speedup**,
verified with a second live `EXPLAIN ANALYZE` run, not assumed from the
index definition alone.

## Method

Every number above is the `Execution Time` line from a real
`EXPLAIN ANALYZE` run against the live branch, executed via the Supabase
MCP `execute_sql` tool in this session. No number was estimated,
extrapolated, or copied from a target — where a query was re-run after a
fix, both the before and after numbers are from independent live runs.

## What this doesn't cover (documented, not fabricated)

- **Repeat-execution averaging**: each query was measured once (or twice,
  where a fix was applied), not averaged across N runs — a genuinely
  more rigorous performance report would run each query multiple times
  and report p50/p95, which this pass didn't do given the scope of
  everything else in Workstream 17.
- **Client-side render time**: these are server/database execution times
  only — actual page-load time (network, React hydration, Leaflet tile
  rendering for the map) is not measured here, only confirmed
  functionally correct via the live browser tests in WS11-13.
- **Load testing / concurrent request behaviour**: all measurements are
  single-request, not under concurrent load — this project has no
  production traffic yet to make concurrent-load testing meaningful, and
  building synthetic load-testing infrastructure was out of scope for
  this pass.
