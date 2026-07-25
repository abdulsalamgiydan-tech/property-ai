# Queensland Data Method (Sprint 11, Workstream 6)

## Rent

- **Source**: Residential Tenancies Authority (RTA), Queensland Government —
  "RTA Quarterly Data — Median Rents" workbook (`rta-bond-statistics.xlsx`).
- **Access**: single stable URL, updated in place each quarter, no bot
  protection, no authentication. Live-verified in Workstream 2, downloaded
  for real in Workstream 6.
- **Coverage**: quarterly, Sep 2017 – Jun 2026 (36 quarters), at suburb
  (SAL), LGA, and postcode (POA) grain. Two paired sheets per grain (median
  rent + new-bond count), joined by identical quarter columns.
- **Dwelling categories**: Flat/House/Townhouse by bedroom count (1-4,
  varies by type), plus an "All dwellings" aggregate and an "Other" category
  that exist **only** in the bond-count sheets — the rent sheets never
  publish a median for either, so `dwelling_type IN ('all','other')` rows
  will always carry `median_weekly_rent = NULL` by construction (a genuine
  RTA publishing gap, not an adapter defect).
- **Geography resolution**: suburb and LGA names resolved against the
  branch's ASGS backbone (`core.dim_geography`, state_code='3'). LGA names
  carry a classification suffix, sometimes doubled (e.g. "Central Highlands
  (R) (Qld)") — stripped via a repeated trailing-parenthesis removal. Three
  suburb names (Newtown, The Gap, West End) each denote two distinct real
  suburbs disambiguated by a postcode suffix in the source; both variants
  intentionally resolve to `geography_confidence='unresolved'` rather than
  guessing which postcode maps to which SAL. Postcode-grain rows use the RTA
  postcode value directly (`geography_confidence='direct'`) — no name
  resolution needed.
- **LGA coverage**: RTA reports only 43 of QLD's 78 ASGS LGAs — the
  remainder fall below RTA's own reporting threshold. Documented gap, not
  fabricated.
- **Local build**: `warehouse/scripts/rents/build_qld_rents_local_store.mjs`
  → `warehouse/data/local/qld_rents.duckdb` /
  `qld_rental_summary.parquet` (gitignored).
- **Validation**:
  `warehouse/scripts/rents/validate_qld_rents_local_store.mjs` →
  `warehouse/reports/qld_rents_local_store_report.{json,md}`. All gates
  pass (0 duplicates, 0 negative rents, 0 invalid periods, full
  confidence/derivation labelling).
- **Branch promotion**: not yet performed this workstream — deferred to
  Workstream 9, which owns the canonical national mart schema (SAL/POA/LGA
  rent marts) that this local store will feed into, consistent with how
  Workstream 4/5's outputs were also deferred to their owning workstream.

## Sales

No free bulk sales aggregate exists (Workstream 2 finding). Queensland
Valuer-General property sales/valuation products are fee-based per-property
or per-report only — documented as a coverage gap
(`warehouse/reports/queensland_source_manifest.json`), not purchased or
circumvented.
