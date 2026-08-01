# Sprint 18.1 — Frozen Source Snapshot Manifest

Snapshot identifier: `wh-snap-2026-07-31-ed76873c`

Date captured: 2026-07-31
Branch: `feature/sprint18-production-warehouse-bootstrap`
Repo commit at capture time: `ea3ff00195b05cd88f7eaa5494b7f38076ab7afb`

## Source identity

- Supabase project ref: `lzonauinzatmtytyoems` (`warehouse-validation`)
- Branch id: `ed76873c-5299-482b-bb9c-27fb9a5bc7e5`
- Parent project ref: `oshquaxsloolqucwvigc` (confirmed via `list_branches`, `with_data: false` — schema-only lineage, no automatic data relationship to Production)
- Branch status at capture: `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`

## Migration state at capture

Latest 5 entries in `supabase_migrations.schema_migrations`:

| version | name |
|---|---|
| 20260730222652 | 047_warehouse_internal_schema_rls |
| 20260725111730 | 046_research_api_grant_hardening |
| 20260725111700 | 045_sprint17_preferences_feedback_controls |
| 20260723211420 | 041_scenario_lab_case_limits |
| 20260723211407 | 040_user_entitlements |

Full warehouse-layer ledger (003–047) previously reconciled in
`sprint18_migration_reconciliation.md` — no change since that reconciliation;
047 (applied this session) is now part of the frozen baseline, not a pending
mutation.

## Schema fingerprint

| schema | table count |
|---|---|
| core | 11 |
| mart | 22 |
| meta | 17 |
| staging | 3 |

Matches the 53-table count RLS was applied to in migration 047. No drift
since that migration was applied.

## Row-count manifest (partial — core facts + top 2 mart tables; full table in Phase 2 allow-list doc)

| table | row count |
|---|---|
| core.dim_geography | 101,215 |
| core.bridge_geography_relationship | 80,591 |
| core.bridge_geography_correspondence | 245,775 |
| core.fact_dwelling_stock | 662,296 |
| core.fact_household_tenure | 496,722 |
| core.fact_building_approvals | 95,550 |
| core.fact_residential_sales_summary | 279,001 |
| core.fact_rental_market_summary | 660,911 |
| core.fact_interest_rates | 2,264 |
| core.fact_dwelling_construction_activity | 6,390 |
| mart.suburb_market_snapshot | 15,334 |
| mart.postcode_market_snapshot | 2,641 |

**Full 53-table census (`pg_stat_user_tables.n_live_tup` — planner-statistics
estimate, not an exact `count(*)`; flagged explicitly, see discrepancy note
below):**

| schema | non-empty tables | empty tables | approx. row total |
|---|---|---|---|
| core | 11 | 0 | 2,623,354 |
| mart | 22 | 0 | 733,586 |
| meta | 14 | 3 (`coverage_result`, `publication_approval`, and one 0-row run log) | 657 |
| staging | 0 | 3 (`asgs_correspondence`, `asgs_geography`, `census_dwelling_stock`) | 0 |
| **Total** | | | **3,357,597** |

**Discrepancy, disclosed not hidden:** `core.fact_residential_sales_summary`
exact `count(*)` = 279,001 (captured above) vs. `n_live_tup` estimate =
271,629 — a ~2.7% gap, expected for a statistics-based estimate that can lag
real autovacuum timing. Exact `count(*)` is authoritative; `n_live_tup` was
used only to get a full 53-table census in one query without an expensive
53-way `count(*)` scan. Every table's exact count must be taken via `count(*)`
before the data-quality gate phase, not assumed from this estimate.

**Empty tables, explicitly called out (per the "do not hide missing data"
rule):** the 3 `staging.*` tables are genuinely empty (transient landing
zone, expected — staging is truncated after each load, not a persistence
layer) and `meta.coverage_result` / `meta.publication_approval` are empty,
meaning no formal coverage-threshold or publication-approval record
currently exists for any dataset. This is a real gap: if the data-quality
gate phase requires a populated `coverage_result`/`publication_approval`
trail as evidence, that evidence does not exist yet on warehouse-validation
and would need to be generated, not assumed present.

## Data-quality manifest

Not yet produced as a formal artifact this phase — deferred to the
dedicated data-quality-gate phase. This manifest currently only proves
*existence and volume*, not per-table completeness/coverage thresholds.

## Explicit non-mutation statement

No writes were made to warehouse-validation during this capture — all
statements were read-only `SELECT`/`information_schema` queries. Migration
047 (applied earlier this sprint) is treated as already part of this frozen
baseline, not something this snapshot re-applies or depends on being reapplied.
