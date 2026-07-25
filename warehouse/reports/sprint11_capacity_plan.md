# Sprint 11 Capacity Plan (Workstream 1)

Generated: 2026-07-21

Starting branch size: **2,359 MB**. Verified plan-included capacity:
**8,192 MB** (Pro plan). Internal safety ceiling kept at **4,500 MB**
(conservative, not loosened to match the verified real ceiling). Hard stop
at 75% of the internal ceiling = **3,375 MB**.

Sprint 11 target growth: **≤500 MB**, preferred **<350 MB**.

## Projected growth (preliminary — revise after WS2)

| item | low (MB) | high (MB) | confidence |
|---|---|---|---|
| 6 new jurisdictions' sales/rent marts | 40 | 180 | low — depends on WS2 findings |
| SA2 + LGA levels for NSW+VIC | 30 | 90 | medium |
| Cross-census correspondence + population history | 15 | 50 | medium |
| National ERP/Regional Population layer | 10 | 30 | medium |
| Research indicator columns (computed, mostly free) | 2 | 10 | high |
| New jurisdictions' meta rows | 1 | 3 | high |
| Migration overhead | 1 | 3 | high |
| **Total** | **99** | **366** | |

Within target even at the high end. The largest uncertainty is
deliberately the first line item — it will not be refined until
Workstream 2's live source discovery for each remaining state completes.

## Fallback options if growth exceeds budget

1. SA2/LGA snapshot-only (no trend series) for the new geography levels.
2. Cross-census population history stays local-only, exposed via a
   computed view rather than materialized rows.
3. Cap new-jurisdiction timeseries to the most recent 2 years.
4. Defer Workstream 8 (historical backfill) to a future sprint if it alone
   would exceed remaining budget.
