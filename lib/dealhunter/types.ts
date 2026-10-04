/**
 * Deal Hunter (V7B) types. A "deal" is a listing evaluated against a user's buy box
 * with strict separation of evidence classes so the UI can label every figure:
 *   1. listing facts (from the provider)      2. Propellect market evidence
 *   3. user-supplied financial assumptions    4. Propellect estimates
 *   5. missing / stale evidence
 * Nothing is fabricated: a value we don't have stays missing.
 */
import type {
  CashflowScenario,
  InvestmentProfile,
  MandatoryMetric,
  MetricProvenance,
  PropertyType,
  RiskTolerance,
} from "@/lib/opportunity/types";
import type { CanonicalListing } from "@/lib/listings/types";

export type NewVsEstablished = "new" | "established" | "either";

export interface BuyBoxHardGates {
  maxPurchasePrice: number;
  depositAvailable: number;
  /** Acquisition-cost buffer (stamp duty + conveyancing) as a % of price, SA-modelled. */
  purchaseCostBufferPct: number;
  eligibleStates: string[];
  propertyTypes: PropertyType[];
  minBedrooms: number | null;
  /** Max modelled weekly out-of-pocket (negative cash flow) the user accepts. */
  maxWeeklyHoldingCost: number;
  /** Explicit user exclusions (suburb ids, property types, keywords). */
  exclusions: string[];
}

export interface BuyBoxSoftPreferences {
  /** -1 = full yield focus … +1 = full growth focus. */
  growthVsYield: number;
  riskTolerance: RiskTolerance;
  newVsEstablished: NewVsEstablished;
  landSizePreference: "prefer_land" | "indifferent";
  /** 0..1 — how much cash-flow buffer the user wants (higher = more conservative). */
  cashflowResilience: number;
  /** Minimum evidence confidence the user wants before trusting a match. */
  dataConfidenceRequirement: "high" | "medium" | "low";
}

/** How one profile answer shaped the buy box (shown to the user). */
export interface BuyBoxExplanation {
  input: string;
  answer: string;
  effect: string;
}

export interface BuyBox {
  version: string;
  hardGates: BuyBoxHardGates;
  softPreferences: BuyBoxSoftPreferences;
  explanations: BuyBoxExplanation[];
  /** The profile this buy box was derived from (for lineage). */
  sourceProfile: InvestmentProfile;
}

/** Per-suburb market evidence (Propellect open-data metrics + provenance). */
export type SuburbEvidence = Partial<Record<MandatoryMetric, MetricProvenance>>;

export type DealBand = "strong" | "moderate" | "weak";

export interface HardGateFailure {
  gate:
    | "above_price_budget"
    | "deposit_too_small"
    | "state_not_eligible"
    | "property_type_excluded"
    | "exceeds_holding_budget"
    | "explicitly_excluded"
    | "below_min_bedrooms";
  detail: string;
}

export interface DealSubScores {
  affordability: number;
  cashflow: number;
  yield: number;
  suburbFit: number;
  propertyFit: number;
  downsideResilience: number;
  evidenceCompleteness: number;
}

export interface DealExplanation {
  whyMatches: string[];
  whyMayNot: string[];
  missingEvidence: string[];
  couldKillDeal: string[];
  verifyNext: string[];
  /** When each material input was last updated (ISO or period), for the "as of" line. */
  asOf: Record<string, string>;
}

export interface DealResult {
  key: string;
  scoreVersion: string;
  suburbName: string | null;
  geographyId: string | null;
  /** Class 1 — provider listing facts (the canonical listing itself). */
  listing: CanonicalListing;
  /** Class 2 — Propellect market evidence for the suburb. */
  marketEvidence: SuburbEvidence;
  /** Class 3 — user assumptions that fed the model. */
  userAssumptions: Record<string, number | string>;
  /** Class 4 — Propellect estimate (reuses the tested cash-flow engine). */
  estimate: CashflowScenario | null;
  /** Class 5 — mandatory evidence that is missing or stale. */
  missing: string[];

  eligible: boolean;
  /** Non-empty when a hard gate failed — NEVER hidden by a high weighted score. */
  hardGateFailures: HardGateFailure[];

  dealScore: number;
  dealBand: DealBand;
  subScores: DealSubScores;
  /** 0..1 evidence confidence. */
  confidence: number;
  /** True when the advertised price is undisclosed/contact-agent (affordability un-gated). */
  priceUndisclosed: boolean;

  explanation: DealExplanation;
}

export interface RankDealsOutput {
  scoreVersion: string;
  asOf: string;
  ranked: DealResult[]; // eligible, sorted deterministically by dealScore desc
  ineligible: DealResult[]; // hard-gate failures, shown separately (never hidden)
  needsReview: DealResult[]; // eligible but price undisclosed / low confidence
}
