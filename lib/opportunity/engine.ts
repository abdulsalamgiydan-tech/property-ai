/**
 * Investment Opportunity Engine (V6A) — pure, deterministic ranking.
 *
 * rankInvestments(profile, rows, { asOf }) is a pure function: identical inputs
 * always produce an identical RankOutput (Assurance A1). It never treats missing
 * data as zero — mandatory gaps EXCLUDE a suburb; optional gaps only lower
 * confidence (Assurance A3). Every displayed figure carries provenance (A6).
 */
import {
  affordabilityFit,
  confidenceBand,
  dataConfidence,
  demandIndex,
  growthIndex,
  opportunityBand,
  opportunityScoreV1,
  OPPORTUNITY_SCORE_VERSION,
  OPPORTUNITY_WEIGHTS,
  yieldIndex,
} from "./scoring";
import { scenarioFor } from "./scenario";
import {
  MANDATORY_METRICS,
  type CandidateRow,
  type ExcludedResult,
  type ExclusionReason,
  type InvestmentProfile,
  type MandatoryMetric,
  type MetricProvenance,
  type RankedResult,
  type RankOutput,
} from "./types";

/** States currently offered for ranking. National stays honestly blocked. */
export const RANKABLE_JURISDICTIONS = ["SA"] as const;

export const SOFT_STALE_DAYS = 400;
export const HARD_STALE_DAYS = 540;
const MIN_DEPOSIT_FRACTION = 0.05;

function ageDays(retrievedAt: string | null, asOf: Date): number | null {
  if (!retrievedAt) return null;
  const t = new Date(retrievedAt).getTime();
  if (Number.isNaN(t)) return null;
  return (asOf.getTime() - t) / 86_400_000;
}

function fmtMoney(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}
function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}
function periodLabel(m: MetricProvenance): string {
  return m.period_end ?? m.period_start ?? "n/a";
}
function sourceLabel(m: MetricProvenance): string {
  return m.source_id ? `${m.source_id} · ${periodLabel(m)}` : periodLabel(m);
}

interface Freshness {
  hardStale: boolean;
  softStaleCount: number;
  staleMetrics: string[];
}

function assessFreshness(evidence: Record<MandatoryMetric, MetricProvenance>, asOf: Date): Freshness {
  let hardStale = false;
  let softStaleCount = 0;
  const staleMetrics: string[] = [];
  for (const metric of MANDATORY_METRICS) {
    const m = evidence[metric];
    const age = ageDays(m.retrieved_at, asOf);
    if (age === null) {
      // Unknown freshness → conservative soft penalty, never a ranking lift.
      softStaleCount += 1;
      staleMetrics.push(metric);
      continue;
    }
    if (age > HARD_STALE_DAYS) {
      hardStale = true;
      staleMetrics.push(metric);
    } else if (age > SOFT_STALE_DAYS) {
      softStaleCount += 1;
      staleMetrics.push(metric);
    }
  }
  return { hardStale, softStaleCount, staleMetrics };
}

export function rankInvestments(
  profile: InvestmentProfile,
  rows: CandidateRow[],
  opts: { asOf: Date },
): RankOutput {
  const { asOf } = opts;
  const strategy = profile.strategy;
  const stateBlocked = !profile.states.some((s) => (RANKABLE_JURISDICTIONS as readonly string[]).includes(s));

  const ranked: RankedResult[] = [];
  const excluded: ExcludedResult[] = [];

  const exclude = (row: CandidateRow, reason: ExclusionReason, detail: string) =>
    excluded.push({ geographyId: row.geography_id, suburbName: row.suburb_name ?? null, reason, detail });

  for (const row of rows) {
    if (row.property_type !== profile.propertyType) {
      exclude(row, "wrong_property_type", `Property type ${row.property_type} does not match your ${profile.propertyType} preference.`);
      continue;
    }
    if (!profile.states.includes(row.jurisdiction)) {
      exclude(row, "state_not_offered", `${row.jurisdiction} is not in your selected states.`);
      continue;
    }

    // Mandatory presence.
    const missing = MANDATORY_METRICS.filter((m) => row.metrics[m] == null || row.metrics[m].value == null);
    if (missing.length > 0) {
      exclude(row, "missing_mandatory_evidence", `Missing required evidence: ${missing.join(", ")}.`);
      continue;
    }
    const evidence = Object.fromEntries(
      MANDATORY_METRICS.map((m) => [m, row.metrics[m]]),
    ) as Record<MandatoryMetric, MetricProvenance>;

    // Freshness.
    const fresh = assessFreshness(evidence, asOf);
    if (fresh.hardStale) {
      exclude(row, "stale_evidence", `Evidence is older than ${HARD_STALE_DAYS} days (${fresh.staleMetrics.join(", ")}).`);
      continue;
    }

    const price = evidence.median_house_price.value;
    const rent = evidence.median_rent.value;

    // Affordability (hard).
    if (price > profile.maxPrice) {
      exclude(row, "above_price_budget", `Median price ${fmtMoney(price)} exceeds your ${fmtMoney(profile.maxPrice)} budget.`);
      continue;
    }
    if (profile.deposit < MIN_DEPOSIT_FRACTION * price) {
      exclude(row, "deposit_too_small", `Deposit ${fmtMoney(profile.deposit)} is below 5% of ${fmtMoney(price)}.`);
      continue;
    }

    // Cash-flow scenario (reuses the tested deal engine).
    const scenario = scenarioFor({
      medianPrice: price,
      weeklyRent: rent,
      deposit: profile.deposit,
      state: row.jurisdiction,
      strategy,
      suburbName: row.suburb_name,
    });

    // Holding-cost (hard).
    if (scenario.weeklyHoldingCost > profile.acceptableWeeklyHoldingCost) {
      exclude(
        row,
        "exceeds_holding_budget",
        `Scenario holding cost ${fmtMoney(scenario.weeklyHoldingCost)}/wk exceeds your ${fmtMoney(profile.acceptableWeeklyHoldingCost)}/wk limit.`,
      );
      continue;
    }

    // Sub-indices (mandatory only) → opportunity score.
    const sub = {
      growth: growthIndex(evidence.price_growth_12m.value),
      demand: demandIndex(evidence.sales_volume.value),
      yield: yieldIndex(evidence.gross_yield.value),
    };
    const opportunityScore = opportunityScoreV1(sub, strategy);

    // Confidence (separate axis).
    const confidence = dataConfidence({
      softStaleCount: fresh.softStaleCount,
      salesVolumeSample: evidence.sales_volume.sample_size,
      grossYieldSample: evidence.gross_yield.sample_size,
      hasSupplyEvidence: row.hasSupplyEvidence ?? false,
      hasDemographicEvidence: row.hasDemographicEvidence ?? false,
    });

    const depositPct = (profile.deposit / price) * 100;
    const fit = affordabilityFit(price, profile.maxPrice, depositPct);

    const { reasonsFor, reasonsAgainst, missingEvidence } = buildReasons(
      evidence,
      scenario,
      profile,
      fresh,
      row,
    );

    ranked.push({
      geographyId: row.geography_id,
      jurisdiction: row.jurisdiction,
      propertyType: row.property_type,
      suburbName: row.suburb_name ?? null,
      scoreVersion: OPPORTUNITY_SCORE_VERSION,
      strategy,
      weights: OPPORTUNITY_WEIGHTS[strategy],
      opportunityScore,
      opportunityBand: opportunityBand(opportunityScore),
      subIndices: sub,
      confidence,
      confidenceBand: confidenceBand(confidence),
      affordabilityFit: fit,
      stale: fresh.softStaleCount > 0,
      scenario,
      evidence,
      reasonsFor,
      reasonsAgainst,
      missingEvidence,
    });
  }

  // Deterministic total order (Spec §8): opportunity ↓, confidence ↓, fit ↓, geography_id ↑.
  ranked.sort(
    (a, b) =>
      b.opportunityScore - a.opportunityScore ||
      b.confidence - a.confidence ||
      b.affordabilityFit - a.affordabilityFit ||
      (a.geographyId < b.geographyId ? -1 : a.geographyId > b.geographyId ? 1 : 0),
  );

  return {
    scoreVersion: OPPORTUNITY_SCORE_VERSION,
    strategy,
    asOf: asOf.toISOString(),
    ranked: stateBlocked ? [] : ranked,
    excluded,
    stateBlocked,
  };
}

function buildReasons(
  ev: Record<MandatoryMetric, MetricProvenance>,
  scenario: RankedResult["scenario"],
  profile: InvestmentProfile,
  fresh: Freshness,
  row: CandidateRow,
): Pick<RankedResult, "reasonsFor" | "reasonsAgainst" | "missingEvidence"> {
  const reasonsFor: string[] = [];
  const reasonsAgainst: string[] = [];
  const missingEvidence: string[] = [];

  const growth = ev.price_growth_12m;
  const demand = ev.sales_volume;
  const yield_ = ev.gross_yield;

  if (growth.value >= 8) reasonsFor.push(`Strong 12-month price growth of ${fmtPct(growth.value)} (${sourceLabel(growth)}).`);
  else if (growth.value >= 3) reasonsFor.push(`Positive 12-month price growth of ${fmtPct(growth.value)} (${sourceLabel(growth)}).`);
  else if (growth.value < 0) reasonsAgainst.push(`12-month price growth is negative (${fmtPct(growth.value)}) (${sourceLabel(growth)}).`);

  if (demand.value >= 40) reasonsFor.push(`High sales activity (${demand.value} sales in 12m).`);
  else if (demand.value >= 15) reasonsFor.push(`Healthy sales activity (${demand.value} sales in 12m).`);
  else reasonsAgainst.push(`Thin sales activity (${demand.value} in 12m) — lower liquidity.`);

  if (yield_.value >= 4.5) reasonsFor.push(`Healthy gross yield of ${fmtPct(yield_.value)} (${yield_.status}).`);
  else if (yield_.value < 3.5) reasonsAgainst.push(`Low gross yield of ${fmtPct(yield_.value)}.`);

  if (scenario.weeklyPreTaxCashflow >= 0) reasonsFor.push(`Cash-flow-positive scenario (+${fmtMoney(scenario.weeklyPreTaxCashflow)}/wk before tax).`);
  else if (scenario.weeklyHoldingCost <= profile.acceptableWeeklyHoldingCost * 0.5)
    reasonsFor.push(`Low holding cost (~${fmtMoney(scenario.weeklyHoldingCost)}/wk before tax).`);
  else reasonsAgainst.push(`Holding cost ~${fmtMoney(scenario.weeklyHoldingCost)}/wk (near your ${fmtMoney(profile.acceptableWeeklyHoldingCost)}/wk limit).`);

  if (demand.sample_size != null && demand.sample_size < 10)
    reasonsAgainst.push(`Small sales sample (${demand.sample_size}) — treat figures with caution.`);

  for (const m of fresh.staleMetrics) missingEvidence.push(`Aging evidence: ${m} (period ${periodLabel(ev[m as MandatoryMetric])}).`);
  if (!(row.hasSupplyEvidence ?? false)) missingEvidence.push("Supply/building-approvals evidence not available for this suburb.");
  if (!(row.hasDemographicEvidence ?? false)) missingEvidence.push("Demographic evidence not available for this suburb.");

  return { reasonsFor, reasonsAgainst, missingEvidence };
}
