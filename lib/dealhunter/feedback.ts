/**
 * Feedback loop (V7B, part G). Captures explicit signals and proposes TRANSPARENT
 * preference adjustments. It never silently changes rankings and never trains an
 * opaque model — it produces plain-English proposals the user must approve.
 */
import type { InvestmentProfile } from "@/lib/opportunity/types";

export type FeedbackSignalKind = "saved" | "passed" | "rejected" | "compared" | "brief_opened" | "dd_status";

/** Standard rejection reasons (required when passing/rejecting). */
export type RejectionReason =
  | "too_expensive"
  | "poor_cashflow"
  | "wrong_location"
  | "too_small"
  | "condition_or_risk"
  | "low_confidence"
  | "other";

export interface FeedbackSignal {
  listingKey: string;
  kind: FeedbackSignalKind;
  reason?: RejectionReason;
  at: string;
}

export interface PreferenceProposal {
  field: keyof InvestmentProfile | "acceptableWeeklyHoldingCost" | "strategy";
  from: string | number;
  to: string | number;
  rationale: string;
  /** How many signals support this proposal. */
  support: number;
}

const money = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;

/**
 * Turn a batch of signals into transparent, evidence-backed proposals. Only fires
 * when a reason recurs enough to be a signal, not noise (min 2 supporting signals).
 * Deterministic; returns an empty list when nothing is strong enough.
 */
export function proposePreferenceAdjustments(
  profile: InvestmentProfile,
  signals: FeedbackSignal[],
  opts: { minSupport?: number } = {},
): PreferenceProposal[] {
  const minSupport = opts.minSupport ?? 2;
  const rejects = signals.filter((s) => (s.kind === "rejected" || s.kind === "passed") && s.reason);
  const count = (r: RejectionReason) => rejects.filter((s) => s.reason === r).length;

  const proposals: PreferenceProposal[] = [];

  const tooExpensive = count("too_expensive");
  if (tooExpensive >= minSupport) {
    const to = Math.round(profile.maxPrice * 0.9);
    proposals.push({ field: "maxPrice", from: money(profile.maxPrice), to: money(to), rationale: `You passed ${tooExpensive} listings as too expensive — consider lowering your price ceiling ~10%.`, support: tooExpensive });
  }

  const poorCashflow = count("poor_cashflow");
  if (poorCashflow >= minSupport) {
    proposals.push({ field: "strategy", from: profile.strategy, to: "yield", rationale: `You passed ${poorCashflow} listings for weak cash-flow — a yield-weighted strategy would prioritise rental return.`, support: poorCashflow });
  }

  const lowConfidence = count("low_confidence");
  if (lowConfidence >= minSupport) {
    const to = profile.riskTolerance === "low" ? "low" : "medium";
    proposals.push({ field: "riskTolerance", from: profile.riskTolerance, to, rationale: `You passed ${lowConfidence} listings for low data confidence — lowering the confidence requirement would surface more matches (with clear caveats).`, support: lowConfidence });
  }

  const tooSmall = count("too_small");
  if (tooSmall >= minSupport) {
    proposals.push({ field: "propertyType", from: profile.propertyType, to: "house", rationale: `You passed ${tooSmall} listings as too small — houses may fit better than units.`, support: tooSmall });
  }

  // Deterministic order: strongest support first, then field name.
  proposals.sort((a, b) => b.support - a.support || (String(a.field) < String(b.field) ? -1 : 1));
  return proposals;
}
