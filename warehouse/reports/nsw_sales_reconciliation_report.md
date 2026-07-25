# NSW Sales Reconciliation Report (Sprint 10, Phase 1)

Generated: 2026-07-21. **Verdict: PASSED.**
**Production touched: NO.**

## What this fixes

Sprint 9 reclassified 18,712 NSW sales records from `detached_house` to
`townhouse_villa_semidetached` (torrens-title multi-dwelling evidence) and
fully corrected the **local** `nsw_sales_summary` aggregate — but only
*additively* inserted the new `townhouse_villa_semidetached` cells onto the
branch. Existing `detached_house`/`apartment_unit`/`residential_land`/
`other_residential` rows on the branch still reflected Sprint 7's
pre-reclassification aggregates.

This phase performs a full **UPSERT** (`ON CONFLICT DO UPDATE`, never
`DELETE`) from the corrected local source of truth across
`core.fact_residential_sales_summary` and every dependent mart.

## Reclassification recap

18,712 records moved. Total residential transactions **unchanged**:
4,680,129 before and after (reconciliation only corrects classification and
downstream aggregates — no transaction added, removed, or double-counted).

| dwelling_type | before | after |
|---|---|---|
| apartment_unit | 1,504,413 | 1,504,413 |
| detached_house | 2,556,681 | 2,537,969 |
| residential_land | 573,465 | 573,465 |
| other_residential | 45,570 | 45,570 |
| townhouse_villa_semidetached | 0 | 18,712 |

## Branch rows replaced (UPSERTed)

| object | rows |
|---|---|
| `core.fact_residential_sales_summary` (annual, all types) | 207,240 |
| `core.fact_residential_sales_summary` (trailing-12m monthly, all types) | 45,172 |
| `mart.suburb_sales_monthly` | 49,876 |
| `mart.suburb_sales_annual` | 160,912 |
| `mart.postcode_sales_monthly` | 20,806 |
| `mart.postcode_sales_annual` | 46,479 |
| `mart.suburb_yield_quarterly` | 21,359 |
| `mart.postcode_yield_quarterly` | 42,152 |

Branch `core.fact_residential_sales_summary` now totals **278,073** rows
across all 5 dwelling types (`apartment_unit` 58,614, `detached_house`
129,161, `other_residential` 3,030, `residential_land` 74,725,
`townhouse_villa_semidetached` 12,543).

## Validation gates — all PASS

Duplicate fact/mart grain (5 checks): **0**. Orphan geography IDs: **0**.
Yield rows missing a confidence label (suburb + postcode): **0**.

## Reconciliation proof

Method note: the reconciliation script's data-commit transaction succeeded
and committed on its first execution (confirmed live). A second run intended
only to regenerate this report hit a Supabase pooler timeout on its
(idempotent, no-op) re-verification pass — this report was generated from
independent, fresh MCP queries against the already-committed branch, the
same verification standard used throughout this project.

Three randomly-selected high-transaction-count `detached_house` annual
cells were compared directly between the local corrected source and the
branch after reconciliation — **exact match on median price and transaction
count in all 3 cases**:

| geography | period | local median | branch median | match |
|---|---|---|---|---|
| SAL_11299 | 2002 | $145,000 (n=1,046) | $145,000 (n=1,046) | ✅ |
| SAL_13103 | 2003 | $206,750 (n=1,082) | $206,750 (n=1,082) | ✅ |
| SAL_13258 | 2002 | $260,000 (n=1,216) | $260,000 (n=1,216) | ✅ |

## Branch storage impact

**2,169 MB → 2,334 MB (+165 MB)** — larger than Sprint 9's additive-only
load because this reconciliation UPSERTs the **full multi-decade annual
history** across all 5 dwelling types, correcting every existing cell, not
only adding new ones. This is mandated correctness work (this phase's
explicit blocking requirement), tracked against Sprint 10's overall
capacity budget in `sprint10_capacity_plan.md` — still well within the 75%
absolute safety threshold (2,334 MB is 51.9% of the 4,500 MB ceiling).

## Next step

Rebuild `mart.suburb_market_snapshot`/`postcode_market_snapshot` and the
time-series marts from the now-corrected sales data (using the existing
Sprint 9 upsert-capable builder) before any Victoria branch load, so the
unified marts reflect the correction end-to-end. Victoria work may then
proceed.
