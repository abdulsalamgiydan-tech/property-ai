# ASGS Staging Load Report (Sprint 2, Part C4)

Generated: 2026-07-19T20:17:17Z
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production (`oshquaxsloolqucwvigc`) touched: NO** — verified zero warehouse schemas
before, during and after. **Core promotion performed: NO** (blocked pending approval).

## Inputs

13 official ABS files (529.7 MB) already on disk in `warehouse/data/raw/asgs/ASGS3_2021`
(gitignored, untracked); SHA-256 inventory in `asgs_download_inventory.json`. Source CRS
GDA2020 (EPSG:7844), transformed to EPSG:4326 at staging insert. Lineage: 1 source,
16 datasets, 16 load runs (all succeeded), 16 source files with hashes.

## staging.asgs_geography — 83,393 rows

| level | rows | quarantined | expected (dictionary) |
|---|---|---|---|
| STATE | 10 | 1 | 9 + special codes |
| GCCSA | 35 | 19 | 35 (incl. special codes) |
| SA4 | 108 | 19 | 108 |
| SA3 | 359 | 19 | 359 |
| SA2 | 2,473 | 19 | 2,473 |
| SA1 | 61,845 | 34 | 61,845 |
| LGA | 566 | 19 | 566 |
| SAL | 15,353 | 19 | 15,353 |
| POA | 2,644 | 3 | 2,644 |

Every level loaded at exactly the ABS-published feature count. All 152 quarantined rows
are `missing_geometry`: ABS special-purpose codes (*Migratory – Offshore – Shipping*,
*No usual address*, *Outside Australia*) that are published without boundaries.
Quarantined in place with reasons — nothing dropped, nothing fixed silently.

## staging.asgs_correspondence — 227,318 rows

| pair | rows | quarantined | method |
|---|---|---|---|
| SA1→SAL | 73,131 | 34 | abs_sa1_allocation |
| SA1→POA | 65,318 | 34 | abs_sa1_allocation |
| SA1→LGA | 62,372 | 34 | abs_sa1_allocation |
| SA2→SAL | 17,496 | 19 | derived_sa1_aggregation |
| SA2→POA | 5,904 | 19 | derived_sa1_aggregation |
| SA2→LGA | 3,097 | 19 | derived_sa1_aggregation |

Built from the official ABS Mesh Block allocation files (368,286 MB rows joined on
`MB_CODE_2021`, 0 rows without SA1/SA2 codes), area-weighted on MB Albers areas
(`ratio_basis='area'` until Census dwelling counts are added). SA2 pairs are derived
purely from the same official MB→SA1/SA2 data — no invented files. The 159 quarantined
pairs are `zero_area_source` (the same special codes, which have zero Albers area);
their ratios stay NULL, never zero-filled. **All 6 weight reconciliations passed**
(every source's weights sum to 1.0 ± 0.001).

## Validation

Full staging validation: `asgs_branch_validation_report.md` (Part C5).

## Next step

Part D — promotion to `core.dim_geography` + bridges — only after explicit approval.
