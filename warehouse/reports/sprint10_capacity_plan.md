# Sprint 10 — Branch Capacity Plan

Generated: 2026-07-21 (full detail: `sprint10_capacity_plan.json`)

## Current state

Branch `warehouse-validation`: **2,169 MB**, 48.2% of the assumed 4,500 MB
ceiling — well under the 75% stop threshold.

## Scope-narrowing finding

Victoria's ASGS geography and Census demographics/dwelling-stock/building-
approvals data **already exist nationally** on the branch (see
`sprint10_existing_state_audit.md`) — zero additional storage needed for
those. Only VIC sales, VIC rent, VIC yield (derived), and jurisdiction-aware
snapshot/timeseries rows are genuinely new growth this sprint.

## Estimated growth

| object | estimated size |
|---|---|
| VIC sales facts (annual full history + trailing-12m monthly, same curation as NSW) | 90-130 MB |
| VIC rent facts | 65-115 MB |
| VIC sales/rent/yield marts | 60-110 MB |
| VIC rows in the existing snapshot tables | 5-8 MB |
| VIC rows in the existing time-series marts | 10-15 MB |
| Migrations 015-017 (schema/views/RPCs/refresh metadata only) | <2 MB |
| **Total** | **~230-280 MB (midpoint ~255 MB)** |

**Within the 300 MB budget**, with limited margin — actual VIC history depth
is confirmed in Phase 3 discovery, and the fallbacks below apply proactively
if that discovery reveals a larger-than-planned dataset.

## Safe fallback options (apply before exceeding budget, not after)

1. Reduce VIC monthly sales promotion to trailing-6m if needed.
2. Promote VIC rent at LGA grain only if suburb/postcode data proves too
   large or unavailable (matches Phase 6's own "don't fabricate suburb
   figures" fallback).
3. Cap VIC sales annual history to the most recent 10 years if VIC's
   archive is longer than NSW's and threatens budget — documented exactly
   like Sprint 9's own capacity reductions.
4. Full VIC transaction-level and full-history rent data stay local-only
   regardless of which fallback is used — never relax local-first to save
   branch space.

## Stop conditions checked

- Branch already over 75% before starting: **No** (48.2%).
- Expected growth exceeds 300 MB: **No** (230-280 MB estimated, re-verified
  live at each branch-load step).

**Decision: PROCEED**, with fallbacks staged and ready.
