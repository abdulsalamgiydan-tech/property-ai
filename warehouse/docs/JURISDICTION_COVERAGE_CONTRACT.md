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

## Current coverage snapshot (corrected 2026-07-22, Sprint 12 WS1 audit — see `warehouse/reports/national_coverage_audit.md` for the live-queried, machine-generated version of this table, which supersedes any hand-maintained snapshot going forward)

| jurisdiction | sales | rent | yield | supply/demographics | affordability |
|---|---|---|---|---|---|
| NSW | available | available | derived | available | derived |
| VIC | partially_available | available_snapshot_only (latest value only, no time series — see finding below) | derived | available | derived |
| QLD | official_source_paid | available (promoted Sprint 11 WS9) | derived | available | derived |
| SA | official_source_paid | available (promoted Sprint 11 WS9) | derived | available | derived |
| WA | official_source_restricted | available (promoted Sprint 11 WS9, derived medians) | derived | available | derived |
| TAS | official_source_restricted (unverified) | unavailable (blocked — Cloudflare, live-verified WS6; rent search itself was flagged "not final, follow-up needed" — see Sprint 12 WS2) | unavailable | available | unavailable |
| ACT | unavailable | unavailable (live-verified, zero results on official portal) | unavailable | available | unavailable |
| NT | unavailable | unavailable (live-verified, zero results on official portal) | unavailable | available | unavailable |

**Correction note**: this table previously (as of 2026-07-21) showed QLD/SA/WA rent as "unavailable (adapter built, not promoted)" — that was accurate before Sprint 11 Workstream 9 promoted all three to the branch, but the table was never updated afterward. Also previously showed `population_growth` as blocked pending Workstream 4 — WS4 completed later in the same sprint (see `CROSS_CENSUS_HARMONISATION_METHOD.md`). Both corrected here based on a live re-query of the branch, not assumption. VIC rent's "available_snapshot_only" status is a **newly discovered** finding, not previously documented anywhere: VIC's rent pipeline never went through the shared quarterly core-fact/mart pattern the other rent-bearing jurisdictions use, so despite being "onboarded since Sprint 10", it has no rent time series at all, only a single latest-value snapshot.

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
