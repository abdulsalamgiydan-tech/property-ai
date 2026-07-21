# South Australia Data Method (Sprint 11, Workstream 6)

## Rent

- **Source**: SA Housing Trust "Private Rent Report" (rental bond dataset
  of the Tenancies Branch, Office of Consumer and Business Services),
  published quarterly on data.sa.gov.au as one CKAN resource per quarter.
- **Access**: CKAN `package_show` API resolves all resources; each is a
  direct file download, no bot protection, no authentication. Licence:
  CC BY.
- **Download scope**: all 71 available quarterly resources (2008-06 to
  2026-03) were downloaded in full (~200-650KB each, ~24MB total) via
  `warehouse/scripts/rents/download_sa_rents.mjs` — cheap enough to keep
  the complete history on disk even though only a subset is parsed.
- **Parse scope**: only the current, verified-stable format era —
  **2024-09 to 2026-03 (7 quarters)** — is parsed into the local store.
  The workbook format has three incompatible eras across the full history:
  - 2008-06 to 2012-06 (17 files): legacy OLE2 binary `.xls`, not readable
    by `exceljs`.
  - 2012-09 to 2020-06 (32 files): modern xlsx, "Final Suburbs/Final PC/
    Final Region/Final SLA" sheet names, 30-column pivot layout.
  - 2020-12 to 2024-06 (15 files): modern xlsx, "Suburb/PC/Region/SLA"
    sheet names, 31-column pivot layout (one column different from
    current).
  - 2024-09 to 2026-03 (7 files, **parsed**): current 27-column layout.

  Rather than fabricate a parser across three incompatible layouts in one
  pass, this workstream covers only the verified-stable current era. All
  47 unparsed files remain on disk (gitignored) for a future extension.
- **Grain**: suburb (SAL) and postcode (POA) only. Region (SA Government's
  own non-ASGS regional boundaries) and SLA (a pre-2011 ASGS geography
  needing its own correspondence) sheets exist in every file but are
  out of scope this pass.
- **Dwelling categories**: Flats/Units and Houses each broken out by
  bedroom count (1/2/3/4+) plus a dwelling-type total; an Other/Unknown
  category; and a grand total across all dwelling types.
- **Known source ambiguity**: 3 of 258 postcodes (5118, 5153, 5172) appear
  twice per quarter in the postcode sheet with genuinely different values
  — almost certainly a Metro/Country boundary split with no distinguishing
  label available. Every row for a duplicated raw label is quarantined to
  `geography_confidence='unresolved'` rather than guessing which
  occurrence is correct or summing them into a fabricated combined figure.
- **Suppression**: the source's own `*` convention (1-5 dwellings) is
  mapped to NULL, never fabricated or interpolated.
- **Local build**: `warehouse/scripts/rents/build_sa_rents_local_store.mjs`
  → `warehouse/data/local/sa_rents.duckdb` / `sa_rental_summary.parquet`
  (gitignored).
- **Validation**:
  `warehouse/scripts/rents/validate_sa_rents_local_store.mjs` →
  `warehouse/reports/sa_rents_local_store_report.{json,md}`. All gates
  pass (0 duplicates, 0 negative rents, 0 invalid periods, full
  confidence/derivation labelling).
- **Branch promotion**: not yet performed — deferred to Workstream 9,
  consistent with QLD (Workstream 6) and the WS4/WS5 population layers.

## Sales

No free bulk sales aggregate exists (Workstream 2 finding). Land Services
SA's SAILIS / Property Edge platforms are purchase-based (per-property or
account-based), no free bulk suburb-median product found. Documented as a
coverage gap (`warehouse/reports/south_australia_source_manifest.json`),
not purchased or circumvented.
