/**
 * Deal Analyser — Budget 2026 property tax modelling (announced measures, not enacted law).
 *
 * ASSUMPTIONS (illustrative modelling only — not personal advice):
 *
 * 1. Cut-off datetime for grandfathering: 2026-05-12T19:30:00+10:00 (AEST).
 * 2. Negative gearing ring-fence commencement for affected established residential: 1 July 2027.
 * 3. CGT regime change date: 1 July 2027.
 * 4. CPI assumption is a constant annual rate entered by the user; actual indexation will use ATO CPI series.
 * 5. The 1 July 2027 “commencement value” for assets owned at that date uses straight-line apportionment over the
 *    holding period unless the user overrides with a market valuation.
 * 6. Ring-fenced rental losses may offset other positive net rental income in the same income year before being
 *    carried forward; modelled via a single optional `otherRentalIncome` input.
 * 7. Carry-forward losses are applied against the real post-commencement gain (Case B) or real gain (Case C), not
 *    against the pre-commencement nominal gain.
 * 8. Minimum CGT rate on real gains is max(marginalRate, 30%). Pensioners / income-support exemption from the 30%
 *    floor is not modelled — TODO when legislative detail is available.
 * 9. SMSF and widely held trust structures are exempt from the announced NG/CGT changes — not modelled; TODO.
 * 10. New build qualification is taken from the user’s property-type selection; EM will refine definitions.
 * 11. Build-to-rent / government housing program exemptions — TODO (out of scope for this MVP).
 *
 * This module re-exports the Budget 2026 implementation split across focused files.
 */

export * from "@/lib/tax/budget2026Constants";
export * from "@/lib/tax/budget2026Scenario";
export * from "@/lib/tax/budget2026FinancialYear";
export * from "@/lib/tax/budget2026Cpi";
export * from "@/lib/tax/budget2026AnnualTaxImpact";
export * from "@/lib/tax/budget2026Cgt";
