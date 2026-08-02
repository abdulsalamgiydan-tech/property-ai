import crypto from "crypto";

/**
 * CANONICAL gross-yield lineage qualifier — the single implementation shared by
 * the unit tests AND the executable CLI (warehouse/scripts/coverage/
 * materialise_nsw_yield.mjs imports this exact module; no duplicated logic).
 *
 * A yield may be materialised ONLY when BOTH the price and the rent input
 * independently prove the full warehouse contract. Missing evidence (no upstream
 * observation id, unverified provenance, no actual sample size, no bedroom group,
 * an aggregate 'all' property type, or an incompatible/future period window) is
 * surfaced as a disposition, never silently accepted.
 *
 * Registry rule (metric_definitions.mjs): gross_yield is house/unit only.
 *
 * @typedef {Object} InputEvidence
 * Field value-domains are enforced at RUNTIME by qualifyYield; the JSDoc types
 * are intentionally loose (string|null) so plain JS/TS test literals type-check.
 * @property {string|null} observationId   proven upstream observation id (verified via lookup)
 * @property {string|null} geographyId
 * @property {string|null} asgsVersion
 * @property {string|null} geographyLevel   "suburb" | "postcode" | "sa2" | "lga"
 * @property {string|null} directStatus     "direct" | "derived" | "contextual" (independent per input)
 * @property {string|null} sourceContract   "accepted" | null
 * @property {boolean} provenanceVerified
 * @property {string|null} sourceId
 * @property {string|null} qualityStatus   e.g. "passed"
 * @property {string|null} propertyType    "house"|"unit"|"all"|...
 * @property {string|null} bedroomGroup    null → reject; "all" only if aggregate legitimate
 * @property {boolean} [aggregateBedroomLegitimate]
 * @property {number|null} sampleSize       ACTUAL count, not a confidence label
 * @property {string|null} periodStart      ISO date
 * @property {string|null} periodEnd        ISO date
 * @property {number|null} value
 * @property {boolean} [quarantined]
 *
 * @typedef {Object} YieldEvidence
 * @property {InputEvidence} price
 * @property {InputEvidence} rent
 *
 * @typedef {Object} YieldQualifyOptions
 * @property {number} minSample
 * @property {string} asOf                  ISO date the run is anchored to
 * @property {number} maxEndLagDays
 * @property {number} freshnessSlaDays
 * @property {number} [maxWindowRatio]      default 2
 */

const ALLOWED_YIELD_TYPES = new Set(["house", "unit"]);
const ACCEPTED_QUALITY = new Set(["passed", "accepted"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/** Deterministic content-addressed derived id from the two real input ids + formula version. */
export function deriveYieldId(priceObsId, rentObsId, formulaVersion) {
  return "yield_" + crypto.createHash("sha256").update(`${priceObsId}|${rentObsId}|${formulaVersion}`).digest("hex").slice(0, 24);
}

function parseISO(d) {
  if (typeof d !== "string" || !ISO_DATE.test(d)) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * Real period-window compatibility. Returns { ok, reason }.
 * Rule: both inputs need a parseable start<=end, no future period (end<=asOf),
 * the two windows must OVERLAP or have end dates within maxEndLagDays, and their
 * lengths must be comparable (ratio <= maxWindowRatio).
 * @returns {{ok: boolean, reason: string|null}}
 */
export function checkPeriodWindow(price, rent, opts) {
  const maxRatio = opts.maxWindowRatio ?? 2;
  const asOf = parseISO(opts.asOf);
  if (asOf == null) return { ok: false, reason: "invalid as-of date" };
  const parts = { pS: parseISO(price.periodStart), pE: parseISO(price.periodEnd), rS: parseISO(rent.periodStart), rE: parseISO(rent.periodEnd) };
  if (parts.pS == null || parts.pE == null || parts.rS == null || parts.rE == null) return { ok: false, reason: "missing/unparseable period start or end" };
  if (parts.pS > parts.pE || parts.rS > parts.rE) return { ok: false, reason: "reversed period (start after end)" };
  if (parts.pE > asOf || parts.rE > asOf) return { ok: false, reason: "future-dated period end (after as-of)" };
  const day = 86_400_000;
  const overlap = Math.min(parts.pE, parts.rE) - Math.max(parts.pS, parts.rS);
  const endLag = Math.abs(parts.pE - parts.rE) / day;
  if (overlap < 0 && endLag > opts.maxEndLagDays) return { ok: false, reason: `windows do not overlap and end-lag ${Math.round(endLag)}d exceeds ${opts.maxEndLagDays}d` };
  const lenP = (parts.pE - parts.pS) / day || 1;
  const lenR = (parts.rE - parts.rS) / day || 1;
  const ratio = Math.max(lenP, lenR) / Math.min(lenP, lenR);
  if (ratio > maxRatio) return { ok: false, reason: `window lengths incompatible (ratio ${ratio.toFixed(1)} > ${maxRatio})` };
  return { ok: true, reason: null };
}

function inputReasons(side, e, opts) {
  const r = [];
  const asOf = parseISO(opts.asOf);
  if (!e.observationId) r.push(`${side}: no proven upstream observation id`);
  if (!e.geographyId) r.push(`${side}: no geography id`);
  if (!e.asgsVersion) r.push(`${side}: no ASGS geography version`);
  if (e.geographyLevel !== "suburb") r.push(`${side}: not suburb-level`);
  if (e.directStatus !== "direct") r.push(`${side}: not an independently-direct observation`);
  if (e.sourceContract !== "accepted") r.push(`${side}: source contract not accepted`);
  if (e.provenanceVerified !== true) r.push(`${side}: provenance unverified`);
  if (!e.sourceId) r.push(`${side}: no source id`);
  if (!ACCEPTED_QUALITY.has(e.qualityStatus ?? "")) r.push(`${side}: quality status not accepted`);
  if (!(e.propertyType != null && ALLOWED_YIELD_TYPES.has(e.propertyType))) r.push(`${side}: property_type ${e.propertyType ?? "null"} not permitted (house/unit only)`);
  if (e.bedroomGroup == null) r.push(`${side}: bedroom group missing`);
  else if (e.bedroomGroup === "all" && e.aggregateBedroomLegitimate !== true) r.push(`${side}: 'all' bedroom group not a documented legitimate aggregate`);
  if (!(e.sampleSize != null && e.sampleSize >= opts.minSample)) r.push(`${side}: actual sample size below minimum`);
  if (!(e.value != null && e.value > 0)) r.push(`${side}: invalid/non-positive value`);
  if (e.quarantined === true) r.push(`${side}: quarantined dependency`);
  // freshness
  const end = parseISO(e.periodEnd);
  if (end == null || asOf == null) r.push(`${side}: unparseable period/as-of for freshness`);
  else {
    const age = (asOf - end) / 86_400_000;
    if (age < 0) r.push(`${side}: future-dated period (negative age)`);
    else if (age > opts.freshnessSlaDays) r.push(`${side}: stale beyond SLA`);
  }
  return r;
}

/**
 * @param {YieldEvidence} ev
 * @param {YieldQualifyOptions} opts
 * @returns {{qualified:boolean, disposition:string, reasons:string[], derivedId:string|null}}
 */
export function qualifyYield(ev, opts) {
  const reasons = [
    ...inputReasons("price", ev.price, opts),
    ...inputReasons("rent", ev.rent, opts),
  ];
  // cross-input compatibility
  if (ev.price.geographyId && ev.rent.geographyId && ev.price.geographyId !== ev.rent.geographyId) reasons.push("inputs are not the same canonical geography id");
  if (ev.price.asgsVersion && ev.rent.asgsVersion && ev.price.asgsVersion !== ev.rent.asgsVersion) reasons.push("inputs are not the same ASGS geography version");
  if (ev.price.propertyType && ev.rent.propertyType && ev.price.propertyType !== ev.rent.propertyType) reasons.push("price and rent property types differ");
  if ((ev.price.bedroomGroup ?? null) !== (ev.rent.bedroomGroup ?? null)) reasons.push("bedroom groupings differ");
  const pw = checkPeriodWindow(ev.price, ev.rent, opts);
  if (!pw.ok) reasons.push(`period window: ${pw.reason}`);

  if (reasons.length === 0) {
    return { qualified: true, disposition: "materialised_local", reasons: [], derivedId: deriveYieldId(ev.price.observationId, ev.rent.observationId, "gross_yield@2") };
  }
  const has = (s) => reasons.some((r) => r.includes(s));
  const disposition =
    has("observation id") || has("provenance") || has("source contract") || has("source id") || has("ASGS")
      ? "lineage_unverified"
      : has("not suburb-level") || has("not an independently-direct") || has("quarantined")
        ? "context_only"
        : has("property_type") || has("property types differ")
          ? "incompatible_property_type"
          : has("bedroom")
            ? "incompatible_bedroom_group"
            : has("sample size")
              ? "insufficient_sample"
              : has("period window") || has("period")
                ? "incompatible_period"
                : has("stale") || has("future-dated")
                  ? "stale"
                  : has("quality status")
                    ? "lineage_unverified"
                    : "invalid_value";
  return { qualified: false, disposition, reasons, derivedId: null };
}
