# Western Australia Data Method (Sprint 11, Workstream 6)

## Rent

- **Source**: WA DMIRS (Department of Mines, Industry Regulation and
  Safety) "Rental Bonds Data", published monthly, hosted via the National
  Housing Data Exchange government open-data aggregator. The dataset page
  explicitly attributes the data to "Government of Western Australia
  (Department of Mines, Industry Regulation and Safety)" under CC BY 4.0
  — verified live before download, since this is a third-party-hosted
  mirror rather than the primary WA government domain.
- **Structurally different from every other source in this sprint**: the
  source publishes only RAW individual bond-lodgement records (lodgement
  date, locality name, postcode, weekly rent amount) — no pre-computed
  median exists anywhere in the source. This adapter computes its own
  suburb- and postcode-grain medians in-house from ~246,759 raw records
  across 39 monthly files (Mar 2023 - May 2026). Every resulting
  `median_weekly_rent` is labelled `direct_or_derived='derived'`, the only
  jurisdiction this sprint where that label is ever anything other than
  `'direct'`.
- **No dwelling-type/bedroom breakdown**: the raw lodgement record simply
  doesn't capture it — every row is `dwelling_type='all'`,
  `bedroom_count=null`. An honest source limitation, not a build gap.
- **Geography resolution**: the `LOCALITY NAME` field is genuinely
  free-text (unlike QLD/SA's curated pivot-table row labels) and contains
  a meaningful amount of noise — typos ("BECKEHNHAM", "BOYUP BEOOK"),
  street addresses accidentally entered ("4 WINGFIELD AVENUE"), and
  trailing state abbreviations ("ASHBY WA", "ASHBY, WA"). The trailing
  " WA" / ", WA" suffix is stripped (unambiguous — "WA" is never itself
  part of a WA suburb name), recovering 53 otherwise-unresolved suburb
  labels. Genuine typos and address fragments are left as
  `geography_confidence='unresolved'` rather than fuzzy-matched or
  guessed — 211 of 993 distinct suburb labels (21%) remain unresolved,
  reflecting real noise in this particular raw government dataset, not
  a defect in the resolution logic.
- **Postcode-grain rows**: postcode is a clean numeric field in the raw
  source, always `geography_confidence='direct'`.
- **Local build**: `warehouse/scripts/rents/build_wa_rents_local_store.mjs`
  → `warehouse/data/local/wa_rents.duckdb` / `wa_rental_summary.parquet`
  (gitignored). Raw per-lodgement rows are aggregated then dropped from
  the local DB (not needed after aggregation), keeping it small (~3MB).
- **Validation**:
  `warehouse/scripts/rents/validate_wa_rents_local_store.mjs` →
  `warehouse/reports/wa_rents_local_store_report.{json,md}`. All gates
  pass (0 duplicates, 0 negative rents/counts, 0 invalid periods, full
  confidence/derivation labelling, `derived` label verified never
  mislabelled as `direct`).
- **Branch promotion**: not yet performed — deferred to Workstream 9,
  consistent with QLD and SA (also Workstream 6).

## Sales

No free bulk sales aggregate exists (Workstream 2 finding). Landgate's
property sales reports are explicitly "Order now" (fee-based) products;
the free open-data catalogue's "Sales Evidence data" entry hosts only a
data dictionary under a Personal Use License, not usable bulk data — and
that licence's compatibility with this project's use case is unclear
regardless. Documented as a coverage gap
(`warehouse/reports/western_australia_source_manifest.json`), not
purchased or circumvented.
