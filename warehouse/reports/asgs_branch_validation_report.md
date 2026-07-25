# ASGS Branch Validation Report (Sprint 2, Part C5)

Generated: 2026-07-19T20:17:17Z
Branch: **warehouse-validation** (`lzonauinzatmtytyoems`).
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`, re-verified
after load). **Core promotion performed: NO.**

## Verdict: staging validation PASSED

| Check | Result |
|---|---|
| All 9 boundary levels present | ✅ STATE 10, GCCSA 35, SA4 108, SA3 359, SA2 2,473, SA1 61,845, LGA 566, SAL 15,353, POA 2,644 (= 83,393 rows, exact ABS feature counts) |
| SA1 correspondences | ✅ SA1→SAL 73,131 · SA1→POA 65,318 · SA1→LGA 62,372 (official MB allocations) |
| SA2 correspondences | ✅ Loaded as `derived_sa1_aggregation` (SA2→SAL 17,496 · SA2→POA 5,904 · SA2→LGA 3,097) — derived from official MB data, not direct ABS files |
| Invalid geometries | ✅ 0 |
| NULL geography codes | ✅ 0 |
| Duplicate codes per type | ✅ 0 |
| Zero-area geometries | ✅ 0 |
| Geometry SRID | ✅ 4326 only |
| Missing lineage (source/dataset/load_run/source_file) | ✅ 0 in both staging tables |
| Weight reconciliation (Σ=1.0 ± 0.001 per source) | ✅ 6/6 pairs, 0 sources off |
| Load runs | ✅ 16/16 succeeded |
| meta.data_quality_result | ✅ 33 rows (blockers all passed; see note) |
| meta.coverage_result | ✅ 9 rows |

## Quarantines (all explained, nothing dropped)

- **Geography: 152 rows, all `missing_geometry`** — ABS special-purpose codes
  (*Migratory – Offshore – Shipping*, *No usual address*, *Outside Australia*), which
  ABS publishes without boundaries: 19 each for GCCSA/SA4/SA3/SA2/LGA/SAL, 34 for SA1,
  3 for POA, 1 for STATE.
- **Correspondence: 159 rows, all `zero_area_source`** — the same special codes carry
  zero Albers area; ratios left NULL (never zero-filled).
- The `geometry_valid` warning rule records these 152 as "failed" by design — they are
  counted and documented, which is the required behaviour (quarantine, don't hide).

## Coverage note

`meta.coverage_result` scores compare **non-quarantined** rows against dictionary
expected counts that *include* special codes, so levels with many special codes score
lower (GCCSA 16/35 = 0.457) even though **every published feature was staged at the
exact ABS count**. Real-boundary coverage is 100% at every level. This convention
mismatch is documented here and in each coverage row's details.

## Next step

Part D: promote staging → `core.dim_geography`, `core.bridge_geography_relationship`,
`core.bridge_geography_correspondence` with blocking gates — **only after explicit
approval** of this validation.
