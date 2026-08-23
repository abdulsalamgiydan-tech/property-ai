/**
 * Canonical metric-provenance & freshness contract (pure, offline).
 *
 * Formalises how a single suburb/postcode metric is presented to search/UI with
 * HONEST lineage: it never fabricates a value, never silently swaps a direct
 * observation for a derived one, and always attaches source + reporting period +
 * publication/ingestion dates + freshness + confidence + a specific missing reason.
 *
 * This composes existing components — it does NOT create a competing warehouse:
 *   - `classification` mirrors `lib/research/metricFallback.ts` semantics
 *     (direct | derived | fallback | unavailable);
 *   - `source*` fields are looked up from `warehouse/config/v3_source_registry.json`
 *     so licence/attribution is never lost.
 *
 * Pure: no I/O, no network, no clock reads except the `now` you pass in.
 */

export type MetricClassification = "direct" | "derived" | "fallback" | "unavailable";
export type FreshnessState = "fresh" | "stale" | "expired" | "unknown";

/** Minimal shape drawn from `v3_source_registry.json` (only the attribution fields). */
export type SourceRegistryEntry = {
  id: string;
  name: string;
  provider?: string;
  jurisdiction?: string;
  landing?: string;
  resource_url?: string;
  licence?: string;
  attribution?: string;
  cadence?: string; // e.g. "quarterly" | "annual" | "monthly"
};

/** One observed (or missing) metric before provenance is attached. */
export type MetricObservation = {
  metric: string; // e.g. "median_sale_price_overall"
  value: number | null;
  unit: string | null; // e.g. "AUD", "AUD/week", "%"
  propertyType?: string | null; // "house" | "unit" | "all" | null
  reportingPeriod?: string | null; // e.g. "2025-Q2" or "12m to 2025-06"
  sourceId?: string | null; // registry id
  sourcePublished?: string | null; // ISO date the source last published
  ingestedAt?: string | null; // ISO date Propellect ingested it
  classification: MetricClassification;
  method?: string | null; // methodology / version, e.g. "vg_bulk_v3" or "yield = rent*52/price"
  quality?: string | null; // upstream quality note
  /** Required when value is null OR classification is "unavailable". */
  missingReason?: string | null;
};

export type MetricProvenance = {
  metric: string;
  value: number | null;
  unit: string | null;
  propertyType: string | null;
  reportingPeriod: string | null;
  source: string | null; // human-readable source name
  sourceId: string | null;
  sourceUrl: string | null; // resource_url ?? landing
  licence: string | null;
  attribution: string | null;
  sourcePublished: string | null;
  ingestedAt: string | null;
  classification: MetricClassification;
  freshness: FreshnessState;
  confidence: "high" | "medium" | "low" | "none";
  method: string | null;
  missingReason: string | null;
};

/** Days a metric of a given cadence may age before it is "stale" then "expired". */
function freshnessThresholdsDays(cadence: string | null | undefined): { stale: number; expired: number } {
  switch ((cadence ?? "").toLowerCase()) {
    case "monthly":
      return { stale: 45, expired: 120 };
    case "quarterly":
      return { stale: 135, expired: 300 };
    case "annual":
    case "yearly":
      return { stale: 400, expired: 800 };
    default:
      return { stale: 200, expired: 500 };
  }
}

export function classifyFreshness(
  sourcePublished: string | null | undefined,
  now: Date,
  cadence: string | null | undefined,
): FreshnessState {
  if (!sourcePublished) return "unknown";
  const published = new Date(sourcePublished);
  if (Number.isNaN(published.getTime())) return "unknown";
  const ageDays = (now.getTime() - published.getTime()) / 86_400_000;
  if (ageDays < 0) return "unknown"; // future-dated → treat as unknown, never "fresh"
  const t = freshnessThresholdsDays(cadence);
  if (ageDays <= t.stale) return "fresh";
  if (ageDays <= t.expired) return "stale";
  return "expired";
}

function confidenceFor(classification: MetricClassification, freshness: FreshnessState): MetricProvenance["confidence"] {
  if (classification === "unavailable") return "none";
  if (classification === "direct") {
    if (freshness === "fresh") return "high";
    if (freshness === "stale") return "medium";
    if (freshness === "expired") return "low";
    return "medium"; // unknown freshness but a direct observation
  }
  if (classification === "derived") return freshness === "fresh" ? "medium" : "low";
  // fallback (contextual, broader geography)
  return "low";
}

/**
 * Attach canonical provenance to one observation. Never fabricates:
 *  - a null value is always classification "unavailable" and REQUIRES a reason
 *    (a generated default reason is used only if none supplied, never a value);
 *  - a present value keeps its stated classification (direct/derived/fallback).
 */
export function toMetricProvenance(
  obs: MetricObservation,
  registry: ReadonlyArray<SourceRegistryEntry>,
  now: Date,
): MetricProvenance {
  const entry = obs.sourceId ? registry.find((s) => s.id === obs.sourceId) : undefined;

  // A missing value can never be "direct/derived/fallback" — force honesty.
  const hasValue = obs.value != null && Number.isFinite(obs.value);
  const classification: MetricClassification = hasValue ? obs.classification : "unavailable";

  const freshness = hasValue ? classifyFreshness(obs.sourcePublished, now, entry?.cadence) : "unknown";
  const confidence = confidenceFor(classification, freshness);

  const missingReason = hasValue
    ? null
    : obs.missingReason?.trim() ||
      (obs.sourceId
        ? `No published value for "${obs.metric}" from source "${obs.sourceId}" for this geography/period.`
        : `No registered source supplies "${obs.metric}" for this geography.`);

  return {
    metric: obs.metric,
    value: hasValue ? obs.value : null,
    unit: obs.unit ?? null,
    propertyType: obs.propertyType ?? null,
    reportingPeriod: obs.reportingPeriod ?? null,
    source: entry?.name ?? null,
    sourceId: obs.sourceId ?? null,
    sourceUrl: entry?.resource_url ?? entry?.landing ?? null,
    licence: entry?.licence ?? null,
    attribution: entry?.attribution ?? null,
    sourcePublished: obs.sourcePublished ?? null,
    ingestedAt: obs.ingestedAt ?? null,
    classification,
    freshness,
    confidence,
    method: obs.method ?? null,
    missingReason,
  };
}
