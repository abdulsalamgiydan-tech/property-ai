/**
 * One-page Deal Brief (V7B, part E.12). Assembles a decision-grade, provenance-
 * labelled summary from a DealResult — suitable for discussing with a broker or
 * buyer's agent. It presents evidence, scenarios and verification actions; it makes
 * no legal/lending/tax/purchase recommendation.
 */
import type { MandatoryMetric } from "@/lib/opportunity/types";
import type { DealResult } from "./types";

export interface DealBriefFigure {
  label: string;
  value: string;
  /** Evidence class label the UI must show: provider fact, market evidence, assumption, or estimate. */
  origin: "listing_fact" | "market_evidence" | "user_assumption" | "propellect_estimate" | "missing";
  source: string | null;
}

export interface DealBrief {
  key: string;
  scoreVersion: string;
  generatedAt: string;
  headline: { address: string; suburb: string | null; propertyType: string | null; priceText: string | null };
  attributes: DealBriefFigure[];
  fit: { dealScore: number; dealBand: string; confidencePct: number; eligible: boolean };
  financials: DealBriefFigure[];
  marketEvidence: DealBriefFigure[];
  whyMatches: string[];
  whyMayNot: string[];
  couldKillDeal: string[];
  verifyNext: string[];
  asOf: Record<string, string>;
  disclaimer: string;
}

const money = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;
const METRIC_LABEL: Record<MandatoryMetric, string> = {
  median_house_price: "Suburb median house price",
  median_rent: "Suburb median rent (weekly)",
  gross_yield: "Suburb gross yield",
  sales_volume: "Suburb 12-month sales volume",
  price_growth_12m: "Suburb 12-month price growth",
};

export function buildDealBrief(deal: DealResult, generatedAt: string): DealBrief {
  const l = deal.listing;

  const attributes: DealBriefFigure[] = [
    { label: "Bedrooms", value: l.bedrooms?.toString() ?? "—", origin: l.bedrooms == null ? "missing" : "listing_fact", source: l.provenance.bedrooms?.provider ?? null },
    { label: "Bathrooms", value: l.bathrooms?.toString() ?? "—", origin: l.bathrooms == null ? "missing" : "listing_fact", source: l.provenance.bathrooms?.provider ?? null },
    { label: "Parking", value: l.parking?.toString() ?? "—", origin: l.parking == null ? "missing" : "listing_fact", source: l.provenance.parking?.provider ?? null },
    { label: "Land area", value: l.landAreaSqm != null ? `${l.landAreaSqm} m²` : "—", origin: l.landAreaSqm == null ? "missing" : "listing_fact", source: l.provenance.landAreaSqm?.provider ?? null },
  ];

  const financials: DealBriefFigure[] = [];
  if (deal.estimate) {
    const e = deal.estimate;
    financials.push(
      { label: "Advertised price (modelled)", value: l.priceText ?? "—", origin: "listing_fact", source: l.provenance.price?.provider ?? null },
      { label: "Gross yield (estimate)", value: `${e.grossYieldPct.toFixed(2)}%`, origin: "propellect_estimate", source: "deal_score_v1" },
      { label: "Weekly cash-flow before tax (estimate)", value: `${e.weeklyPreTaxCashflow >= 0 ? "+" : "-"}${money(Math.abs(e.weeklyPreTaxCashflow))}`, origin: "propellect_estimate", source: "deal_score_v1" },
      { label: "Weekly out-of-pocket (estimate)", value: money(e.weeklyHoldingCost), origin: "propellect_estimate", source: "deal_score_v1" },
      { label: "Total cash required (estimate)", value: money(e.totalCashRequired), origin: "propellect_estimate", source: "deal_score_v1" },
      { label: "Interest rate assumption", value: `${e.assumptions.interest_rate_pct}%`, origin: "user_assumption", source: "labelled assumption" },
    );
  } else {
    financials.push({ label: "Cash-flow estimate", value: "unavailable — no fresh official rent", origin: "missing", source: null });
  }

  const marketEvidence: DealBriefFigure[] = (Object.keys(METRIC_LABEL) as MandatoryMetric[]).map((m) => {
    const p = deal.marketEvidence[m];
    return p
      ? { label: METRIC_LABEL[m], value: m === "median_house_price" || m === "median_rent" ? money(p.value) : m === "sales_volume" ? `${p.value}` : `${p.value.toFixed(2)}%`, origin: "market_evidence" as const, source: p.source_id ? `${p.source_id} · ${p.period_end ?? "n/a"}` : (p.attribution ?? "official") }
      : { label: METRIC_LABEL[m], value: "missing", origin: "missing" as const, source: null };
  });

  return {
    key: deal.key,
    scoreVersion: deal.scoreVersion,
    generatedAt,
    headline: { address: l.address.full ?? "Address withheld", suburb: l.address.suburb, propertyType: l.propertyType, priceText: l.priceText },
    attributes,
    fit: { dealScore: deal.dealScore, dealBand: deal.dealBand, confidencePct: Math.round(deal.confidence * 100), eligible: deal.eligible },
    financials,
    marketEvidence,
    whyMatches: deal.explanation.whyMatches,
    whyMayNot: deal.explanation.whyMayNot,
    couldKillDeal: deal.explanation.couldKillDeal,
    verifyNext: deal.explanation.verifyNext,
    asOf: deal.explanation.asOf,
    disclaimer:
      "Propellect presents evidence, scenarios and verification actions — not financial, legal, lending or tax advice, and not a recommendation to buy. Figures are labelled by source; estimates are modelled from official data plus your inputs. Verify everything independently before acting.",
  };
}
