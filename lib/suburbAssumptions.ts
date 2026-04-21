/**
 * Suburb-keyed suggested inputs for Advanced Assumptions (growth, vacancy, rental growth).
 *
 * When real suburb history is connected, implement `getSuggestedAssumptionsForSuburb` to return
 * editable numbers derived from recent data. Do not treat these as forecasts of future returns.
 *
 * Until a data source exists, this returns null so the form keeps its normal manual defaults.
 */

export type SuburbSuggestedAssumptions = {
  suburbGrowthPercent: number;
  vacancyPercent: number;
  rentalGrowthPercent: number;
};

export function getSuggestedAssumptionsForSuburb(
  suburbTrimmed: string
): SuburbSuggestedAssumptions | null {
  if (!suburbTrimmed) return null;
  // Future: resolve suburb → recent historical medians / bands, then return editable suggestions.
  void suburbTrimmed;
  return null;
}

/** Shown when suburb-based suggestions were applied to Advanced Assumptions (not a prediction). */
export const SUBURB_SUGGESTION_BANNER =
  "Suggested assumptions from recent suburb history are applied to growth, vacancy and rental growth below — always editable, not a forecast of future returns.";
