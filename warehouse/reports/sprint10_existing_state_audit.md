# Sprint 10 — Existing State Audit (Phase 0)

Generated: 2026-07-21 (full detail: `sprint10_existing_state_audit.json`)

## Targets

- Production: `oshquaxsloolqucwvigc` — **0 warehouse schemas**, confirmed distinct from branch.
- Branch: `warehouse-validation` (`lzonauinzatmtytyoems`) — **2,169 MB**, 12 migrations applied (003-014).
- Git: `feature/deal-analyser-budget-2026`, clean working tree, HEAD = Sprint 9's commit.

## Critical discovery: most "Victoria" data already exists

Direct queries confirm `core.dim_geography`, `core.fact_dwelling_stock`,
`core.fact_household_tenure`, `core.fact_building_approvals`, and every
demographic/dwelling-stock/building-approvals **mart** are already **national**,
not NSW-only:

| object | VIC (state_code='2') rows already present |
|---|---|
| `core.dim_geography` (SAL) | 2,944 |
| `core.fact_dwelling_stock` (SAL join) | 23,552 |
| `core.fact_household_tenure` (SAL join) | 17,664 |
| `mart.suburb_demographic_profile_2021` | 2,944 |
| `mart.suburb_dwelling_stock_2021` | 2,944 |
| `mart.suburb_building_approvals` | 2,944 |

This is because Sprints 2 (ASGS), 3 (Census), 4 (Building Approvals via the
national ABS Data API) and 9 (Census demographics, read from the "for AUS"
national GCP DataPack files) were all designed as **national** loads from the
start — only the sales/rent/yield modules were ever NSW-specific (they use
NSW-specific official sources: NSW VG PSI, NSW DCJ Rent and Sales Report).

**Scope impact:** Phase 4 (Victoria geography mapping) only needs
locality-name-to-SAL correspondence for new VIC sales/rent source data — the
ASGS backbone itself needs no new rows. Phase 7 (Victoria supply/demographics)
needs **no new download or local build at all** — only the unified
snapshot-builder SQL needs extending to loop over jurisdictions. This
meaningfully narrows this sprint's true new-work surface to: NSW
reconciliation, VIC sales (new source), VIC rent (new source), VIC yield
(derived), snapshot/timeseries builder generalisation, cross-state API/UI,
and refresh orchestration.

## Largest branch tables

`core.dim_geography` (698 MB total, mostly geometry + GIST index),
`core.fact_dwelling_stock` (402 MB), `core.fact_household_tenure` (228 MB),
`core.fact_rental_market_summary` (163 MB), `core.fact_residential_sales_summary`
(151 MB) — all already national or NSW-full-history, none of which Sprint 10
needs to touch structurally.

## Local storage

~3.3 GB total across all prior sprints' local DuckDB/Parquet stores (ASGS 668 MB,
Census raw 567 MB, ASGS raw 530 MB, NSW sales 411 MB + 331 MB raw, etc.) — all
gitignored, confirmed not tracked.

## Baseline

`npm test`: 35/35 passed. `npm run build`: success. `npm run lint`: 8 errors/4
warnings, all in `components/strategy/StrategyForm.tsx` and
`lib/tax/budget2026*.ts` (pre-existing, unrelated).

## Existing read-only interfaces

6 views + 1 RPC function (migration 014), `security_invoker=false` / `SECURITY
DEFINER` pattern, anon/authenticated granted SELECT/EXECUTE only, core/mart/
staging/meta schemas fully revoked.

## Existing research UI

`/research`, `/research/suburb/[geographyCode]`, `/research/postcode/[geographyCode]`
— NSW-implicit (no state segment). `WAREHOUSE_PREVIEW_ENABLED` disabled by
default. Phase 12 must decide how the new state-scoped route shape coexists
with these — plan: keep existing routes working as NSW-scoped aliases while
adding the new `[stateCode]/[geographyCode]` shape.

## Known unresolved issue (confirmed present, must resolve first)

18,712 NSW sales records were reclassified `detached_house` →
`townhouse_villa_semidetached` in Sprint 9; only the new `townhouse_villa`
cells were added to `core.fact_residential_sales_summary` — existing
`detached_house` rows (loaded Sprint 7, pre-reclassification) were never
rebuilt. Must be fully resolved (Phase 1) before any cross-state comparison
work proceeds, per this sprint's explicit gate.
