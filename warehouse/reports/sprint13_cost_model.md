# Sprint 13 — Performance and Cost Model (Workstream 14)

Measured figures are labelled **MEASURED**; everything else is labelled
**ASSUMED** with the basis for the assumption stated. Do not treat an
assumed figure as a commitment.

## Performance — measured

Local `next dev` server (development mode — no minification, HMR
websocket attached, unoptimised vs. a production `next start`/Vercel
deployment, so these are upper-bound, not representative-of-production
numbers), warm (post-compile) time-to-first-byte:

| Route | TTFB (warm, dev mode) — **MEASURED** |
|---|---|
| `/research/explore` (search) | 0.43s |
| `/research/suburb/21640` (full profile, 4 parallel warehouse queries) | 1.37s |
| `/research/compare?ids=...` (2 geographies) | 0.37s |
| `/analyse-property` (fully client-rendered, no warehouse call on load) | 0.04s |

The suburb profile is the slowest — it already fans out its 4 warehouse
queries (`snapshot`, `demographics`, `timeseries`, `assumptions`) via
`Promise.all` (verified in
`app/research/suburb/[geographyCode]/page.tsx:25` — not a sequential
waterfall bug), so the 1.37s reflects genuine round-trip latency to the
warehouse-validation Supabase branch, not an obvious code-level
inefficiency. A production deployment (same region as the Supabase
branch, no dev-mode overhead) would be meaningfully faster — not
re-measured here since that requires the preview deployment (Workstream
19), which remains pending human action on the Vercel MCP connector.

## Bounding — measured from code, not assumed

Every research query surface already has an explicit cap, verified by
reading the code (not re-derived this pass, confirmed still true):

- Search (`search-suggest`, `/api/v1/search`): 8-20 results (internal),
  100 max (public API).
- Comparison: 2-10 geographies (`compareMarketGeographies`, enforced both
  client and API).
- Map markers: 500 per viewport query.
- Watchlist change detection: **newly bounded this workstream** — was
  unbounded (one warehouse query per geography-linked watchlist item,
  no cap), now capped at 50 items per refresh call, oldest-checked-first
  (`app/api/watchlist/refresh-changes/route.ts`).

No route in this codebase allows an unbounded warehouse table download to
the browser — every list-returning query has a server-side cap.

## Caching

No new caching was added this sprint — Phase 1/2 features are read-mostly
against warehouse marts that refresh on their own cadence (weekly/
quarterly/annual per dataset), and Next.js's default fetch/RSC caching
already applies to server-rendered pages. Explicitly not adding
ad-hoc caching without a clear invalidation story (per the guardrail
"add caching only where invalidation is understood") — the existing
default is the safe choice here, not a gap.

## Branch storage — measured (carried from Sprint 12, re-verification pending)

Sprint 12's final report measured 2,679.4 MB / 4,500 MB ceiling (59.5%)
on the warehouse-validation branch. **Not independently re-queried this
pass** (Workstream 21's final audit is the designated point to
independently re-verify live branch state rather than re-quoting a prior
report — flagged here rather than silently re-asserted as current fact).

Sprint 13 Phase 1/2 added only schema (4 new tables:
`scenario_lab_cases`, `watchlist_change_events`,
`notification_preferences`, `user_entitlements`; additive columns on
`watchlist_items`) — **ASSUMED** growth: low hundreds of KB of
schema/index overhead, negligible against the 4,500 MB ceiling. No new
bulk dataset was loaded this sprint.

## Cost model — ASSUMED (no production traffic exists yet to measure from)

Since this is a private beta that hasn't launched, every dollar figure
below is a rough order-of-magnitude estimate from published Supabase/
Vercel pricing tiers, not a bill this project has actually incurred.

| MAU | Basis | Estimated monthly cost |
|---|---|---|
| 100 | Supabase free tier likely sufficient (500MB DB, 5GB egress); Vercel Hobby/Pro depending on team status | **ASSUMED**: $0-20/mo |
| 1,000 | Supabase Pro tier likely needed (8GB DB, 250GB egress) once branch + production DB combined exceed free tier; Vercel Pro | **ASSUMED**: $50-150/mo |
| 10,000 | Supabase Pro/Team tier with usage-based egress add-ons; Vercel Pro with function-invocation overage likely | **ASSUMED**: $300-800/mo, wide range because it depends heavily on how many research-preview pages (warehouse-branch reads) vs. deal-tools pages (main-project reads) users actually visit — not something this project can estimate without real usage data |

**Function invocations**: every new Phase 1/2 API route is a standard
Vercel serverless function (not Edge), invoked once per page load or
user action — no batching or fan-out beyond the now-bounded watchlist
refresh (max 50 warehouse calls per invocation, only when a user visits
their own watchlist).

**Refresh frequency**: unchanged by this sprint — warehouse refresh
cadence remains dataset-specific (weekly/quarterly/annual per
`warehouse/config/sources.yml`), not affected by any Phase 1/2 work.

**Do not buy infrastructure to conceal inefficient queries** (explicit
guardrail) — no infrastructure purchase is proposed or needed based on
this pass's findings; the one real inefficiency found (unbounded
watchlist fan-out) was fixed in code, not worked around with a bigger
plan.
