/**
 * Normalisation for SA Metropolitan Median House Sales (data.sa.gov.au, CC BY):
 * parsed record → strict ASGS SAL 2021 mapping → canonical observation(s).
 *
 * Geography mapping is STRICT and never guesses. A source suburb resolves to
 * exactly one SA SAL (ASGS 2021, state_code "4") via the trusted, committed
 * geography spine (warehouse/metadata/sa_all_sals.json — the exact baseline-ID
 * set). Zero matches → quarantined (geography_unmatched); a duplicate suburb
 * name within the state → quarantined (ambiguous_geography). No guessing, ever.
 *
 * Each accepted suburb yields DIRECT, publisher-reported facts:
 *   - median_sale_price_detached (AUD)  — the published quarterly HOUSE median.
 *   - annual_price_growth_12m (%)       — the publisher's own "Median Change"
 *     column (this quarter vs the same quarter one year earlier). This is a
 *     DIRECT source figure, not something we derive; it is emitted as a percent
 *     to match the warehouse convention and is OMITTED (never zero-filled) when
 *     the source leaves it blank/suppressed.
 *
 * This module is pure + deterministic: no network, no filesystem, no database.
 */
import { buildResolver } from "../../scripts/geography/resolveSal.mjs";
import { PARSER_VERSION, SOURCE_ID } from "./parse.mjs";

export const SCHEMA_VERSION = "sa_metro_house_sales.schema@1";
export const SA_STATE_CODE = "4";
export const REFRESH_SLA_DAYS = 120;
export const LICENCE = "CC BY 4.0";
export const ATTRIBUTION = "© Government of South Australia (CC BY 4.0)";

/**
 * Build the trusted resolver from the committed SA SAL list
 * ([{ geography_code, geography_name }, …]). Uses the same production resolver
 * (normalised name + state identity) that the warehouse ingest uses, so the
 * candidate mapping is byte-for-byte the warehouse's own SAL identity logic.
 */
export function buildSaHouseResolver(salList) {
  const spine = salList.map((g) => ({
    geography_id: g.geography_code,
    geography_code: g.geography_code,
    geography_name: g.geography_name,
    state_code: SA_STATE_CODE,
  }));
  return buildResolver(spine, SA_STATE_CODE);
}

/** Shared sample-size confidence labels (warehouse-wide: high ≥30, medium ≥10). */
export function confidenceForSample(n) {
  if (Number.isFinite(n) && n >= 30) return "high";
  if (Number.isFinite(n) && n >= 10) return "medium";
  return "low";
}

/** Fresh when the reporting period is within the refresh SLA of acquisition. */
export function classifyFreshness(reportingPeriod, acquiredAt, slaDays = REFRESH_SLA_DAYS) {
  const p = new Date(`${reportingPeriod}T00:00:00Z`).getTime();
  const a = new Date(acquiredAt).getTime();
  if (!Number.isFinite(p) || !Number.isFinite(a)) return "unknown";
  const days = (a - p) / 86400000;
  if (days < 0) return "unknown";
  return days <= slaDays ? "fresh" : "stale";
}

/** Stable upsert/idempotency key — identical shape to the observation contract. */
export function naturalKey(o) {
  return [o.sourceId, o.geographyId, o.metric, o.propertyType, o.reportingPeriod]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .join("|");
}

/** @returns {{ok:true, geographyId:string, canonicalName:string} | {ok:false, reason:string}} */
export function mapSuburbToGeography(record, resolve) {
  const r = resolve(record.suburb);
  if (!r.matched) return { ok: false, reason: r.reason };
  return { ok: true, geographyId: r.geographyId, canonicalName: r.canonicalName };
}

/**
 * Parsed SA house-sales record → canonical DIRECT observation(s), or a rejection
 * with a reason (never a guessed geography, never a fabricated value).
 * @returns {{ok:true, observations:object[]} | {ok:false, reason:string, observations:[]}}
 */
export function toCanonicalObservations(record, resolve, { acquiredAt } = {}) {
  const geo = mapSuburbToGeography(record, resolve);
  if (!geo.ok) return { ok: false, reason: geo.reason, observations: [] };

  const sha = String(record.resource_sha ?? "");
  if (!/^[a-f0-9]{64}$/i.test(sha)) return { ok: false, reason: "invalid_source_file_checksum", observations: [] };

  const acquired = acquiredAt ?? record.retrieved_at ?? null;
  const common = {
    geographyId: geo.geographyId,
    geographyType: "SAL",
    geographyLabel: record.suburb,
    state: "SA",
    propertyType: "house",
    reportingPeriod: record.current_period_end,
    sourceId: record.source_id ?? SOURCE_ID,
    sourcePublished: record.current_period_end,
    acquiredAt: acquired,
    freshness: classifyFreshness(record.current_period_end, acquired),
    confidence: confidenceForSample(record.sales_count),
    fileChecksum: sha,
    adapterVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    sampleSize: record.sales_count ?? null,
  };

  const observations = [{
    ...common,
    metric: "median_sale_price_detached",
    value: record.house_median,
    unit: "AUD",
    classification: "direct",
    method: "official published quarterly metropolitan median house sale price (data.sa.gov.au, CC BY 4.0)",
  }];

  // DIRECT publisher-reported 12-month change ("Median Change"). Blank/suppressed
  // changes are OMITTED — never coerced to 0 (0% would be a fabricated no-change).
  if (record.median_change != null && Number.isFinite(record.median_change)) {
    observations.push({
      ...common,
      metric: "annual_price_growth_12m",
      value: Number((record.median_change * 100).toFixed(4)),
      unit: "%",
      classification: "direct",
      method: "publisher-reported 'Median Change' column (this quarter vs the same quarter one year earlier)",
    });
  }

  return { ok: true, observations };
}

/**
 * Reconcile a batch of canonical observations by natural key. Identical values
 * for the same key dedupe to one row; conflicting values for the same key are
 * ALL quarantined (never silently merged or averaged). Output ordering is stable
 * (geographyId, then metric) so repeat executions are byte-identical.
 * @returns {{accepted:object[], conflicts:object[], deduped:number}}
 */
export function reconcileObservations(observations) {
  const byKey = new Map();
  for (const o of observations) {
    const k = naturalKey(o);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(o);
  }
  const accepted = [];
  const conflicts = [];
  let deduped = 0;
  for (const group of byKey.values()) {
    const values = new Set(group.map((g) => g.value));
    if (values.size === 1) {
      accepted.push(group[0]);
      deduped += group.length - 1;
    } else {
      for (const g of group) conflicts.push({ ...g, quarantine_reason: "conflicting_value_same_natural_key" });
    }
  }
  accepted.sort((a, b) => String(a.geographyId).localeCompare(String(b.geographyId)) || String(a.metric).localeCompare(String(b.metric)));
  return { accepted, conflicts, deduped };
}
