# Sprint 13 Phase 1 — Reuse Map

Traced by following every import at least two levels deep (page → client
component → sub-components → API/queries → DB objects → tests), not by
page-wrapper file size. Two independent research passes were cross-checked
against each other and against direct file reads before anything below was
accepted as fact.

## Research/warehouse side (Sprint 9–12)

| Capability | Route | Key components | DB objects | API | Tests | Verdict |
|---|---|---|---|---|---|---|
| Search | `app/research/explore` | `ExploreFilterForm.tsx`, `ExploreResultsList.tsx` (66 lines, checkbox multi-select →`/research/compare`) | `core.dim_geography` via `searchGeographiesV2()` (`lib/warehouse/queries.ts`) | `/api/v1/search` (21 lines, gated `PUBLIC_API_V1_ENABLED`) | none dedicated | **Extend**: query fn is generic and reusable; UI is a plain server-rendered form, NSW/VIC hardcoded, no autocomplete/keyboard-nav/recent-searches — genuine WS3 gap |
| National map | `app/research/map` | `MarketMapExplorer.tsx` (206 lines, Leaflet, lazy-mounted) | `geography.centroid_lat/lon`, `map_marker` view (migration 020) | `/api/research/map-markers` (internal; no v1 equivalent) | none | **Reuse as-is**; add search jump-to only if time permits |
| Suburb/postcode profile | `app/research/suburb/[code]`, `app/research/postcode/[code]` | one shared `MarketSnapshotView.tsx` (291 lines, 7 sections) | `suburb/postcode_market_snapshot` marts, `household_demographics`, timeseries facts | `getMarketSnapshotV2`, `getTimeseriesV2`, `getSuburbDemographics`/`getPostcodeDemographics` | `affordability.test.ts`, `export.test.ts` | **Reuse + extend**: comprehensive already; missing `AboutThisMetric` on supply/demographics cells |
| Metric explainability | inline in `MarketSnapshotView` | `AboutThisMetric.tsx` (120 lines) | `meta.metric_lineage_registry` (migration 030/031) | `/api/v1/metrics/{geographyId}/{martTable}/{metricFamily}` | none dedicated | **Reuse everywhere** — already the exact WS10 pattern, just needs wider embedding |
| Scenario Lab | `app/research/scenario/[code]` | `ScenarioLabClient.tsx` (118 lines) — 3 sliders, 4 outputs, single scenario only | none (client-side pure calc) | none | formulas covered by `affordability.test.ts` | **Extend heavily** — no cashflow, no multi-scenario, no save. Genuine WS6 build target on top of proven formulas |
| Cross-state comparison | `app/research/compare` | 200-line page, `ExportButtons` (CSV/JSON/print) | `suburb/postcode_market_snapshot` union via `compareMarketGeographies()` (migration 021) | `/api/v1/compare` | `export.test.ts`, `apiV1.test.ts` | **Extend**: 2–10 geographies, confidence-aware, exportable already; missing reorder-in-place, print CSS tuning, historical toggle |
| Data-ops console | `app/research/data-status` | 210-line read-only dashboard | `dataset_freshness`, `operations_summary`, `refresh_run_history` (migration 022) | none | none | Out of Phase-1 scope (WS12) |
| Feature flags | `lib/warehouse/env.ts` | 5 flag functions, all default `false`, checked in 16 places | — | — | `env.test.ts` (full coverage) | **Reuse pattern exactly** for any new flag |

## Deal-tools side (pre-Sprint-9, zero warehouse integration)

| Capability | Route | Key components | DB objects | RLS | Tests |
|---|---|---|---|---|---|
| Analyse a Property | `app/analyse-property` | `AnalysePropertyClient.tsx` (~2,500 lines) — loan/repayment/cashflow/tax/depreciation/deal-score, saves via `lib/supabase/reports.ts` | `property_reports` (`inputs_json`/`results_json` JSONB) | `auth.uid() = user_id`, 4 policies | **none** |
| Compare Properties | `app/compare-properties` | `ComparePropertiesClient.tsx` (716), `ComparePropertyFormPanel.tsx` (733), `CompareProjectionCharts.tsx` (422) — compares 2 **user-entered** deals | `property_comparisons` | same pattern | **none** |
| Dashboard | `app/dashboard` | `DashboardClient.tsx` (~410) — generic card grid over 4 `Promise.all` list calls | reads all 4 tables below | n/a | **none** |
| Portfolio | `app/portfolio` | `PortfolioClient.tsx` (~400) — standalone value/loan/rent snapshots | `portfolio_properties` | same pattern | **none** |
| Watchlist | `app/watchlist` | `WatchlistClient.tsx` (~270) | `watchlist_items` (`type` enum property/suburb/note, free-text `suburb`/`state`, `notes`, no postcode/tags/geography link) | same pattern | **none** |
| Reports | `app/reports/[id]` | `SavedReportClient.tsx` — reconstructs charts from saved JSON | `property_reports` | same pattern | **none** |

**Confirmed NOT duplicate systems**: `app/compare-properties` (2 user deals) vs. `app/research/compare` (up to 10 geographies by market metric) — different subjects, different tables, no consolidation needed, just IA labeling clarity (WS2).

## Auth boundary

`lib/auth/access.ts: hasFullToolAccess(user, authConfigured)` — binary: if
Supabase isn't configured, fully open (dev mode); once configured, analysis
tools remain usable unauthenticated, but every **save** action requires a
signed-in user. No role/tier model exists yet (out of Phase-1 scope, that's
WS11).

## RLS — verbatim pattern (canonical, `supabase/migrations/001_propellect_schema.sql`)

Every user table (`property_reports`, `property_comparisons`,
`watchlist_items`, `portfolio_properties`) follows this identical shape:

```sql
alter table public.<table> enable row level security;
create policy "..." on public.<table> for select using (auth.uid() = user_id);
create policy "..." on public.<table> for insert with check (auth.uid() = user_id);
create policy "..." on public.<table> for update using (auth.uid() = user_id);
create policy "..." on public.<table> for delete using (auth.uid() = user_id);
```

`waitlist` is the one documented exception (anon insert, service-role-only
select) — any future exception must be similarly explicit, never silent.

## What must not be duplicated

- Do not build a second navbar — `components/nav/Navbar.tsx` is the live one
  (wired into `app/layout.tsx`); `components/design/shell/Navbar.tsx` +
  `AppShell.tsx` are dead code (exported, never imported) and are left alone,
  not deleted, not extended.
- Do not build a second search query function — `searchGeographiesV2()` is
  reused by every new search surface.
- Do not build a second "About this metric" — `AboutThisMetric.tsx` is
  embedded, not reimplemented.
- Do not model Scenario Lab "cases" inside `property_reports` (wrong shape:
  single-deal vs. geography-level scenario) — new table, same RLS pattern.
- Do not model saved suburbs/postcodes as a new parallel table — extend
  `watchlist_items` (already has `type='suburb'`) with additive columns.
- Do not test RLS live against production — per explicit user decision this
  phase, RLS gets a new static policy-text checker
  (`warehouse/scripts/quality/check_rls_policies.mjs`), following the exact
  pattern already proven in `check_warehouse_files.mjs`.

## Two genuine engineering risks flagged before implementation

1. `AnalysePropertyClient.tsx` is ~2,500 lines of stable, untested code.
   WS5's warehouse hook (`lib/suburbAssumptions.ts`) is a real seam, but the
   integration is scoped to the "suggestions in" direction only this phase —
   not a bidirectional deal-score-vs-market rebuild.
2. Scenario Lab v2 (WS6) is the single largest, riskiest item in this batch
   (new table, new formulas, new multi-case UI). It is deliberately scoped
   down to 2–3 cases, deposit/rate/term/vacancy only, with "save" as a
   stretch goal, rather than risk a half-finished full rebuild.

Full workstream-by-workstream file plan is being executed directly (this
report documents *why* each file is touched or left alone; implementation
detail lives in commits and the phase-1 final report).
