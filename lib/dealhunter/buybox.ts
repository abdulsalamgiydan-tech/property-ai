/**
 * Buy Box (V7B, part C). Deterministically transforms a saved investment profile
 * into an explicit personal buy box (hard gates + soft preferences) AND records
 * exactly how every profile answer shaped it. No hidden logic, no ML.
 */
import type { InvestmentProfile, PropertyType } from "@/lib/opportunity/types";
import { RANKABLE_JURISDICTIONS } from "@/lib/opportunity/engine";
import type { BuyBox, BuyBoxExplanation, NewVsEstablished } from "./types";

export const BUY_BOX_VERSION = "buy_box_v1";

/** SA acquisition-cost buffer (stamp duty + conveyancing), modelled as a % of price. */
const SA_PURCHASE_COST_BUFFER_PCT = 6;

function growthVsYield(strategy: InvestmentProfile["strategy"]): number {
  return strategy === "growth" ? 1 : strategy === "yield" ? -1 : 0;
}

function resilienceFor(risk: InvestmentProfile["riskTolerance"], acceptableWeekly: number): number {
  const base = risk === "low" ? 0.8 : risk === "medium" ? 0.5 : 0.3;
  // A lower acceptable weekly out-of-pocket implies wanting more buffer.
  const tolAdj = acceptableWeekly <= 150 ? 0.15 : acceptableWeekly >= 600 ? -0.15 : 0;
  return Math.min(1, Math.max(0, base + tolAdj));
}

function confidenceRequirement(risk: InvestmentProfile["riskTolerance"]): "high" | "medium" | "low" {
  return risk === "low" ? "high" : risk === "high" ? "low" : "medium";
}

export function deriveBuyBox(profile: InvestmentProfile): BuyBox {
  const explanations: BuyBoxExplanation[] = [];
  const add = (input: string, answer: string, effect: string) => explanations.push({ input, answer, effect });

  const eligibleStates = profile.states.filter((s) => (RANKABLE_JURISDICTIONS as readonly string[]).includes(s));
  const blockedStates = profile.states.filter((s) => !eligibleStates.includes(s));

  const propertyTypes: PropertyType[] = [profile.propertyType];
  const gvy = growthVsYield(profile.strategy);
  const newVsEstablished: NewVsEstablished = "either";

  add("Max purchase price", `A$${profile.maxPrice.toLocaleString("en-AU")}`,
    `Hard gate: listings above this price are excluded, never shown as a match.`);
  add("Deposit available", `A$${profile.deposit.toLocaleString("en-AU")}`,
    `Hard gate: a listing is excluded if your deposit can't cover the loan gap plus ~${SA_PURCHASE_COST_BUFFER_PCT}% acquisition costs.`);
  add("Strategy", profile.strategy,
    `Sets the growth↔yield balance to ${gvy > 0 ? "growth-weighted" : gvy < 0 ? "yield-weighted" : "balanced"} — it re-weights the score, it does not hide any hard-gate failure.`);
  add("Acceptable weekly holding cost", `A$${profile.acceptableWeeklyHoldingCost.toLocaleString("en-AU")}/wk`,
    `Hard gate: a listing whose modelled weekly out-of-pocket exceeds this is excluded (labelled "exceeds holding budget").`);
  add("Property type", profile.propertyType,
    `Hard gate: only ${profile.propertyType} listings are considered.`);
  add("States", profile.states.join(", ") || "(none)",
    blockedStates.length
      ? `Only ${eligibleStates.join(", ") || "no"} state(s) are rankable today; ${blockedStates.join(", ")} is honestly blocked until its data gates pass — never shown with fabricated coverage.`
      : `Eligible state(s): ${eligibleStates.join(", ") || "none"}.`);
  add("Risk tolerance", profile.riskTolerance,
    `Sets the minimum evidence-confidence requirement to "${confidenceRequirement(profile.riskTolerance)}" and how strongly downside resilience is weighted.`);
  add("Holding period", `${profile.holdingPeriodYears} years`,
    `Longer horizons lean the soft weighting slightly toward growth; it does not change any hard gate.`);
  add("Minimum bedrooms", "not specified",
    `No bedroom minimum is applied — your profile didn't set one, so none is invented.`);
  add("Exclusions", "none", `No explicit exclusions were provided.`);

  return {
    version: BUY_BOX_VERSION,
    hardGates: {
      maxPurchasePrice: profile.maxPrice,
      depositAvailable: profile.deposit,
      purchaseCostBufferPct: SA_PURCHASE_COST_BUFFER_PCT,
      eligibleStates,
      propertyTypes,
      minBedrooms: null,
      maxWeeklyHoldingCost: profile.acceptableWeeklyHoldingCost,
      exclusions: [],
    },
    softPreferences: {
      growthVsYield: gvy,
      riskTolerance: profile.riskTolerance,
      newVsEstablished,
      landSizePreference: "indifferent",
      cashflowResilience: resilienceFor(profile.riskTolerance, profile.acceptableWeeklyHoldingCost),
      dataConfidenceRequirement: confidenceRequirement(profile.riskTolerance),
    },
    explanations,
    sourceProfile: profile,
  };
}
