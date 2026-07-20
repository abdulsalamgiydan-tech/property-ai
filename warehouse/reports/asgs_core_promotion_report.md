# ASGS Core Promotion Report (Sprint 2, Part D)

Generated: 2026-07-20 (run details: `asgs_core_promotion_report.json`)
Source: **local DuckDB store** `warehouse/data/local/asgs_2021.duckdb` (validated PASSED).
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after commit). **Frontend/app behaviour changed: NO** (no app code touched; nothing wired).
Branch staging tables were NOT reloaded (they stay empty; the local store is staging).

## Run history

- Dry-run: preflight PASSED (store counts matched the approved snapshot; core empty).
- Execute #1: aborted mid-SAL — branch micro compute dropped the connection under
  fixed 100-row batches that re-parsed each WKB 4×. Transaction auto-rolled back;
  core verified back to 0 rows.
- Execute #2 (fixed: byte-capped ≤50-row/≤3 MB batches, single WKB decode via
  LATERAL, client keepalive + error handler): **COMMITTED**.

## Core state (all counts independently re-verified read-only after commit)

**`core.dim_geography` — 83,241 rows** (9 `dim_geography_version` rows, `is_current=true`,
`valid_from` 2021-07-01):

| level | rows | | level | rows |
|---|---|---|---|---|
| STATE | 9 | | SA1 | 61,811 |
| GCCSA | 16 | | LGA | 547 |
| SA4 | 89 | | SAL | 15,334 |
| SA3 | 340 | | POA | 2,641 |
| SA2 | 2,454 | | **total** | **83,241** |

**`core.bridge_geography_relationship` — 80,591 rows**, all `contains`:
- 64,710 strict-hierarchy rows from join-verified parent pointers
  (SA1→SA2 61,811 · SA2→SA3 2,454 · SA3→SA4 340 · SA4→GCCSA 89 · GCCSA→STATE 16)
- 15,881 derived from the ABS STE code: LGA→STATE 547 · SAL→STATE 15,334
- Not emitted (documented, not invented): POA→STATE (postal areas cross state
  borders; no ABS state field); SA4→STATE direct (available transitively).

**`core.bridge_geography_correspondence` — 227,159 rows** (area basis;
population/dwelling weights NULL until Census data lands):

| pair | rows | method | confidence |
|---|---|---|---|
| SA1→SAL | 73,097 | abs_sa1_allocation | 0.9 |
| SA1→POA | 65,284 | abs_sa1_allocation | 0.9 |
| SA1→LGA | 62,338 | abs_sa1_allocation | 0.9 |
| SA2→SAL | 17,477 | derived_sa1_aggregation | 0.8 |
| SA2→POA | 5,885 | derived_sa1_aggregation | 0.8 |
| SA2→LGA | 3,078 | derived_sa1_aggregation | 0.8 |

## Special-purpose records (excluded from core, preserved + documented)

152 geography rows and 159 correspondence rows — the ABS special-purpose codes
(*Migratory – Offshore – Shipping*, *No usual address*, *Outside Australia*) with no
published geometry / zero Albers area. They remain quarantined in the local store
with reasons; `core.dim_geography` has no special-purpose flag, so promoting them
"safely with clear flags" is not possible — no geometry or area was invented.
(Core counts = staging counts minus these rows, level by level.)

## Validation gates (blocking, run inside the transaction and re-verified after)

| gate | result |
|---|---|
| duplicate (type, code, boundary_version) | ✅ 0 |
| invalid geometries (ST_IsValid) | ✅ 0 |
| NULL geography codes | ✅ 0 |
| NULL geometries in core | ✅ 0 |
| zero-area geometries | ✅ 0 |
| SRID | ✅ 4326 only |
| orphan correspondence endpoints | ✅ 0 (0 rows skipped at join) |
| weight reconciliation (Σ preferred_weight = 1.0 ± 0.001 per source per target type) | ✅ 0 violations |

Gate outcomes recorded in `meta.data_quality_result` (stage `core_promotion`).
Branch DB after promotion: **797 MB** — fits the existing disk; no upgrade purchased.

## Next step

Sprint 3: first dataset onto the backbone (e.g. ABS Census dwelling counts to upgrade
correspondence weights from area to dwelling basis), and RLS decisions before anything
moves toward production. Frontend remains unwired by design.
