# Victoria Data Source Decisions (Sprint 10, Phase 3)

## Sales: Victorian Property Sales Report (VPSR)

**Selected.** Published by the Department of Transport and Planning /
Valuer-General Victoria, CC BY 4.0. Suburb-grain median house/unit/vacant-land
prices, quarterly, with quarter-over-quarter and 12-month percentage changes.

**Key difference from NSW**: this is a **pre-aggregated summary** product
(median by suburb by quarter), not transaction-level bulk data like NSW's
PSI. Victoria's official open-data program does not publish individual
sale transactions publicly — only Valuer-General-computed suburb medians.
This is a legitimate, common pattern for state open-data programs (full
title-transfer registers are typically commercial/restricted-access even
where summary statistics are open). **Decision: use the official aggregate
product as the source of truth for VIC sales**, rather than seeking
transaction-level data through a different (likely commercial or
restricted) channel. This means VIC's local sales store is itself a
*summary* store, not a *transaction* store — documented explicitly as a
structural difference from NSW in `VIC_DWELLING_TYPE_CLASSIFICATION.md`.

**Access**: behind a Cloudflare JS challenge on `land.vic.gov.au`, resolved
via headed browser (same technique as NSW's Sprint 5 Cloudflare challenge —
not a bypass technique, see the source manifest for the full reasoning).

**Dwelling-type coverage**: house, unit, vacant land — three separate
products. No townhouse/villa/semi-detached breakout exists in VPSR (unlike
NSW PSI, which has enough raw evidence fields — `strata_lot`, `unit_number`,
`house_number` patterns — to detect this distinction). VIC's
`townhouse_villa_semidetached` classification will therefore have
**lower or absent coverage** compared to NSW — documented, not invented.

## Rent: Homes Victoria Rental Report

**Selected.** Published by Homes Victoria (DFFH), suburb-grain "Moving
annual rent by suburb", quarterly, with a 25+ year cumulative history in
each file, split by bedroom count (1-3 bed flat, 2-4 bed house) plus an
"All properties" rollup. No bot protection — direct access.

## Demographics, dwelling stock, tenure, building approvals

**Not re-sourced.** Already present nationally on the branch from Sprints
2-4 and 9 (ABS ASGS, Census, Building Approvals) — confirmed via direct
query. Victoria's rows already exist; only the unified snapshot-builder SQL
needs to include them.

## RBA rate context

**Not re-sourced.** National by definition (already loaded Sprint 8) — no
state-specific rate exists to source separately.

## What Victoria will NOT have that NSW has

- Transaction-level sales detail (VIC's official source is aggregate-only).
- A townhouse/villa/semi-detached-specific sales classification (no
  evidence fields exist in the official VPSR product to support this split
  reliably — documented, not invented).
- `population_2016`/`population_growth_2016_2021_pct` — same national
  2016/2021 ASGS boundary-mismatch limitation as NSW (Sprint 9), applies
  identically to every state.
