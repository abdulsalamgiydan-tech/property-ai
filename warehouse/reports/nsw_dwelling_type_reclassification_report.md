# NSW Dwelling-Type Reclassification Report (Sprint 9, Phase 3)

Generated: 2026-07-20T19:16:38.228Z
Rule set: v2 (`warehouse/config/nsw_dwelling_type_mapping.yml`, full rationale in
`warehouse/docs/NSW_DWELLING_TYPE_CLASSIFICATION.md`). Applied **in place** to the
existing local store — raw extraction/staging/dedup unaffected.

## Distribution — before vs after (dwelling_type totals, all confidence levels)

| dwelling_type | before | after | change |
|---|---|---|---|
| apartment_unit | 1504413 | 1504413 | +0 |
| detached_house | 2556681 | 2537969 | -18712 |
| other_residential | 45570 | 45570 | +0 |
| residential_land | 573465 | 573465 | +0 |
| townhouse_villa_semidetached | 0 | 18712 | +18712 |

## Rule-level counts

Rule 4 (new): **18712** records moved from `detached_house` to
`townhouse_villa_semidetached` (medium confidence) — non-strata RESIDENCE records
carrying a `unit_number` or a `/`-subdivided `house_number`.

Records remaining `unknown_residential`: **0**.

## Confidence distribution (after)

| dwelling_type | confidence | rows |
|---|---|---|
| apartment_unit | medium | 1504413 |
| detached_house | medium | 2537969 |
| other_residential | low | 45570 |
| residential_land | high | 573465 |
| townhouse_villa_semidetached | medium | 18712 |

## Impact on suburb/postcode sales coverage

`nsw_sales_summary` rebuilt: **1395683** rows (full local history, all
years, both grains). `townhouse_villa_semidetached` now has real coverage from the
sales side for the first time:

| geography_type | distinct geographies with a townhouse_villa cell | summary cells |
|---|---|---|
| POA | 445 | 16494 |
| SAL | 1044 | 20470 |

## Impact on yield coverage

Previously, `townhouse_villa_semidetached` had rent-side coverage (DCJ publishes
this dwelling type) but **no** sales-side coverage — the Sprint 6/7 yield marts could
never compute a townhouse/villa yield figure because one side of the calculation was
always missing. This reclassification closes that gap: the next branch load (Phase
5-7) recomputes yield marts matching sales and rent dwelling_type exactly, and
townhouse/villa yield rows become computable for the first time wherever both sides
now have sufficient sample size. This is a coverage improvement, not a narrowing.

## Validation

- Every original source field (`nature_of_property`, `zone_code`, `strata_lot`,
  `unit_number`, `house_number`) is preserved unchanged — only `dwelling_type` and
  `dwelling_type_confidence` were updated.
- No record was reclassified based on price, suburb, or postcode.
- No record was forced out of `unknown_residential`/`other_residential` without
  qualifying evidence — those counts are reported above, not hidden.
