/**
 * Deterministic evidence layer for the research copilot (Sprint 14 WS5).
 * Turns a market snapshot into a fixed, labelled list of facts — the ONLY
 * source of truth the LLM is allowed to draw numbers from. This module
 * makes no network call and has no LLM dependency; it is pure and fully
 * testable on its own, by design, per the brief's requirement to build
 * the deterministic evidence/retrieval layer before any model call.
 *
 * Every fact is either a real recorded warehouse value (with its
 * confidence label, when one exists) or explicitly "not recorded" — never
 * silently omitted, never a fabricated placeholder.
 */

export type EvidenceFact = {
  id: string;
  label: string;
  /** Human-readable value string, or "Not recorded" — never blank/omitted. */
  value: string;
  confidence: string | null;
  sourcePeriod: string | null;
};

export type EvidenceSnapshotInput = {
  geographyLabel: string;
  medianSalePrice12m: number | null;
  salesConfidence: string | null;
  latestSalesPeriod: string | null;
  medianWeeklyRent: number | null;
  rentConfidence: string | null;
  latestRentPeriod: string | null;
  grossYieldPct: number | null;
  yieldConfidence: string | null;
  dwellingStockTotal: number | null;
  approvals12m: number | null;
  totalPopulation: number | null;
  medianWeeklyHouseholdIncome: number | null;
  priceToIncomeRatio: number | null;
  affordabilityConfidence: string | null;
};

function moneyOrNotRecorded(v: number | null): string {
  return v == null ? "Not recorded" : `$${Math.round(v).toLocaleString("en-AU")}`;
}

function countOrNotRecorded(v: number | null): string {
  return v == null ? "Not recorded" : v.toLocaleString("en-AU");
}

function pctOrNotRecorded(v: number | null): string {
  return v == null ? "Not recorded" : `${v.toFixed(2)}%`;
}

function ratioOrNotRecorded(v: number | null): string {
  return v == null ? "Not recorded" : v.toFixed(1);
}

/**
 * Builds the fixed evidence pack for one geography. Field order here is
 * also the order the pack is presented to the model in — deliberately
 * stable, not driven by which fields happen to be non-null, so a missing
 * fact is exactly as visible as a present one.
 */
export function buildEvidencePack(input: EvidenceSnapshotInput): EvidenceFact[] {
  return [
    {
      id: "median_sale_price",
      label: `Median sale price (12m) in ${input.geographyLabel}`,
      value: moneyOrNotRecorded(input.medianSalePrice12m),
      confidence: input.salesConfidence,
      sourcePeriod: input.latestSalesPeriod,
    },
    {
      id: "median_weekly_rent",
      label: `Median weekly rent in ${input.geographyLabel}`,
      value: moneyOrNotRecorded(input.medianWeeklyRent),
      confidence: input.rentConfidence,
      sourcePeriod: input.latestRentPeriod,
    },
    {
      id: "gross_yield",
      label: `Gross rental yield in ${input.geographyLabel}`,
      value: pctOrNotRecorded(input.grossYieldPct),
      confidence: input.yieldConfidence,
      sourcePeriod: input.latestSalesPeriod,
    },
    {
      id: "dwelling_stock",
      label: `Total dwelling stock in ${input.geographyLabel}`,
      value: countOrNotRecorded(input.dwellingStockTotal),
      confidence: null,
      sourcePeriod: null,
    },
    {
      id: "approvals_12m",
      label: `Building approvals (12m) in ${input.geographyLabel}`,
      value: countOrNotRecorded(input.approvals12m),
      confidence: null,
      sourcePeriod: null,
    },
    {
      id: "population",
      label: `Total population in ${input.geographyLabel}`,
      value: countOrNotRecorded(input.totalPopulation),
      confidence: null,
      sourcePeriod: null,
    },
    {
      id: "household_income",
      label: `Median weekly household income in ${input.geographyLabel}`,
      value: moneyOrNotRecorded(input.medianWeeklyHouseholdIncome),
      confidence: input.affordabilityConfidence,
      sourcePeriod: null,
    },
    {
      id: "price_to_income",
      label: `Price-to-income ratio in ${input.geographyLabel}`,
      value: ratioOrNotRecorded(input.priceToIncomeRatio),
      confidence: input.affordabilityConfidence,
      sourcePeriod: null,
    },
  ];
}

/**
 * Renders the evidence pack as plain text for the LLM prompt — one fact
 * per line, so the system prompt can instruct the model to answer using
 * only these lines and nothing else.
 */
export function formatEvidenceForPrompt(facts: EvidenceFact[]): string {
  return facts
    .map((f) => {
      const parts = [`${f.label}: ${f.value}`];
      if (f.confidence) parts.push(`confidence: ${f.confidence}`);
      if (f.sourcePeriod) parts.push(`as at: ${f.sourcePeriod}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}
