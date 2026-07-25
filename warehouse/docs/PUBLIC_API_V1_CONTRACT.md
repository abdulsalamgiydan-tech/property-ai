# Public API v1 Contract (Sprint 12 WS11)

## Enabling

Gated behind `PUBLIC_API_V1_ENABLED=true` (also requires
`WAREHOUSE_SUPABASE_URL`/`WAREHOUSE_SUPABASE_ANON_KEY` to be configured —
see `lib/warehouse/env.ts`). Disabled by default; every route returns
`404` when the flag is off, matching the existing `/api/research/*`
convention of not revealing a gated route exists at all. Independent of
`WAREHOUSE_PREVIEW_ENABLED` (the internal `/research` UI's own flag) —
the public API's rollout is a separate decision from the internal UI's.

## Versioning policy

- The URL path itself carries the version (`/api/v1/...`), not a header —
  simplest to cache, simplest to document, simplest for a caller to pin to.
- **Breaking changes** (removing a field, changing a field's type or
  meaning, removing an endpoint) require a new version path (`/api/v2/...`)
  — `v1` is never broken in place once released.
- **Additive changes** (new optional field, new endpoint) are allowed
  within `v1` without a version bump.
- Every response carries `meta.version` and `meta.generated_at` so a
  caller can always confirm which version actually answered, regardless
  of which path they called.

## Response envelope

Every endpoint returns exactly one of these two shapes:

```json
{ "data": { ... }, "meta": { "version": "v1", "generated_at": "2026-07-22T21:00:00.000Z" } }
```

```json
{ "error": "human-readable message", "meta": { "version": "v1", "generated_at": "..." } }
```

No endpoint ever mixes the two — a caller can check for the presence of
`data` vs `error` alone, without also checking the HTTP status code, though
the status code is always set correctly too (`200` success, `400` bad
request, `404` not found, `503` genuinely unavailable — never `500` for an
expected "no data" case).

## Endpoints

| Path | Method | Purpose |
|---|---|---|
| `/api/v1` | GET | Discovery root — lists every endpoint. |
| `/api/v1/search?q=&jurisdiction=&type=&limit=` | GET | Search geographies. |
| `/api/v1/snapshot/:geographyId` | GET | Wide market snapshot. |
| `/api/v1/timeseries/:geographyId` | GET | Recent-trend series. |
| `/api/v1/compare?ids=a,b,c` | GET | Compare 2-10 geographies. |
| `/api/v1/map-markers?minLat=&maxLat=&minLon=&maxLon=&type=` | GET | Map markers in a bounding box. |
| `/api/v1/metrics/:geographyId/:martTable/:metricFamily` | GET | "About this metric" — WS8's lineage. |
| `/api/v1/quality` | GET | WS9's aggregate quality summary. |
| `/api/v1/freshness` | GET | Per-dataset freshness status. |

## What `/api/v1/metrics/.../:metricFamily` exposes (and doesn't)

Backed by `public.get_metric_lineage_v1()` (migration 033), which reads
from `meta.metric_lineage_registry` (WS8) and the requesting geography's
own mart row. Returns: source name/publisher/licence/URL, whether the
metric is derived and by what transformation, this geography's own
confidence label and provenance, and `lineage_complete` (whether a
matching registry entry exists at all — see WS8/WS9's "no mart metric may
be considered publishable if mandatory lineage is absent" rule).

Does NOT expose: raw sample/evidence rows from failing quality rules,
internal load-run ids, or database connection details. `/api/v1/quality`
similarly returns only aggregate counts (`public.v_quality_summary_v1`) —
never `meta.data_incident.evidence` or `meta.data_quarantine_summary.sample_row_ids`,
which may contain internal-only diagnostic detail.

## Security model

Same architecture as every other public surface in this project
(`WAREHOUSE_SECURITY_DECISION.md`, Sprint 11 WS17): `core`/`mart`/`meta`/
`staging` remain entirely invisible to PostgREST (zero grants to
`anon`/`authenticated`). Every `/api/v1/*` value is read through a
hand-reviewed `public` schema view or `SECURITY DEFINER` function, same
pattern as the pre-existing internal-UI-facing views/RPCs
(`v_suburb_market_snapshot_v1`, `get_market_snapshot_v2`, etc.) — this
workstream added 2 new views and 1 new function to that existing,
already-audited pattern, not a new access model.

## Input validation

Every route validates its inputs before querying: `type` and `jurisdiction`
are constrained to known enum values (an unrecognised value is treated as
absent, not passed through to the database), numeric bounding-box
coordinates are checked with `Number.isFinite`, `compare`'s `ids` count is
bounded to 2-10 (matching the underlying RPC's own enforced range), and
`metrics/:martTable`/`:metricFamily` are validated against fixed known
lists before ever reaching a query — an unrecognised value returns `400`,
never a raw database error.

## CORS

Every `/api/v1/*` response carries `Access-Control-Allow-Origin: *`
(added Sprint 12 WS14, `lib/warehouse/apiV1.ts`'s `CORS_HEADERS`) — a
deliberate, permissive choice appropriate for this specific API's shape:
read-only (GET only), unauthenticated, no cookies/credentials involved,
serving the same anon-key-gated public research data a browser could
already read directly via the Supabase REST API with the same key.
Restricting the origin here would not add real security (the data is
already public via the anon key), only break legitimate external callers
— the documented use case for this API.

## Rate limiting

Not implemented in this workstream. This API sits behind Supabase's own
project-level rate limits (the anon key path) and Vercel's platform-level
request limits; no application-level rate limiter was added given no
current abuse signal and this project's standing rule against
speculative infrastructure ("don't add features beyond what's needed").
Flagged as a genuine gap for a human to revisit before wide external
publication of this API, not silently assumed unnecessary forever.
