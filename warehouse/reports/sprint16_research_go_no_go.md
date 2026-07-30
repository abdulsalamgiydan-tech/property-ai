# Sprint 16 Research GO/NO-GO

Date: 2026-07-25
Scope: Production readiness assessment for research pages, research map, suburb/postcode profiles, comparisons, API v1 read/export interfaces, and Research Copilot.

## Current Production Configuration

Production environment variable names do not include:

- `WAREHOUSE_PREVIEW_ENABLED`
- `MULTI_STATE_RESEARCH_ENABLED`
- `PUBLIC_API_V1_ENABLED`
- `RESEARCH_COPILOT_ENABLED`
- `SUPABASE_SERVICE_ROLE_KEY`

Observed fail-closed behavior:

- `/research/map`: HTTP 404
- `/api/v1/search?q=richmond&limit=2`: HTTP 404
- `POST /api/research/copilot`: HTTP 404

## Code Gate Review

- Research routes are gated by `WAREHOUSE_PREVIEW_ENABLED`.
- Multi-state research routes also require `MULTI_STATE_RESEARCH_ENABLED`.
- Public API v1 routes require `PUBLIC_API_V1_ENABLED` and warehouse configuration.
- Research Copilot requires both `WAREHOUSE_PREVIEW_ENABLED` and `RESEARCH_COPILOT_ENABLED`.
- Research Copilot also requires authenticated user context and database-backed rate limiting through `research_copilot_queries`.

## Production Data And Schema Assessment

Read-only Production schema inspection found the core public app tables and the Sprint 15 tables. It did not find the warehouse-facing market views/functions used by the research UI and API v1 paths, such as:

- `v_market_geography_search_v1`
- `v_suburb_market_snapshot_v1`
- `v_postcode_market_snapshot_v1`
- `v_dataset_freshness_v1`
- `search_market_geographies_v2`
- `get_market_snapshot_v2`
- `compare_market_geographies_v1`
- `get_market_map_markers_v1`
- `get_market_timeseries_v2`
- `get_metric_lineage_v1`

Because the required Production research data surfaces are absent from the inspected Production project, enabling the route flags would not be safe.

## Security And Runtime Notes

- No Production service-role key is present in the Vercel Production environment name list.
- Public API v1 is read-only in code, but is intentionally unauthenticated and CORS-permissive when enabled. It requires a separate rate/abuse and data-readiness decision before Production activation.
- Research Copilot would make paid LLM calls and write audit/rate-limit rows. It remains disabled and should stay disabled until a separate activation gate verifies cost controls, rate limits, data grounding, and monitoring.

## Decision

- Research activation: NO-GO.
- Research map activation: NO-GO.
- Suburb/postcode profile activation: NO-GO.
- Public API v1 activation: NO-GO.
- Research Copilot activation: NO-GO.

Required before reconsideration:

- Confirm the intended Production warehouse data source and schema.
- Confirm bounded queries, response sizes, and rate limits on Production-shaped data.
- Confirm freshness, confidence labels, unavailable/null handling, and lineage completeness.
- Run Preview UAT with the exact intended Production flags before any Production activation.
- Obtain separate explicit approval for any Production environment-variable change.
