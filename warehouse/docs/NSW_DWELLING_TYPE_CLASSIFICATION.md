# NSW Dwelling-Type Classification (Sprint 9, Phase 3)

Machine-readable rules: `warehouse/config/nsw_dwelling_type_mapping.yml`.
Applied by: `warehouse/scripts/sales/reclassify_nsw_dwelling_types.mjs` (in-place
reclassification of the existing local store) and
`warehouse/scripts/sales/build_nsw_sales_full_state_local_store.mjs` (same rules,
applied at initial build time for any future full rebuild from raw PSI files).

## Why this exists

The NSW Valuer General Property Sales Information (PSI) bulk data has no dedicated
"dwelling type" field. Every classification in this warehouse is derived
deterministically from three raw fields on each sale record: `nature_of_property`
(free text), `zone_code`, and `strata_lot`, plus (new in v2) `unit_number` and
`house_number`. **No inference is ever made from sale price, suburb name, or
postcode** — those correlate with dwelling type in the real world but using them
would mean guessing the very thing the classification is supposed to measure.

## Rule set (v2, current)

| order | dwelling_type | confidence | evidence |
|---|---|---|---|
| 1 | `residential_land` | high | `nature_of_property='VACANT LAND'` or `zone_code='V'` — NSW VG's own explicit category |
| 2 | `townhouse_villa_semidetached` | high | `nature_of_property` free text itself contains UNIT/FLAT/VILLA/TOWNHOUSE/HOME UNIT |
| 3 | `apartment_unit` | medium | `nature_of_property='RESIDENCE'` with a non-blank `strata_lot` (legal strata registration) |
| 4 | `townhouse_villa_semidetached` | medium | **NEW**: `RESIDENCE`, no strata_lot, but `unit_number` set or `house_number` contains `/` — the standard torrens-title multi-dwelling address signal |
| 5 | `detached_house` | medium | `RESIDENCE`, no strata_lot, no unit_number, no slash in house_number — single-address default |
| 6 | `other_residential` | low | Zoned/flagged residential but `nature_of_property` missing or unrecognised |
| 7 | `unknown_residential` | low | Catch-all safety net (should be rare/zero) |

Non-residential records (`is_residential = false`) are excluded entirely —
`dwelling_type` stays `NULL`, never forced into a residential bucket.

## What changed in v2 (this sprint)

**Rule 4 is new.** Previously, every non-strata `RESIDENCE` record fell straight
into `detached_house` (rule 5) regardless of `unit_number`/`house_number`. Phase 0's
data audit found 18,712 of the 2,556,681 records in that bucket (0.73%) carry a
`unit_number` or a `/`-subdivided `house_number` — the standard NSW address form for
a torrens-title villa/townhouse/duplex development that was never strata-plan'd
(confirmed by direct sample inspection: e.g. "14 East Cres" has 6 distinct
`unit_number` values, clearly a multi-dwelling development, not one house). These
records now move from `detached_house` to `townhouse_villa_semidetached` at
`medium` confidence.

## Why no `duplex` category

A distinct `duplex` bucket was considered and **rejected**. NSW PSI data has no
field that reliably separates a 2-dwelling duplex from a 3+-dwelling townhouse/villa
row without inferring from lot count or price — both forbidden by this sprint's
rules. Duplexes are covered by the `townhouse_villa_semidetached` bucket instead of
inventing an unsupported, falsely-precise split.

## Confidence labels are about classification certainty, not sample size

`dwelling_type_confidence` here describes how sure the *classification rule* is
(e.g. "medium" because a torrens-title unit-number signal, while standard, cannot
100% rule out an undetected granny flat). This is separate from
`sample_size_confidence` on the sales summary marts, which describes how many
transactions back a given median — the two confidence concepts are never conflated.

## Recalculation scope

Reclassification is applied **in place** to the existing local DuckDB store
(`nsw_sales.duckdb :: nsw_sales_transactions_raw`, 5.2M residential rows) — the raw
extraction/staging/dedup steps are not re-run (they are unaffected by this change;
only the `dwelling_type`/`dwelling_type_confidence` columns are updated for the
affected subset). `nsw_sales_summary` (the monthly/annual aggregation feeding every
sales mart) is fully rebuilt afterwards so every downstream median/count reflects the
new classification. See `nsw_dwelling_type_reclassification_report.md` for exact
before/after counts and the resulting impact on suburb/postcode sales and yield
coverage.
