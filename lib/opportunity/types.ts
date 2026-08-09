/**
 * Provider-neutral types for the Investment Opportunity Engine (V6A).
 *
 * The engine consumes the shape returned by the `get_investment_candidates_v1`
 * RPC — a per-suburb metrics map where every metric carries its own provenance.
 * Adding Domain / PropTrack / Cotality changes the data layer, never these types.
 */

export type Strategy = "growth" | "balanced" | "yield";

/** UI labels; "yield" is surfaced to users as "Cash-flow". */
export const STRATEGY_LABELS: Record<Strategy, string> = {
  growth: "Growth",
  balanced: "Balanced",
  yield: "Cash-flow",
};

export type PropertyType = "house" | "unit";
export type RiskTolerance = "low" | "medium" | "high";

/** One warehouse metric value + its full provenance (as returned in the RPC jsonb). */
export interface MetricProvenance {
  value: number;
  unit: string | null;
  sample_size: number | null;
  period_start: string | null;
  period_end: string | null;
  status: "direct" | "derived";
  source_id: string | null;
  licence: string | null;
  attribution: string | null;
  /** ISO timestamp of the underlying observation's freshness. */
  retrieved_at: string | null;
  provider: string;
}

/** One candidate suburb row from the consumer RPC (mandatory metrics keyed by name). */
export interface CandidateRow {
  geography_id: string;
  jurisdiction: string;
  property_type: PropertyType;
  suburb_name?: string | null;
  metrics: Record<string, MetricProvenance>;
  /** Optional evidence presence (from the snapshot RPC), used only for confidence. */
  hasSupplyEvidence?: boolean;
  hasDemographicEvidence?: boolean;
}

/** The user's Find My Investment profile. */
export interface InvestmentProfile {
  maxPrice: number;
  deposit: number;
  strategy: Strategy;
  /** Max weekly out-of-pocket the user will accept (AUD/week, >= 0). */
  acceptableWeeklyHoldingCost: number;
  propertyType: PropertyType;
  /** Allowed jurisdictions, e.g. ["SA"]. Others are honestly blocked. */
  states: string[];
  riskTolerance: RiskTolerance;
  holdingPeriodYears: number;
}

export const MANDATORY_METRICS = [
  "median_house_price",
  "median_rent",
  "gross_yield",
  "sales_volume",
  "price_growth_12m",
] as const;
export type MandatoryMetric = (typeof MANDATORY_METRICS)[number];

export type OpportunityBand = "strong" | "moderate" | "weak";
export type ConfidenceBand = "high" | "medium" | "low" | "insufficient";

export type ExclusionReason =
  | "wrong_property_type"
  | "state_not_offered"
  | "missing_mandatory_evidence"
  | "stale_evidence"
  | "above_price_budget"
  | "deposit_too_small"
  | "exceeds_holding_budget";

export interface CashflowScenario {
  grossYieldPct: number;
  weeklyPreTaxCashflow: number;
  weeklyAfterTaxCashflow: number;
  annualAfterTaxCashflow: number;
  /** Out-of-pocket per week (pre-tax), 0 when cashflow-positive. Gate input. */
  weeklyHoldingCost: number;
  lvr: number;
  totalCashRequired: number;
  assumptions: Record<string, number | string>;
}

export interface RankedResult {
  geographyId: string;
  jurisdiction: string;
  propertyType: PropertyType;
  suburbName: string | null;
  scoreVersion: string;
  strategy: Strategy;
  weights: { growth: number; demand: number; yield: number };
  opportunityScore: number;
  opportunityBand: OpportunityBand;
  subIndices: { growth: number; demand: number; yield: number };
  confidence: number;
  confidenceBand: ConfidenceBand;
  affordabilityFit: number;
  stale: boolean;
  scenario: CashflowScenario;
  /** Provenance-carrying evidence for every material figure. */
  evidence: Record<MandatoryMetric, MetricProvenance>;
  reasonsFor: string[];
  reasonsAgainst: string[];
  missingEvidence: string[];
}

export interface ExcludedResult {
  geographyId: string;
  suburbName: string | null;
  reason: ExclusionReason;
  detail: string;
}

export interface RankOutput {
  scoreVersion: string;
  strategy: Strategy;
  asOf: string;
  ranked: RankedResult[];
  excluded: ExcludedResult[];
  /** True when the requested state is not offered for ranking at all. */
  stateBlocked: boolean;
}
