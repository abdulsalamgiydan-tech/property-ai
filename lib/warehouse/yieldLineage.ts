import crypto from "crypto";

/**
 * Strict gross-yield lineage qualification.
 *
 * A yield may be materialised ONLY when BOTH the price and the rent input
 * independently prove the full warehouse contract. This module encodes that
 * contract. It deliberately takes per-input EVIDENCE (not snapshot columns) so a
 * caller cannot pass one shared `direct_or_derived` flag for both inputs, and so
 * that missing evidence (no upstream observation id, no actual sample size, no
 * bedroom group, an aggregate `all` property type, or a rent that traces to a
 * postcode-level source) is surfaced as `lineage_unverified` rather than
 * silently accepted.
 *
 * Registry rule (metric_definitions.mjs): gross_yield is permitted for
 * `house` and `unit` only — never `all`.
 */

export type InputEvidence = {
  observationId: string | null; // proven upstream observation id (not a synthesised one)
  geographyId: string | null;
  asgsVersion: string | null;
  geographyLevel: "suburb" | "postcode" | "sa2" | "lga" | null;
  directStatus: "direct" | "derived" | "contextual" | null; // independent per input
  propertyType: string | null; // "house" | "unit" | "all" | ...
  bedroomGroup: string | null;
  sampleSize: number | null; // ACTUAL count, not a confidence label
  qualityStatus: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  sourceId: string | null;
  value: number | null;
  ageDays: number | null; // recency of the observation
};

export type YieldEvidence = { price: InputEvidence; rent: InputEvidence };

export type YieldQualification = {
  qualified: boolean;
  disposition:
    | "materialised_local"
    | "lineage_unverified"
    | "incompatible_property_type"
    | "incompatible_bedroom_group"
    | "incompatible_period"
    | "insufficient_sample"
    | "context_only"
    | "invalid_value"
    | "stale";
  reasons: string[];
  derivedId: string | null;
};

const ALLOWED_YIELD_TYPES = new Set(["house", "unit"]); // registry: NOT 'all'

export type YieldQualifyOptions = {
  minSample: number; // actual count
  maxPeriodGapDays: number;
  freshnessSlaDays: number;
};

/** Deterministic, content-addressed derived id from the two real input ids + formula version. */
export function deriveYieldId(priceObsId: string, rentObsId: string, formulaVersion: string): string {
  return "yield_" + crypto.createHash("sha256").update(`${priceObsId}|${rentObsId}|${formulaVersion}`).digest("hex").slice(0, 24);
}

export function qualifyYield(ev: YieldEvidence, opts: YieldQualifyOptions): YieldQualification {
  const reasons: string[] = [];
  const req = (cond: boolean, why: string) => {
    if (!cond) reasons.push(why);
  };

  // 1. Proven upstream lineage for BOTH inputs.
  req(!!ev.price.observationId, "price: no proven upstream observation id");
  req(!!ev.rent.observationId, "rent: no proven upstream observation id");

  // 2. Same canonical geography + version, both suburb-level.
  req(!!ev.price.geographyId && ev.price.geographyId === ev.rent.geographyId, "inputs are not the same canonical geography id");
  req(!!ev.price.asgsVersion && ev.price.asgsVersion === ev.rent.asgsVersion, "inputs are not the same ASGS geography version");
  req(ev.price.geographyLevel === "suburb", "price is not suburb-level");
  req(ev.rent.geographyLevel === "suburb", "rent is not suburb-level");

  // 3. Independent DIRECT status for each input (no postcode/SA2/LGA contextual).
  req(ev.price.directStatus === "direct", "price is not an independently-direct suburb observation");
  req(ev.rent.directStatus === "direct", "rent is not an independently-direct suburb observation");

  // 4. Property type: house-with-house or unit-with-unit, never 'all'.
  const pt = ev.price.propertyType;
  req(pt != null && ALLOWED_YIELD_TYPES.has(pt), `price property_type ${pt ?? "null"} not permitted for gross yield (house/unit only)`);
  req(ev.rent.propertyType != null && ev.rent.propertyType === pt, "price and rent property types differ");

  // 5. Bedroom grouping compatible (identical groups).
  req((ev.price.bedroomGroup ?? null) === (ev.rent.bedroomGroup ?? null), "bedroom groupings differ");

  // 6. ACTUAL sample sizes meet the metric minimum (labels are not accepted).
  req(ev.price.sampleSize != null && ev.price.sampleSize >= opts.minSample, "price actual sample size below minimum");
  req(ev.rent.sampleSize != null && ev.rent.sampleSize >= opts.minSample, "rent actual sample size below minimum");

  // 7. Valid positive values.
  req(ev.price.value != null && ev.price.value > 0 && ev.rent.value != null && ev.rent.value > 0, "invalid/non-positive value");

  // 8. Period windows present and compatible.
  const havePeriods = ev.price.periodStart && ev.price.periodEnd && ev.rent.periodStart && ev.rent.periodEnd;
  req(!!havePeriods, "missing period start/end on one or both inputs");
  if (havePeriods) {
    const gap = Math.abs(new Date(ev.price.periodEnd!).getTime() - new Date(ev.rent.periodEnd!).getTime()) / 86_400_000;
    req(gap <= opts.maxPeriodGapDays, `period windows exceed ${opts.maxPeriodGapDays}d compatibility`);
  }

  // 9. Freshness within SLA.
  req(ev.price.ageDays != null && ev.price.ageDays <= opts.freshnessSlaDays, "price stale beyond SLA");
  req(ev.rent.ageDays != null && ev.rent.ageDays <= opts.freshnessSlaDays, "rent stale beyond SLA");

  if (reasons.length === 0) {
    return {
      qualified: true,
      disposition: "materialised_local",
      reasons: [],
      derivedId: deriveYieldId(ev.price.observationId!, ev.rent.observationId!, "gross_yield@2"),
    };
  }

  // Pick the single most-fundamental disposition (lineage first).
  const disposition: YieldQualification["disposition"] =
    reasons.some((r) => r.includes("observation id") || r.includes("ASGS") || r.includes("independently-direct") || r.includes("suburb-level"))
      ? reasons.some((r) => r.includes("independently-direct") || r.includes("suburb-level"))
        ? "context_only"
        : "lineage_unverified"
      : reasons.some((r) => r.includes("property_type") || r.includes("property types"))
        ? "incompatible_property_type"
        : reasons.some((r) => r.includes("bedroom"))
          ? "incompatible_bedroom_group"
          : reasons.some((r) => r.includes("sample"))
            ? "insufficient_sample"
            : reasons.some((r) => r.includes("period"))
              ? "incompatible_period"
              : reasons.some((r) => r.includes("stale"))
                ? "stale"
                : "invalid_value";

  return { qualified: false, disposition, reasons, derivedId: null };
}
