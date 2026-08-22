/**
 * Normalisation for VIC Property Sales Statistics: parsed record → ASGS geography
 * mapping → canonical metric observation compatible with
 * `lib/warehouse/metricProvenance.ts` (MetricObservation shape).
 *
 * Geography mapping is STRICT: a suburb must resolve to exactly one ASGS SAL id
 * within its state. Zero matches → invalid (rejected). Multiple matches (same
 * suburb name in different LGAs) → ambiguous (rejected). Never guesses.
 *
 * Pure + deterministic. No network, no I/O.
 */

/**
 * @returns {{ ok: true, geography_id: string } | { ok: false, reason: string }}
 */
export function mapSuburbToGeography(suburb, state, spine) {
  const s = String(suburb ?? "").toUpperCase().trim();
  const st = String(state ?? "").toUpperCase().trim();
  if (!s || !st) return { ok: false, reason: "missing_suburb_or_state" };
  const matches = spine.filter((g) => g.suburb.toUpperCase() === s && g.state.toUpperCase() === st);
  if (matches.length === 0) return { ok: false, reason: `no_asgs_match_for_${s}_${st}` };
  if (matches.length > 1) return { ok: false, reason: `ambiguous_asgs_match_for_${s}_${st}_(${matches.length}_candidates)` };
  return { ok: true, geography_id: matches[0].geography_id };
}

/** Canonical metric name for a sale-price median by property type. */
export function saleMetricName(propertyType) {
  return propertyType === "house" ? "median_sale_price_detached"
    : propertyType === "unit" ? "median_sale_price_apartment"
    : `median_sale_price_${propertyType}`;
}

/**
 * Parsed VIC record → { geography_id, observation } as a MetricObservation, or a
 * rejection with reason. `ingestedAt` is caller-supplied (deterministic in tests).
 */
export function toCanonicalObservation(record, spine, { ingestedAt } = {}) {
  const geo = mapSuburbToGeography(record.suburb, record.state, spine);
  if (!geo.ok) return { ok: false, reason: geo.reason, suburb: record.suburb };
  return {
    ok: true,
    geography_id: geo.geography_id,
    suburb: record.suburb,
    state: record.state,
    observation: {
      metric: saleMetricName(record.property_type),
      value: record.median_sale_price,
      unit: "AUD",
      propertyType: record.property_type,
      reportingPeriod: record.current_period_end,
      sourceId: record.source_id,
      sourcePublished: record.current_period_end,
      ingestedAt: ingestedAt ?? record.retrieved_at ?? null,
      classification: "direct", // a published VG median is a DIRECT observation
      method: record.parser_version,
      quality: record.sales_count != null ? `n=${record.sales_count} sales` : null,
    },
  };
}
