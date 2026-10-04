/**
 * Deal ranking (V7B, part D). Deterministic and versioned. For each listing it:
 *   - assembles the five evidence classes with provenance,
 *   - applies HARD GATES first (a failure is never hidden by a high weighted score),
 *   - reuses the tested cash-flow engine for the estimate,
 *   - computes deal_score_v1 and a full, honest explanation.
 * Never fabricates rent/price/yield/growth/attributes — missing stays missing.
 */
import { scenarioFor } from "@/lib/opportunity/scenario";
import { MANDATORY_METRICS, type MandatoryMetric, type MetricProvenance } from "@/lib/opportunity/types";
import { HARD_STALE_DAYS } from "@/lib/opportunity/engine";
import type { CanonicalListing } from "@/lib/listings/types";
import type {
  BuyBox,
  DealResult,
  DealSubScores,
  HardGateFailure,
  RankDealsOutput,
  SuburbEvidence,
} from "./types";
import {
  DEAL_SCORE_VERSION,
  affordabilityIndex,
  cashflowIndex,
  dealBand,
  dealScoreV1,
  dealYieldIndex,
  downsideResilienceIndex,
  evidenceCompletenessIndex,
  maxLvrFor,
  propertyFitIndex,
  suburbFitIndex,
} from "./scoring";

function ageDays(m: MetricProvenance, asOf: Date): number | null {
  const t = m.retrieved_at ? new Date(m.retrieved_at).getTime() : NaN;
  return Number.isNaN(t) ? null : (asOf.getTime() - t) / 86_400_000;
}
function isFresh(m: MetricProvenance | undefined, asOf: Date): m is MetricProvenance {
  if (!m) return false;
  const age = ageDays(m, asOf);
  return age == null ? true : age <= HARD_STALE_DAYS;
}

function effectivePriceOf(l: CanonicalListing): number | null {
  if (l.priceLowerBound != null && l.priceUpperBound != null) return (l.priceLowerBound + l.priceUpperBound) / 2;
  return l.priceLowerBound ?? l.priceUpperBound ?? null;
}

const money = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;

/** Rank a set of listings against a buy box + per-suburb market evidence. */
export function rankDeals(
  listings: CanonicalListing[],
  buyBox: BuyBox,
  evidenceByGeo: Record<string, SuburbEvidence>,
  opts: { asOf: string },
): RankDealsOutput {
  const asOfDate = new Date(opts.asOf);
  const gates = buyBox.hardGates;
  const soft = buyBox.softPreferences;

  const results: DealResult[] = listings.map((listing) => {
    const geo = listing.address.geographyId;
    const ev: SuburbEvidence = (geo && evidenceByGeo[geo]) || {};
    const effectivePrice = effectivePriceOf(listing);
    const priceUndisclosed = effectivePrice == null;

    // --- Evidence classes ---
    const freshMetric = (m: MandatoryMetric): MetricProvenance | null => (isFresh(ev[m], asOfDate) ? ev[m]! : null);
    const rent = freshMetric("median_rent");
    const grossYield = freshMetric("gross_yield");
    const growth = freshMetric("price_growth_12m");
    const demand = freshMetric("sales_volume");
    const missing = MANDATORY_METRICS.filter((m) => !freshMetric(m));
    const presentFresh = MANDATORY_METRICS.length - missing.length;

    // --- Class 4: Propellect estimate (reuses the tested engine) ---
    let estimate: DealResult["estimate"] = null;
    if (effectivePrice != null && rent) {
      estimate = scenarioFor({
        medianPrice: effectivePrice,
        weeklyRent: rent.value,
        deposit: gates.depositAvailable,
        state: listing.address.state ?? "SA",
        strategy: buyBox.sourceProfile.strategy,
        suburbName: listing.address.suburb,
      });
    }
    const weeklyPreTax = estimate ? estimate.weeklyPreTaxCashflow : null;
    const weeklyHolding = estimate ? estimate.weeklyHoldingCost : null;

    // --- HARD GATES (applied before any weighting) ---
    const failures: HardGateFailure[] = [];
    if (listing.address.state && !gates.eligibleStates.includes(listing.address.state))
      failures.push({ gate: "state_not_eligible", detail: `${listing.address.state} is not a rankable state yet.` });
    if (listing.propertyType && !gates.propertyTypes.includes(listing.propertyType as never))
      failures.push({ gate: "property_type_excluded", detail: `Property type ${listing.propertyType} is outside your buy box.` });
    if (gates.exclusions.includes(listing.key) || (listing.address.suburb && gates.exclusions.includes(listing.address.suburb)))
      failures.push({ gate: "explicitly_excluded", detail: `Matches one of your explicit exclusions.` });
    if (gates.minBedrooms != null && listing.bedrooms != null && listing.bedrooms < gates.minBedrooms)
      failures.push({ gate: "below_min_bedrooms", detail: `${listing.bedrooms} bed < your minimum ${gates.minBedrooms}.` });
    if (effectivePrice != null && effectivePrice > gates.maxPurchasePrice)
      failures.push({ gate: "above_price_budget", detail: `${money(effectivePrice)} exceeds your ${money(gates.maxPurchasePrice)} ceiling.` });
    if (effectivePrice != null) {
      const requiredCash = effectivePrice * (1 - maxLvrFor(soft.riskTolerance)) + effectivePrice * (gates.purchaseCostBufferPct / 100);
      if (gates.depositAvailable < requiredCash)
        failures.push({ gate: "deposit_too_small", detail: `Needs ~${money(requiredCash)} cash (deposit + costs); you have ${money(gates.depositAvailable)}.` });
    }
    if (weeklyHolding != null && weeklyHolding > gates.maxWeeklyHoldingCost)
      failures.push({ gate: "exceeds_holding_budget", detail: `Modelled ${money(weeklyHolding)}/wk out-of-pocket exceeds your ${money(gates.maxWeeklyHoldingCost)}/wk limit.` });

    const eligible = failures.length === 0;

    // --- Confidence + sub-scores ---
    const confidence = Math.min(
      1,
      (presentFresh / MANDATORY_METRICS.length) * (priceUndisclosed ? 0.6 : 1),
    );
    const sub: DealSubScores = {
      affordability: affordabilityIndex(effectivePrice, gates.maxPurchasePrice),
      cashflow: cashflowIndex(weeklyPreTax, gates.maxWeeklyHoldingCost),
      yield: dealYieldIndex(grossYield ? grossYield.value : null),
      suburbFit: suburbFitIndex(
        { growth: growth?.value ?? null, demand: demand?.value ?? null, grossYield: grossYield?.value ?? null },
        soft.growthVsYield,
      ),
      propertyFit: propertyFitIndex({
        bedrooms: listing.bedrooms,
        minBedrooms: gates.minBedrooms,
        landAreaSqm: listing.landAreaSqm,
        landPreference: soft.landSizePreference,
      }),
      downsideResilience: downsideResilienceIndex({
        weeklyPreTaxCashflow: weeklyPreTax,
        acceptableWeeklyHoldingCost: gates.maxWeeklyHoldingCost,
        confidence,
        priceUndisclosed,
      }),
      evidenceCompleteness: evidenceCompletenessIndex(presentFresh, MANDATORY_METRICS.length),
    };
    const dealScore = dealScoreV1(sub, soft.growthVsYield);

    // --- Explanation ---
    const whyMatches: string[] = [];
    const whyMayNot: string[] = [];
    const couldKillDeal: string[] = [];
    const verifyNext: string[] = [];
    const asOf: Record<string, string> = {};

    if (eligible) whyMatches.push(`Within your buy box: ${listing.propertyType ?? "property"} in ${listing.address.suburb ?? "SA"}, ${priceUndisclosed ? "price on application" : money(effectivePrice!)}.`);
    if (estimate && weeklyPreTax != null) {
      if (weeklyPreTax >= 0) whyMatches.push(`Modelled cash-flow-positive (+${money(weeklyPreTax)}/wk before tax) at ${estimate.grossYieldPct.toFixed(2)}% gross yield.`);
      else whyMayNot.push(`Modelled ${money(-weeklyPreTax)}/wk out-of-pocket before tax (limit ${money(gates.maxWeeklyHoldingCost)}/wk).`);
    }
    if (growth) { whyMatches.push(`Suburb 12-month growth ${growth.value.toFixed(2)}% (${growth.source_id ?? "official"} · ${growth.period_end ?? "n/a"}).`); asOf.price_growth_12m = growth.period_end ?? growth.retrieved_at ?? "n/a"; }
    if (grossYield) asOf.gross_yield = grossYield.period_end ?? grossYield.retrieved_at ?? "n/a";
    if (rent) asOf.median_rent = rent.period_end ?? rent.retrieved_at ?? "n/a";
    for (const f of failures) whyMayNot.push(f.detail);
    if (priceUndisclosed) { whyMayNot.push("Advertised price is undisclosed — affordability can't be fully assessed."); verifyNext.push("Ask the agent for a price guide, then re-check affordability."); }
    if (!rent) { couldKillDeal.push("No fresh official rent for this suburb — the cash-flow estimate is unavailable."); verifyNext.push("Confirm achievable rent with a local property manager."); }
    if (missing.length) verifyNext.push(`Verify: ${missing.join(", ")}.`);
    couldKillDeal.push("Building & pest, strata/title checks, and finance approval are not modelled here.");
    verifyNext.push("Inspect in person and obtain independent valuation + legal review.");
    asOf.listing = listing.providerUpdatedAt;

    return {
      key: listing.key,
      scoreVersion: DEAL_SCORE_VERSION,
      suburbName: listing.address.suburb,
      geographyId: geo,
      listing,
      marketEvidence: { median_rent: rent ?? undefined, gross_yield: grossYield ?? undefined, price_growth_12m: growth ?? undefined, sales_volume: demand ?? undefined, median_house_price: freshMetric("median_house_price") ?? undefined },
      userAssumptions: {
        deposit: gates.depositAvailable,
        max_price: gates.maxPurchasePrice,
        acceptable_weekly_holding_cost: gates.maxWeeklyHoldingCost,
        strategy: buyBox.sourceProfile.strategy,
        ...(estimate ? estimate.assumptions : {}),
      },
      estimate,
      missing,
      eligible,
      hardGateFailures: failures,
      dealScore,
      dealBand: dealBand(dealScore),
      subScores: sub,
      confidence,
      priceUndisclosed,
      explanation: { whyMatches, whyMayNot, missingEvidence: missing, couldKillDeal, verifyNext, asOf },
    };
  });

  // Deterministic ordering: score desc, then key asc for ties.
  const byScore = (a: DealResult, b: DealResult) => (b.dealScore - a.dealScore) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const eligible = results.filter((r) => r.eligible);
  const ineligible = results.filter((r) => !r.eligible).sort(byScore);
  const minConfidence = soft.dataConfidenceRequirement === "high" ? 0.8 : soft.dataConfidenceRequirement === "medium" ? 0.5 : 0.3;
  const ranked = eligible.filter((r) => !r.priceUndisclosed && r.confidence >= minConfidence).sort(byScore);
  const needsReview = eligible.filter((r) => r.priceUndisclosed || r.confidence < minConfidence).sort(byScore);

  return { scoreVersion: DEAL_SCORE_VERSION, asOf: opts.asOf, ranked, ineligible, needsReview };
}
