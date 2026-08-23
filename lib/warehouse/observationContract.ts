import type {
  FreshnessState,
  MetricClassification,
  MetricObservation,
} from "./metricProvenance";

/**
 * Canonical row contract shared by every local property-data adapter.
 *
 * It deliberately carries more lineage than the serving-layer
 * `MetricObservation`: a candidate cannot enter a review packet without a
 * strict geography, acquisition timestamp, source-file checksum and versioned
 * adapter/schema. This module is pure and performs no I/O.
 */
export type CanonicalObservation = Omit<
  MetricObservation,
  "value" | "unit" | "reportingPeriod" | "sourceId" | "classification"
> & {
  geographyId: string;
  geographyType: "SAL" | "POA" | "LGA" | "SA2" | "STATE";
  geographyLabel: string;
  state: "NSW" | "VIC" | "QLD" | "SA" | "WA" | "TAS" | "ACT" | "NT";
  metric: string;
  value: number;
  unit: string;
  propertyType: string;
  reportingPeriod: string;
  sourceId: string;
  sourcePublished: string;
  acquiredAt: string;
  classification: Exclude<MetricClassification, "unavailable">;
  freshness: FreshnessState;
  confidence: "high" | "medium" | "low";
  fileChecksum: string;
  adapterVersion: string;
  schemaVersion: string;
  sampleSize?: number | null;
};

const STATES = new Set(["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"]);
const GEOGRAPHY_TYPES = new Set(["SAL", "POA", "LGA", "SA2", "STATE"]);
const CLASSIFICATIONS = new Set(["direct", "derived", "fallback"]);
const FRESHNESS = new Set(["fresh", "stale", "expired", "unknown"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

function isDate(value: unknown): boolean {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestamp(value: unknown): boolean {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(new Date(value).getTime());
}

const SIGNED_METRICS = new Set([
  "annual_price_growth_12m",
  "price_growth_12m",
]);

/** Growth can be negative or zero; price/rent/count/turnover/yield cannot. */
export function isMetricValueValid(metric: unknown, value: unknown): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return SIGNED_METRICS.has(String(metric ?? "").trim()) || value > 0;
}

/** Returns every contract violation; an empty array means the row is valid. */
export function validateObservation(value: Partial<CanonicalObservation>): string[] {
  const errors: string[] = [];
  if (!value.geographyId?.trim()) errors.push("geographyId is required");
  if (!GEOGRAPHY_TYPES.has(value.geographyType ?? "")) errors.push("geographyType is invalid");
  if (!value.geographyLabel?.trim()) errors.push("geographyLabel is required");
  if (!STATES.has(value.state ?? "")) errors.push("state is invalid");
  if (!value.metric?.trim()) errors.push("metric is required");
  if (!isMetricValueValid(value.metric, value.value)) errors.push("value is invalid for metric");
  if (!value.unit?.trim()) errors.push("unit is required");
  if (!value.propertyType?.trim()) errors.push("propertyType is required");
  if (!isDate(value.reportingPeriod)) errors.push("reportingPeriod must be an ISO date");
  if (!value.sourceId?.trim()) errors.push("sourceId is required");
  if (!isDate(value.sourcePublished)) errors.push("sourcePublished must be an ISO date");
  if (!isTimestamp(value.acquiredAt)) errors.push("acquiredAt must be an ISO timestamp");
  if (!CLASSIFICATIONS.has(value.classification ?? "")) errors.push("classification is invalid");
  if (!FRESHNESS.has(value.freshness ?? "")) errors.push("freshness is invalid");
  if (!CONFIDENCE.has(value.confidence ?? "")) errors.push("confidence is invalid");
  if (!/^[a-f0-9]{64}$/i.test(value.fileChecksum ?? "")) errors.push("fileChecksum must be SHA-256");
  if (!value.adapterVersion?.trim()) errors.push("adapterVersion is required");
  if (!value.schemaVersion?.trim()) errors.push("schemaVersion is required");
  if (value.sampleSize != null && (!Number.isInteger(value.sampleSize) || value.sampleSize < 0)) {
    errors.push("sampleSize must be a non-negative integer");
  }
  return errors;
}

export function isContractValid(value: Partial<CanonicalObservation>): value is CanonicalObservation {
  return validateObservation(value).length === 0;
}

/** Stable upsert/idempotency key. */
export function naturalKey(value: Pick<CanonicalObservation, "sourceId" | "geographyId" | "metric" | "propertyType" | "reportingPeriod">): string {
  return [value.sourceId, value.geographyId, value.metric, value.propertyType, value.reportingPeriod]
    .map((part) => String(part).trim().toLowerCase())
    .join("|");
}
