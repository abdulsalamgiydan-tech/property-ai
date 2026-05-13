# Deal Analyser — Budget 2026 tax update

## Summary

The Deal Analyser now models the **announced** 2026–27 Federal Budget measures for residential property: negative gearing ring-fencing for **post-budget established** purchases, carry-forward of ring-fenced losses, and a **commencement-based** CGT model (apportionment, indexation, and a **30% minimum effective rate** on real gains in the new regime). Personal-name ownership is assumed; SMSF/trust exemptions are not modelled.

## What changed (code)

- New tax modules under `lib/tax/` (`budget2026TaxModel.ts` entry point and focused helpers for scenario, FY mapping, annual tax impact, CPI, CGT).
- `lib/projections.ts`: `buildCashflowProjectionSeriesBudget2026` produces FY-aware after-tax cashflow and a year-by-year carry-forward ledger.
- `lib/propertyAnalysis.ts`: optional inputs for purchase date, property type, CPI, other rental income, pre-CGT handling, and optional sale assumptions for illustrative CGT; year-one tax uses the same Budget 2026 logic as projections when applicable.
- `lib/analysePropertyForm.ts`: parses new form fields.
- `components/analyse/AnalysePropertyClient.tsx`: tax scenario section, disclaimers, snapshot columns, carry-forward chart, CGT panel, and “Compare scenarios” view.
- `vitest` + `lib/tax/budget2026.test.ts` for classifier, projections, ring-fencing, CGT cases, and scenario ordering.

## Assumptions (see also `lib/tax/budget2026TaxModel.ts`)

- Cut-off: `2026-05-12T19:30:00+10:00`.
- Ring-fence and CGT change: **1 July 2027** (FY messaging uses June-year ends, e.g. first ring-fence salary effect from **2027–28**).
- CPI: single user-supplied annual rate; not ATO quarterly CPI.
- Commencement value for assets held at 1 July 2027: straight-line apportionment unless overridden.
- Other rental income: one aggregate annual figure for absorption of ring-fenced losses.
- Minimum CGT rate: `max(marginalRate, 30%)` on relevant **real** gains; pensioner/social-security carve-out **not** modelled (TODO).

## TODOs for post–Explanatory Memorandum

- Align “new build” definition and edge cases with legislation.
- Replace simplified CPI with ATO indexation series where required.
- SMSF / trust and exempt structures; pensioner 30% floor carve-out; build-to-rent / program exemptions.
- Portfolio-level loss pooling (beyond single `otherRentalIncome`).

## Tests

Run `npm test`. Key scenarios are in `lib/tax/budget2026.test.ts` (grandfathered baseline match, ring-fence accumulation, new build, apportionment, pre-CGT, other rental income, scenario comparison ordering).
