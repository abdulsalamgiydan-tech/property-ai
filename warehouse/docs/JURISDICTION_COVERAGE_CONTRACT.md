# Jurisdiction Coverage Contract (Sprint 11, Workstream 3)

Source of truth: `warehouse/config/jurisdiction_coverage.yml`. This
document explains the contract; the yml is what code reads (once loaded
into a queryable table/view, see Workstream 20).

## Purpose

Prevent the product from ever implying that all 8 jurisdictions have
equivalent data. Every research page must be able to answer, per metric,
per geography: is this available, partially available, derived, stale,
unavailable, or blocked by a restricted/paid official source?

## Status vocabulary

| status | meaning |
|---|---|
| `available` | direct official data loaded (or a confirmed free source ready to build) |
| `partially_available` | available at a coarser geography or narrower detail than ideal |
| `derived` | computed from other available inputs |
| `stale` | was available, source overdue for refresh |
| `unavailable` | no official source identified |
| `official_source_restricted` | a source exists but licence/access terms are unclear |
| `official_source_paid` | a source exists but requires payment, not purchased without approval |

## Current coverage snapshot (2026-07-21)

| jurisdiction | sales | rent | yield | supply/demographics | affordability |
|---|---|---|---|---|---|
| NSW | available | available | derived | available | derived |
| VIC | partially_available | partially_available | derived | available | derived |
| QLD | official_source_paid | unavailable (source selected) | unavailable | available | unavailable |
| SA | official_source_paid | unavailable (source selected) | unavailable | available | unavailable |
| WA | official_source_restricted | unavailable (source selected) | unavailable | available | unavailable |
| TAS | official_source_restricted (unverified) | unavailable (unverified) | unavailable | available | unavailable |
| ACT | unavailable | unavailable | unavailable | available | unavailable |
| NT | unavailable | unavailable | unavailable | available | unavailable |

## Key structural findings this sprint

1. **Supply and demographic context is universal.** `dwelling_stock`,
   `building_approvals`, `demographics`, `income`, and `tenure` are
   `available` for all 8 jurisdictions today — this was already true
   before Sprint 11 began (ASGS/Census/Building Approvals were loaded
   nationally in Sprints 2-4), confirmed by direct query per state, not
   assumed.
2. **`population_growth` is capped at `partially_available` everywhere**
   until Workstream 4's 2016-2021 Census harmonisation completes — a
   single-Census population figure exists now; the growth rate does not.
3. **`land_values`, `vacancy`, and `planning_pipeline` are unavailable
   nationally** — no official free bulk source was found for any of these
   three metric families in any jurisdiction, including NSW/VIC. This is
   an honest gap, not a jurisdiction-specific one.
4. **`affordability` only becomes available once a jurisdiction has a
   sales source** (it needs a price input) — it will use the exact same
   shared national assumption scenario as NSW/VIC when it does, never a
   per-state redefinition.

## How the UI must use this

Every research page (snapshot, compare, explore, map, data-status) must
render a per-metric availability badge sourced from this contract — never
silently omit a metric that's `unavailable` as if it simply doesn't exist
for that geography, and never render a `derived` value with the same
visual weight as a `direct` one without a confidence/provenance label.
