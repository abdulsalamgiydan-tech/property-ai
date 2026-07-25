# Census Dwelling Branch Load Report (Sprint 3, Part D)

Generated: 2026-07-20 (run details: `census_dwelling_branch_load_report.json`)
Source: local DuckDB store `census_2021.duckdb` (validated PASSED).
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after commit). **Frontend changed: NO.** Migration 006 applied to the branch only.

## Run history

- Execute #1: rolled back — the pooler killed the connection while the script paused
  mid-transaction to read tenure rows from DuckDB (idle-in-transaction). Branch verified
  unchanged.
- Execute #2 (all DuckDB reads moved before the transaction): **COMMITTED**, one
  transaction, all blocking gates green.

## Loaded (branch core + mart)

| table | rows | notes |
|---|---|---|
| `core.fact_dwelling_stock` | 662,296 | 8 measures × 5 levels (SAL 122,672 · POA 21,128 · SA2 19,632 · SA1 494,488 · LGA 4,376); 712 special-code cells excluded by the dim join |
| `core.fact_household_tenure` | 496,722 | 6 tenure types × 5 levels; 534 special-code cells excluded |
| `core.bridge_geography_correspondence` | 221,479 pairs upgraded | `dwelling_weight` + `preferred_weight` now dwelling-based (Census MB counts); area weights preserved in `area_weight`; 5,773 zero-dwelling sources keep area-based preferred weights; 66 special-code pairs skipped |
| `mart.suburb_dwelling_stock_2021` | 15,334 | built from SA1 facts via the dwelling-weighted correspondence bridge |
| `mart.postcode_dwelling_stock_2021` | 2,641 | same method |

Meta lineage: `abs_census` source + 6 datasets + 6 load runs (succeeded) + 6 hashed
source files.

## Blocking gates (in-transaction, re-verified independently after commit)

Duplicate fact grain **0** · NULL `geography_id` **0** · negative counts **0** ·
orphan geography ids **0** · preferred-weight reconciliation violations **0**.

## Mart quality

- Correspondence method: 13,878 SALs fully `sa1_dwelling_weighted`, 1,456
  `sa1_mixed_dwelling_area_weighted` (some contributing SA1s are zero-dwelling and
  keep area weights — clearly labelled per row).
- Confidence: 14,710 high, 624 `insufficient_data` (mostly zero/near-zero-dwelling
  localities; values NULL, never zero-filled).
- National totals: suburb mart 10,318,938 vs postcode mart 10,318,922 total private
  dwellings — consistent with the direct ABS national figure (~10.319M).

## Cross-check: correspondence-built marts vs direct ABS DataPack facts

The SAL/POA packs give ABS-published values for the same measure, so the
correspondence machinery can be scored against ground truth:

| target | areas compared | median abs diff | mean abs diff | within 5 dwellings or 5% |
|---|---|---|---|---|
| SAL | 15,334 | 2.0 dwellings | 3.5 | 93.0% |
| POA | 2,641 | 5.0 dwellings | 7.8 | 96.3% |

Residual differences are dominated by ABS small-cell perturbation, not weighting
error. This validates the SA1→SAL/POA dwelling-weighted pathway for datasets that
are NOT published at SAL/POA directly — the actual purpose of the backbone.

## Capacity note

Branch DB is now 1,487 MB. Fine for current work, but the next large dataset should
either extend the local-first pattern (facts stay local, only marts promoted) or
revisit branch disk. Raw + local stores on disk: ~2.3 GB total, all gitignored.

## Next step

Sprint 4 candidates: NSW Valuer General sales (first market-price source) onto the
backbone, or ABS Building Approvals (supply module). RLS on warehouse schemas still
to be decided before anything approaches production.
