# Sprint 13 Phase 1 — Data Contract

Documents every new data flow introduced in Phase 1 (Workstreams 2-8):
what's real/sourced vs. what's a user-entered assumption, what's gated,
and what's never fabricated.

## New API routes

| Route | Gate | Reads | Writes | Notes |
|---|---|---|---|---|
| `GET /api/research/search-suggest` | `WAREHOUSE_PREVIEW_ENABLED` + `MULTI_STATE_RESEARCH_ENABLED` | `core.dim_geography` via `searchGeographiesV2()` | none | Internal, mirrors `/api/v1/search`'s query but independent of the public API's own flag |
| `GET /api/analyse/suburb-suggestions` | `WAREHOUSE_PREVIEW_ENABLED` | `core.dim_geography`, `mart.suburb_market_snapshot` (NSW/VIC only) | none | Never returns a vacancy figure (no source exists); non-NSW/VIC states get an explicit `state_not_covered` reason, not a silent empty response |

Both are read-only, bounded (search results capped at 20), and return the
same "unavailable, not fabricated" contract as the rest of `/api/v1`.

## New/changed database objects

| Object | Migration | Kind | RLS |
|---|---|---|---|
| `public.scenario_lab_cases` | `037_scenario_lab_cases.sql` | New table | `auth.uid() = user_id` on select/insert/update/delete (verified by `warehouse:rls:check`) |
| `public.watchlist_items` (+columns) | `038_watchlist_geography_linking.sql` | Additive columns: `geography_id`, `geography_code`, `geography_type`, `postcode`, `tags`, `updated_at` | Unchanged (column addition, no new policy needed) |

Both migrations are additive only (`create table if not exists`, `add
column if not exists`), verified by `warehouse:check`'s destructive-DDL
scan finding nothing to flag.

## Sourced vs. assumed, by feature

**Suburb suggestions (Analyse a Property, WS5)**
- Sourced (from `mart.suburb_market_snapshot`, NSW/VIC only): `suburbGrowthPercent` (= `annual_price_change_pct`, labelled as a *recent 12-month change*, never a forward rate), `rentalGrowthPercent` (= `annual_rent_change_pct`).
- Always null, never fabricated: `vacancyPercent` — no vacancy-rate source exists in the warehouse for any jurisdiction (`warehouse/config/jurisdiction_coverage.yml`).
- User's own entry (`purchasePrice`, `weeklyRent`, `depositPercent`, etc.) is never overwritten by warehouse data — suggestions only pre-fill editable Advanced Assumptions fields the user already controlled before this sprint.

**Scenario Lab v2 (WS6)**
- Sourced: baseline `medianSalePrice`, `medianWeeklyRentLatest`, `medianWeeklyHouseholdIncome`, RBA `baselineRatePercent` — all from `mart.suburb_market_snapshot`, shown with `AboutThisMetric` lineage.
- User assumption (per case, never sourced): deposit %, loan term, interest rate, vacancy %, annual expenses. Explicitly labelled "Sourced vs. assumed" in-page.
- Property price is held constant across every case — the debt/equity path table reflects loan paydown only, never an assumed capital-growth rate. This is a deliberate guardrail decision, not an oversight: Scenario Lab must never present a growth forecast.
- Every output (loan amount, repayment, yield, cashflow, break-even rent, debt/equity path) is a pure function of the above two categories — no hidden third input.

**Comparison v2 (WS7)**
- No new metrics: reuses the same `compareMarketGeographies()` snapshot data as before. Reorder is purely a display-order change (`?ids=` query param), not a data change.

**Watchlist geography linking (WS8a)**
- A watchlist row is geography-linked only when added via the warehouse search (real `geography_id`/`geography_code` from `searchGeographiesV2`). Manually-typed suburbs (any state, including outside NSW/VIC) remain valid, unlinked rows — never force-matched or guessed against the warehouse.

## Confidence, lineage, and missing-data rules (unchanged, extended to new surfaces)

- `formatMoneyOrUnavailable` / `formatPercentOrUnavailable` / `formatCountOrUnavailable` (new shared module, `lib/warehouse/formatMetric.ts`) are used everywhere a warehouse-sourced number is rendered in Phase 1's new/touched components — `null`/`undefined` → "Unavailable", a real `0` renders as `0` (tested explicitly, see `formatMetric.test.ts`).
- `AboutThisMetric` (existing component, reused not reimplemented) is now embedded on 3 additional metric cards in `MarketSnapshotView` (dwelling stock, approvals, demographics) and on the baseline sale price in both the suburb-suggestions banner and Scenario Lab v2.
- No new confidence semantics were introduced — every new surface consumes the existing `meta.metric_lineage_registry` / confidence-label pipeline built in Sprints 9-12, unchanged.
