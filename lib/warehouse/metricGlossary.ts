/**
 * Plain-English definitions and formulas for every metric family
 * surfaced by AboutThisMetric (Sprint 13 WS10). Kept separate from the
 * per-jurisdiction lineage data (meta.metric_lineage_registry, fetched
 * live) because this text is universal and stable across every
 * geography — it doesn't need a database round trip, and it should
 * render even if the live lineage fetch fails or a jurisdiction hasn't
 * been registered yet.
 */

export type MetricFamily =
  | "sales"
  | "rent"
  | "yield"
  | "approvals"
  | "dwelling_stock"
  | "demographics"
  | "population_growth"
  | "affordability";

export type MetricGlossaryEntry = {
  definition: string;
  formula: string | null;
  confidenceMeaning: string;
  knownLimitations: string;
};

export const METRIC_GLOSSARY: Record<MetricFamily, MetricGlossaryEntry> = {
  sales: {
    definition: "The middle value of residential sale prices recorded in this geography over the trailing 12 months.",
    formula: "Median of all recorded sale prices in the period — not a mean/average, and not adjusted for dwelling type mix unless shown split out.",
    confidenceMeaning: "Confidence reflects sample size — a suburb with very few recorded sales in the period carries a lower confidence label, since a median from a handful of transactions is less stable.",
    knownLimitations: "Excludes off-market and unrecorded private sales. Periods may not align exactly with rent/yield figures shown alongside it.",
  },
  rent: {
    definition: "The middle value of weekly rents from bonds lodged (or listed rents, depending on jurisdiction) in this geography for the latest available period.",
    formula: "Median of all recorded weekly rents in the period.",
    confidenceMeaning: "Confidence reflects both sample size and, for some jurisdictions, whether the figure is direct (published by the source) or derived (computed in-house from raw records) — see the source/method line below.",
    knownLimitations: "Rent coverage varies significantly by state — see the suburb's Data confidence section for exactly which periods and geography grains are available.",
  },
  yield: {
    definition: "Gross rental yield — the annualised rent as a percentage of the sale price, before any costs, tax or vacancy are deducted.",
    formula: "(median weekly rent x 52) / median sale price x 100",
    confidenceMeaning: "Always at most as confident as the weaker of its two underlying inputs (sales and rent) — a high-confidence yield requires both a confident price and a confident rent figure for the same geography.",
    knownLimitations: "Sales and rent periods are not forced to align, so this is a snapshot combination of two independently-sourced figures, not a matched-pair calculation for the exact same properties.",
  },
  approvals: {
    definition: "The count of new residential dwelling building approvals recorded in this geography over the trailing 12 months — a leading indicator of future housing supply, not completed construction.",
    formula: "Sum of ABS building-approval records for the period, also shown per 1,000 existing dwellings for cross-geography comparability.",
    confidenceMeaning: "Confidence here reflects data completeness for the geography/period, not a statistical sample-size concept — approvals are an administrative count, not a survey.",
    knownLimitations: "An approval is not a guarantee construction proceeds or on what timeline. Cannot be compared to sales/rent to imply a supply-demand ratio without additional context.",
  },
  dwelling_stock: {
    definition: "The total number of private dwellings recorded in this geography at the last Census.",
    formula: "Direct Census count, not derived.",
    confidenceMeaning: "This is a direct Census figure at every jurisdiction — always full confidence unless the geography itself has a boundary-correspondence caveat noted elsewhere.",
    knownLimitations: "Only refreshes on a 5-yearly Census cycle — it will not reflect very recent construction until the next Census.",
  },
  demographics: {
    definition: "Population, household and income figures from the most recent Census for this geography.",
    formula: "Direct Census counts/medians, not derived (except population growth — see that metric separately).",
    confidenceMeaning: "Direct Census data — full confidence, subject only to the Census's own small-cell suppression rules for very small geographies.",
    knownLimitations: "Refreshes only on a 5-yearly Census cycle. Very small geographies may have some figures suppressed for privacy.",
  },
  population_growth: {
    definition: "The estimated percentage change in population between the 2016 and 2021 Censuses for this geography.",
    formula: "2021 population vs. a population-weighted reconciliation of the 2016 figure onto 2021 boundaries (2016 and 2021 Census geography boundaries are not identical).",
    confidenceMeaning: "Derived, not direct — confidence reflects how well the 2016-to-2021 boundary correspondence could be reconciled for this specific geography (national reconciliation accuracy is 99.8%, within a documented ±0.5% tolerance).",
    knownLimitations: "Not available for every geography if its 2016 boundary equivalent couldn't be reconciled with sufficient confidence. Not a projection of future growth.",
  },
  affordability: {
    definition: "Illustrative modelling of loan repayment burden against local household income, using a shared national assumption scenario (deposit %, loan term, current RBA lending rate).",
    formula: "Price-to-income = median sale price / (median weekly household income x 52). Repayment-to-income = estimated monthly P&I repayment / (median weekly household income x 52 / 12).",
    confidenceMeaning: "Always derived — requires median sale price, median household income and the current RBA rate all to be present for this geography; if any is missing, the figure is unavailable rather than partially computed.",
    knownLimitations: "Excludes stamp duty, LMI, loan fees and any other property-specific costs. Uses one shared national assumption scenario, not a personalised one — not a recommendation about what any individual can or should borrow.",
  },
};
