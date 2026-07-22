# Sprint 12, Workstream 11 — Versioned Public API v1

## Design decision: extend the existing public-view/RPC pattern, don't invent a new one

This project already has a real, audited public API surface: 8 views + 9
functions under the `public` schema, `SECURITY DEFINER` +
`SET search_path`, granted to `anon`/`authenticated`/`service_role`,
consumed by `lib/warehouse/queries.ts` and the `/research/*` pages —
`core`/`mart`/`meta`/`staging` remain entirely invisible to PostgREST
(`WAREHOUSE_SECURITY_DECISION.md`, Sprint 11 WS17). WS11 adds a
**versioned `/api/v1/*` Next.js route layer** over this exact same
pattern, plus exactly 2 new database objects genuinely needed to expose
WS8/WS9 data that had no public-facing form yet.

## What was built

**Database (migration 033)**:
- `public.v_metric_lineage_v1` — safe columns from WS8's
  `meta.metric_lineage_registry` (source/publisher/licence/dataset,
  transformation method, mandatory flag) — never internal ids or
  investigation notes.
- `public.get_metric_lineage_v1(geography_id, mart_table, metric_family)`
  — the "About this metric" RPC. Reimplements
  `warehouse/scripts/lineage/lineage_service.mjs`'s logic in SQL (row +
  registry join) so it's callable via the anon-key public API without a
  service-role connection. Live-verified: returns identical shape/content
  to the JS service for the same inputs.
- `public.v_quality_summary_v1` — WS9's aggregate rule/incident counts
  only. Deliberately does NOT expose `meta.data_incident.evidence` or
  `meta.data_quarantine_summary.sample_row_ids` (internal diagnostic
  detail, not meant for public consumption).

**Application** (`app/api/v1/*`, 9 route handlers + a shared envelope
helper `lib/warehouse/apiV1.ts`):

| Endpoint | Backing |
|---|---|
| `GET /api/v1` | discovery root |
| `GET /api/v1/search` | `search_market_geographies_v2` (existing) |
| `GET /api/v1/snapshot/:geographyId` | `get_market_snapshot_v2` (existing) |
| `GET /api/v1/timeseries/:geographyId` | `get_market_timeseries_v2` (existing) |
| `GET /api/v1/compare` | `compare_market_geographies_v1` (existing) |
| `GET /api/v1/map-markers` | `get_market_map_markers_v1` (existing) |
| `GET /api/v1/metrics/:geographyId/:martTable/:metricFamily` | **new** `get_metric_lineage_v1` |
| `GET /api/v1/quality` | **new** `v_quality_summary_v1` |
| `GET /api/v1/freshness` | `v_dataset_freshness_v1` (existing) |

Every route: consistent `{data, meta}`/`{error, meta}` envelope, gated
behind a new `PUBLIC_API_V1_ENABLED` flag (independent of the internal
`/research` UI's `WAREHOUSE_PREVIEW_ENABLED`, since this API may serve
external callers), validated inputs (enum checks, numeric bounds,
2-10-id compare range) returning `400` before ever reaching a query.

## Live verification (not just build-time checks)

Started the dev server with the flag enabled and curled every endpoint
for real:
- `/api/v1` discovery root — correct.
- `/api/v1/search?q=Lindfield` — 2 real results.
- `/api/v1/snapshot/SAL_12348_ASGS3_2021` (Lindfield) — **confirms WS9's
  fix is visible end-to-end through the new public API**:
  `median_sale_price_12m: 2623500`, `sales_volume_12m: 68`, matching the
  corrected 2026 data (not the quarantined 2032 bug).
- `/api/v1/metrics/SAL_12348_ASGS3_2021/suburb_market_snapshot/sales` —
  full, correct "About this metric" lineage (NSW VG, direct load, CC BY
  4.0, `lineage_complete: true`).
- `/api/v1/quality` — live aggregate: 35 active rules, 0 blocking
  failures, 3 open advisory incidents, 2 quarantined rows — matches the
  branch state exactly.
- Error handling: unknown `metricFamily` → 400, nonexistent geography →
  404, `compare` with 1 id → 400, all verified live, not assumed.

## Validation

- `npm test`: 157/157 pass (23 new — envelope/gate unit tests plus the
  extended `isPublicApiV1Enabled` flag tests, matching the exact
  established pattern from the 4 pre-existing feature flags).
- `npm run build`: all 9 new routes compile and appear in the route
  manifest.
- `npm run lint`: 0 errors, 6 pre-existing warnings (no new ones).
- Supabase advisor: the 2 new views + 1 new function trigger the exact
  same lint categories (`security_definer_view`,
  `anon_security_definer_function_executable`) as every one of the 8
  pre-existing views/9 functions — consistent with the established,
  already-reviewed architecture, not a new risk category.
- Production (`oshquaxsloolqucwvigc`): re-confirmed no new schema objects
  — only the app's own pre-existing tables exist.

## Files

- `supabase/migrations/033_public_api_v1_lineage_quality.sql`
- `lib/warehouse/apiV1.ts`, `apiV1.test.ts` (new)
- `lib/warehouse/env.ts` — `isPublicApiV1Enabled()` (+ test)
- `lib/warehouse/queries.ts` — `getMetricLineage`, `getQualitySummary` (new)
- `app/api/v1/route.ts`, `search/`, `snapshot/[geographyId]/`,
  `timeseries/[geographyId]/`, `compare/`, `map-markers/`,
  `metrics/[geographyId]/[martTable]/[metricFamily]/`, `quality/`,
  `freshness/` (all new)
- `warehouse/docs/PUBLIC_API_V1_CONTRACT.md` (new)
- `.env.example` — documents `PUBLIC_API_V1_ENABLED`

## Exact next workstream

WS12 — research interface rebuild. Should consume the new
`/api/v1/metrics/.../lineage` endpoint for an "About this metric" UI
panel (the mission's own stated purpose for WS8's lineage work).
