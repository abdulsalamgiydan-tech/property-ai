# National Population-Demand Layer Report (Sprint 11, Workstream 5)

Generated: 2026-07-22

## Source

ABS **Regional Population** (2024-25 financial year release), Table 1 —
Estimated resident population, Statistical Areas Level 2, Australia.
Downloaded live from `abs.gov.au` (direct file download, no bot
protection, verified via plain `curl`). This is genuine **observed ERP**
(Estimated Resident Population) — never a projection, per ABS's own
definition. Geography grain is **SA2**, the ABS's own recommended level
for this product (not suburb/postcode).

## What was built

- 61,335 (SA2 × year) population observations, 2001-2025, across 2,454
  distinct SA2 geographies.
- Derived: 1-year growth (2024→2025) and 5-year annualised growth
  (2020→2025, compound annual growth rate).
- Local DuckDB store + Parquet exports.

## Validation

- **Zero negative population rows.**
- **National total**: 27,613,654 at June 2025 — matches Australia's known
  population closely.
- **Cross-validation (the strongest check)**: the top-5 fastest-growing
  SA2s computed independently from the parsed spreadsheet data were
  compared against ABS's own published narrative on the source page. All
  5 — Fraser Rise-Plumpton, Box Hill-Nelson, Tarneit-North,
  Virginia-Waterloo Corner, Austral-Greendale — appear **verbatim** in
  both lists. This confirms genuine correctness, not coincidental
  plausibility.

## What's NOT done this pass

- The companion "population components" file (natural increase, internal
  migration, overseas migration by SA2) was downloaded and confirmed
  genuine but not yet parsed — only total population and its growth rate
  were built.
- Household/dwelling growth (also requested in Workstream 5) was not
  built this pass — it needs a different ABS input not yet sourced.
- **No population projections were used anywhere** — this sprint's hard
  rule forbids projections in historical metrics.

## Branch promotion status

**Not yet promoted.** SA2 is a new geography level for this project — no
`sa2_market_snapshot` mart table exists yet (only SAL/POA are currently
promoted). Promotion is deliberately deferred to **Workstream 9**, which
owns the SA2/LGA canonical mart schema decisions, so this validated local
population layer becomes that mart's first real content rather than a
one-off table built outside its designated workstream.
