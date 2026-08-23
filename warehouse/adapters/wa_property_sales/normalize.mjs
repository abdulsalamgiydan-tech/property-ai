import {
  PARSER_VERSION,
  SCHEMA_VERSION,
} from "./parse.mjs";

export function mapSuburbToGeography(suburb, state, spine) {
  const label = String(suburb ?? "").toUpperCase().trim();
  const jurisdiction = String(state ?? "").toUpperCase().trim();
  if (!label || !jurisdiction) return { ok: false, reason: "missing_suburb_or_state" };
  const matches = spine.filter((item) =>
    String(item.suburb).toUpperCase() === label && String(item.state).toUpperCase() === jurisdiction,
  );
  if (matches.length === 0) return { ok: false, reason: `no_asgs_match_for_${label}_${jurisdiction}` };
  if (matches.length > 1) return { ok: false, reason: `ambiguous_asgs_match_for_${label}_${jurisdiction}_(${matches.length}_candidates)` };
  return { ok: true, geographyId: matches[0].geography_id };
}

/**
 * One weekly source row creates two facts. Neither is a median price, and no
 * downstream consumer may reinterpret turnover / count as a valuation.
 */
export function toCanonicalObservations(record, spine) {
  const geography = mapSuburbToGeography(record.suburb, record.state, spine);
  if (!geography.ok) return { ok: false, reason: geography.reason, observations: [] };
  if (!/^[a-f0-9]{64}$/i.test(record.resource_sha ?? "")) {
    return { ok: false, reason: "invalid_source_file_checksum", observations: [] };
  }

  const common = {
    geographyId: geography.geographyId,
    geographyType: "SAL",
    geographyLabel: record.suburb,
    state: record.state,
    propertyType: "all_residential",
    reportingPeriod: record.current_period_end,
    sourceId: record.source_id,
    sourcePublished: record.current_period_end,
    acquiredAt: record.retrieved_at,
    classification: "direct",
    freshness: "unknown",
    confidence: "low",
    fileChecksum: record.resource_sha,
    adapterVersion: PARSER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    sampleSize: record.sales_count,
    method: "official weekly top-sales aggregate; candidate schema pending live resource match",
  };
  return {
    ok: true,
    observations: [
      { ...common, metric: "weekly_property_sales_count", value: record.sales_count, unit: "transactions" },
      { ...common, metric: "weekly_property_sales_turnover", value: record.total_turnover, unit: "AUD" },
    ],
  };
}
