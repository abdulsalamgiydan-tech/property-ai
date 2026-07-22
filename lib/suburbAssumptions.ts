/**
 * Suburb-keyed suggested inputs for Advanced Assumptions (growth, vacancy, rental growth).
 *
 * Backed by /api/analyse/suburb-suggestions (Sprint 13 WS5), which resolves
 * a suburb name + state against the research warehouse's NSW/VIC market
 * snapshots — the only jurisdictions with suburb-level sales+rent coverage
 * today (see warehouse/config/jurisdiction_coverage.yml). Every field is a
 * real, sourced figure or explicitly absent; nothing here is fabricated,
 * and none of it is a forecast of future returns — suburbGrowthPercent and
 * rentalGrowthPercent are recent 12-month historical changes, not
 * predictions. There is no vacancy-rate source in the warehouse for any
 * jurisdiction, so vacancyPercent is always null.
 */

export type SuburbSuggestedAssumptions = {
  suburbGrowthPercent: number | null;
  vacancyPercent: number | null;
  rentalGrowthPercent: number | null;
};

export type SuburbSuggestionOutcome =
  | {
      available: true;
      geographyId: string;
      geographyCode: string;
      geographyName: string;
      suggestions: SuburbSuggestedAssumptions;
      medianSalePrice12m: number | null;
      medianWeeklyRentLatest: number | null;
    }
  | {
      available: false;
      reason: "state_not_covered" | "no_match" | "insufficient_data" | "feature_disabled" | "request_failed";
    };

export async function getSuggestedAssumptionsForSuburb(
  suburbTrimmed: string,
  stateCode: string
): Promise<SuburbSuggestionOutcome> {
  if (!suburbTrimmed) return { available: false, reason: "no_match" };
  try {
    const params = new URLSearchParams({ suburb: suburbTrimmed, state: stateCode });
    const res = await fetch(`/api/analyse/suburb-suggestions?${params.toString()}`);
    if (!res.ok && res.status !== 400) {
      // A 404 means the feature flag is off; treat any other non-2xx as a
      // soft failure too — suggestions are a convenience, never block the
      // user's own manual entry.
      return { available: false, reason: res.status === 404 ? "feature_disabled" : "request_failed" };
    }
    const data = (await res.json()) as SuburbSuggestionOutcome;
    return data;
  } catch {
    return { available: false, reason: "request_failed" };
  }
}

/** Shown when suburb-based suggestions were applied to Advanced Assumptions (not a prediction). */
export const SUBURB_SUGGESTION_BANNER =
  "Suggested assumptions from recent suburb history are applied to growth, vacancy and rental growth below — always editable, not a forecast of future returns.";

/** Shown when a state has no suburb-level warehouse coverage yet. */
export const SUBURB_SUGGESTION_NOT_COVERED_MESSAGE =
  "Suburb-based suggestions aren't available for this state yet — NSW and VIC only, more states coming.";
