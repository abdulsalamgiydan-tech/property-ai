/**
 * Field-level fallback resolution for suburb metrics.
 *
 * Precedence, applied INDEPENDENTLY per metric:
 *   1. Compatible direct Propellect suburb value.
 *   2. Compatible exact Stash suburb value (fills a null gap only).
 *   3. Propellect postcode/LGA contextual value (clearly labelled).
 *   4. Unavailable, with a specific reason.
 *
 * Hard compatibility rules enforced here (never silently violated):
 *   - never mix suburb / postcode / LGA geography as if interchangeable;
 *   - never mix house / unit (or other) property types;
 *   - never mix aggregate and bedroom-specific statistics;
 *   - Stash never overwrites an existing direct Propellect suburb value;
 *   - a value from a broader geography is always marked `contextual`.
 */

export type MetricProvider = "Propellect" | "Stash Property";
export type GeographyLevel = "suburb" | "postcode" | "lga";
export type MetricStatus = "direct" | "derived" | "contextual" | "unavailable";

export type MetricCandidate = {
  value: number | null;
  unit: string | null;
  provider: MetricProvider;
  sourceField: string;
  geographyLevel: GeographyLevel;
  /** Geography label for context messaging, e.g. "Postcode 2527". */
  geographyLabel?: string;
  propertyType: string | null; // "house" | "unit" | "all" | null
  bedrooms: number | null; // null = aggregate (not bedroom-specific)
  asOf: string | null;
  retrievedAt: string | null;
  /** Intended status if this candidate is chosen at its own geography level. */
  status: Exclude<MetricStatus, "unavailable" | "contextual">;
  quality: string | null;
};

export type MetricRequirement = {
  /** The metric must describe this property type (null/"all" = aggregate expected). */
  propertyType?: string | null;
  /** The metric must describe this bedroom grouping (null = aggregate expected). */
  bedrooms?: number | null;
  /** Reason to show when nothing resolves. */
  unavailableReason?: string;
};

export type ResolvedMetric = {
  value: number | null;
  unit: string | null;
  provider: MetricProvider | null;
  sourceField: string | null;
  geographyLevel: GeographyLevel | null;
  propertyType: string | null;
  bedrooms: number | null;
  asOf: string | null;
  retrievedAt: string | null;
  status: MetricStatus;
  quality: string | null;
  fallbackReason: string | null;
};

function propertyTypeCompatible(candidate: string | null, required: string | null | undefined): boolean {
  if (required === undefined) return true; // no constraint — any property type is acceptable
  if (required === null) return candidate == null || candidate === "all"; // aggregate required
  if (candidate == null) return required === "all";
  return candidate === required;
}

function bedroomsCompatible(candidate: number | null, required: number | null | undefined): boolean {
  if (required === undefined) return true; // no constraint
  // aggregate (null) and bedroom-specific never mix
  return (candidate ?? null) === required;
}

const UNAVAILABLE = (reason: string): ResolvedMetric => ({
  value: null,
  unit: null,
  provider: null,
  sourceField: null,
  geographyLevel: null,
  propertyType: null,
  bedrooms: null,
  asOf: null,
  retrievedAt: null,
  status: "unavailable",
  quality: null,
  fallbackReason: reason,
});

/**
 * Resolves a single metric from ordered candidates (caller supplies them in
 * precedence order: Propellect suburb, then Stash suburb, then postcode/LGA
 * context). Returns the first candidate that has a non-null value AND is
 * property-type / bedroom compatible with the requirement.
 */
export function resolveMetric(candidates: MetricCandidate[], requirement: MetricRequirement = {}): ResolvedMetric {
  const skips: string[] = [];
  for (const c of candidates) {
    if (c.value == null) continue;
    if (!propertyTypeCompatible(c.propertyType, requirement.propertyType)) {
      skips.push(`${c.provider} ${c.geographyLevel} skipped: property-type ${c.propertyType ?? "aggregate"} ≠ required ${requirement.propertyType ?? "aggregate"}`);
      continue;
    }
    if (!bedroomsCompatible(c.bedrooms, requirement.bedrooms)) {
      skips.push(`${c.provider} ${c.geographyLevel} skipped: bedroom grouping mismatch`);
      continue;
    }
    const isContext = c.geographyLevel !== "suburb";
    return {
      value: c.value,
      unit: c.unit,
      provider: c.provider,
      sourceField: c.sourceField,
      geographyLevel: c.geographyLevel,
      propertyType: c.propertyType,
      bedrooms: c.bedrooms,
      asOf: c.asOf,
      retrievedAt: c.retrievedAt,
      status: isContext ? "contextual" : c.status,
      quality: c.quality,
      fallbackReason: isContext
        ? `${c.geographyLabel ?? c.geographyLevel} context — not suburb-specific data`
        : null,
    };
  }
  const base = requirement.unavailableReason ?? "no compatible suburb, Stash or contextual value available";
  return UNAVAILABLE(skips.length ? `${base} (${skips.join("; ")})` : base);
}

/**
 * Gross yield may only be computed when price and rent share a geography level
 * AND property type — otherwise the ratio is meaningless (e.g. suburb house
 * price ÷ postcode all-dwelling rent). Returns null with a reason when
 * incompatible; never fabricates a mixed-source figure.
 */
export function computeGrossYield(
  price: { value: number | null; geographyLevel: GeographyLevel; propertyType: string | null },
  rent: { value: number | null; geographyLevel: GeographyLevel; propertyType: string | null }
): { value: number | null; reason: string | null } {
  if (price.value == null || rent.value == null) return { value: null, reason: "requires both a price and a rent value" };
  if (price.geographyLevel !== rent.geographyLevel) {
    return { value: null, reason: `incompatible geography: price is ${price.geographyLevel}, rent is ${rent.geographyLevel}` };
  }
  if ((price.propertyType ?? "all") !== (rent.propertyType ?? "all")) {
    return { value: null, reason: "incompatible property types for yield" };
  }
  return { value: Number((((rent.value * 52) / price.value) * 100).toFixed(2)), reason: null };
}
