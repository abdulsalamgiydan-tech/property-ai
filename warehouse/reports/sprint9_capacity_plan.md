# Sprint 9 — Branch Capacity Plan

Generated: 2026-07-21 (full detail: `sprint9_capacity_plan.json`)

## Current state

Branch `warehouse-validation` (`lzonauinzatmtytyoems`): **2,052 MB**. Supabase's MCP
project API does not expose a queryable disk-quota field, so this plan reuses the
`MAX_SAFE_DB_MB=4500` ceiling established and consistently used since Sprint 7's branch
loaders. Current utilisation against that ceiling: **45.6%** — well under the 85% stop
threshold.

## Planned new branch objects and size estimate

| object | rows | est. size |
|---|---|---|
| `mart.suburb_market_snapshot` (extended) | 15,334 | ~23 MB |
| `mart.postcode_market_snapshot` (extended) | 2,641 | ~4 MB |
| `mart.suburb_demographic_profile_2021` | 15,334 | ~13 MB |
| `mart.postcode_demographic_profile_2021` | 2,641 | ~2 MB |
| `mart.suburb_market_timeseries` | 46,274 | ~11 MB |
| `mart.postcode_market_timeseries` | 20,003 | ~5 MB |
| `meta.metric_assumption` | ~10 | <1 MB |
| indexes (all new/extended objects) | — | ~60 MB (conservative allowance) |
| **Total** | | **~119 MB** |

**119 MB < 200 MB budget — PASS.** Projected branch size after Sprint 9: ~2,171 MB
(48.2% of the assumed ceiling).

## Documented scope reductions vs. the spec (required disclosure)

The spec's Phase 7 targets (36 months of monthly sales, 20 quarters of rent/yield) were
reduced to keep this sprint's combined footprint safely inside budget:

- **Sales time series: trailing 12 months, not 36.** The branch-resident sales marts only
  carry a trailing-12-month monthly grain (Sprint 7's own capacity decision) — extending
  to 36 months would mean re-promoting 3x the monthly history on top of four other new
  mart families in the same sprint. Deferred to a future sprint if genuinely needed.
- **Sales time series: 2 dwelling types (detached_house, apartment_unit), not all.**
  These are the two types with real NSW-wide sample depth; other types have too few
  branch-resident monthly cells to form a meaningful trend yet.
- **Rent/yield time series: latest ~8 quarters, not 20.** Proportionate to the sales
  reduction above. The existing full-history marts (`mart.suburb_rent_quarterly` etc.)
  remain available for full-history queries — this new mart is specifically a compact
  recent-trend view.
- **Approvals time series: reuses the existing single rolling-12m point per geography**
  rather than duplicating a monthly series, consistent with Sprint 4's own capacity
  decision to keep supply data curated to one current figure.

## Stop conditions checked

- Branch already over 85% before starting: **No** (45.6%).
- Expected growth exceeds 200 MB: **No** (119 MB estimated).

**Decision: PROCEED.**
