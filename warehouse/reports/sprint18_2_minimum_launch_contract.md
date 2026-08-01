# Sprint 18.2 Phase 4 — Minimum Launchable Warehouse Contract

Derived by rigorous dependency trace, not assumption: `pg_depend` for the 10
required views (Postgres tracks view→table dependencies natively) and a
precise schema-qualified-identifier regex over `pg_get_functiondef()` for the
8 required RPC functions (plpgsql function bodies aren't tracked in
`pg_depend`). This is the exact, complete, minimum table set the Research Hub
+ API v1 surface can read — nothing assumed, nothing padded.

## Required tables (21 of 53 warehouse-validation tables — 40%)

**`core` (1 of 11 tables):**
- `dim_geography` — geography dimension (SAL/POA/LGA), read by
  `v_market_geography_search_v1`, `search_market_geographies_v2`,
  `get_market_map_markers_v1`. Confirmed PostGIS-free for this use (only
  `centroid_lat`/`centroid_lon` numeric columns are read, not `geom`).

**`mart` (9 of 22 tables):**
- `suburb_market_snapshot`, `postcode_market_snapshot` — current-point
  snapshot (medians, yields, vacancy), read by 5 of the 8 functions plus 3
  views.
- `suburb_demographic_profile_2021`, `postcode_demographic_profile_2021`
- `suburb_market_timeseries`, `postcode_market_timeseries`
- `suburb_rent_quarterly`, `postcode_rent_quarterly`, `lga_rent_quarterly`

**`meta` (11 of 17 tables):**
- `dataset`, `source`, `dataset_freshness_status`, `dataset_refresh_run`,
  `metric_lineage_registry`, `metric_assumption`, `jurisdiction`
- `data_incident`, `data_quality_rule`, `data_quality_run`,
  `data_quarantine_summary`

**`staging` (0 of 3 tables):** none required — confirmed transient/empty,
ETL landing zone only, never read by the query surface.

## Explicitly excluded from the minimum launch contract

**All 10 `core.fact_*`/`bridge_*` tables** (`fact_dwelling_stock`,
`fact_household_tenure`, `fact_building_approvals`,
`fact_residential_sales_summary`, `fact_rental_market_summary`,
`fact_interest_rates`, `fact_dwelling_construction_activity`,
`bridge_geography_relationship`, `bridge_geography_correspondence`,
`dim_geography_version`) — these feed the `mart` tables via ETL but are
never queried directly by any of the 18 required objects.

**13 of 22 `mart` tables** (`suburb_dwelling_stock_2021`,
`postcode_dwelling_stock_2021`, `sa2_dwelling_stock_2021`,
`lga_dwelling_stock_2021`, `suburb_building_approvals`,
`postcode_building_approvals`, `suburb_sales_monthly`,
`suburb_sales_annual`, `postcode_sales_monthly`, `postcode_sales_annual`,
`suburb_yield_quarterly`, `postcode_yield_quarterly`,
`national_interest_rate_context`) — real, valid data, just not read by any
currently-granted view/function. Not part of the *minimum* launch; can be
added in a later sprint if a future Research feature needs them.

**6 of 17 `meta` tables** (`source_file`, `coverage_result`,
`publication_approval`, `load_run`) — ETL/operational bookkeeping, not
read by the runtime query surface.

**`postgis` extension** — not required (see the companion ordering report).

## Row-count impact (why this matters for Sunday)

Using the exact `count(*)` / row-count manifest already captured:

| | Full warehouse-validation | Minimum launch contract |
|---|---|---|
| Rows | ~3,357,597 | **~452,000** (≈13.5%) |

This is the single biggest lever for making a Sunday transport window
realistic — the snapshot/import problem is roughly **7x smaller** than
naively assuming the whole warehouse must move. `core.dim_geography`
(101,215 rows) is unavoidable and by far the largest single required table;
every `mart.*` table in the minimum set is under 103,000 rows individually.

## Per-object detail

Full column/type/constraint/index-level detail for each of the 21 tables
will be captured directly in the forward migration DDL (Phase 8) with the
same rich inline-comment convention already used throughout
`supabase/migrations/` (source, grain, units, null-vs-zero semantics,
confidence thresholds) — not duplicated separately here, to avoid two
documents drifting out of sync. The 18 granted objects' exact
signatures/definitions are already fully captured verbatim in migration
`046_research_api_grant_hardening.sql` (grants) and will be reproduced
verbatim (not reinvented) in the new view/function-creation migration.

## Next
Phase 8 forward migrations will be scoped to exactly these 21 tables + 10
views + 8 functions — nothing more.
