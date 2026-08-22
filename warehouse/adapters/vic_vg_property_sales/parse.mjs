/**
 * Parser: Victorian Property Sales Statistics (Valuer-General Victoria).
 * Source (landing): https://www.land.vic.gov.au/valuations/resources-and-reports/property-sales-statistics
 * Registry id: vic_vg_property_sales · Licence: CC BY (© State of Victoria) · Cadence: quarterly.
 *
 * DIRECT suburb-level median SALE price by property type. Representative published
 * "long" shape (one row per suburb × property type × period):
 *   Locality | Property Type | Period | Sales | Median Price
 *
 * Schema-drift-safe (validates the header structurally), derives the quarter end
 * from the Period label, validates every row, and QUARANTINES suppressed/invalid/
 * insufficient-sample rows WITH a reason. Never fabricates a missing value.
 *
 * Pure + deterministic: same input rows → identical output (records sorted by a
 * stable natural key). No network, no I/O.
 */
import { num, str } from "../sa_common.mjs";

export const PARSER_VERSION = "vic_vg_property_sales@1";
export const SOURCE_ID = "vic_vg_property_sales";
export const MIN_SALES = 10; // defensible-median threshold (mirrors SA / registry minSample convention)

const TYPE_MAP = new Map([
  ["house", "house"],
  ["houses", "house"],
  ["unit", "unit"],
  ["units", "unit"],
  ["unit/apartment", "unit"],
  ["apartment", "unit"],
  ["flat", "unit"],
  ["vacant land", "land"],
  ["land", "land"],
]);

/** "Q2 2026" / "2026 Q2" / "Jun 2026" → ISO quarter-end date, else null. */
export function vicQuarterEnd(label) {
  const s = str(label);
  const q = s.match(/\bQ([1-4])\b/i);
  const y = s.match(/\b(19|20)\d{2}\b/);
  if (q && y) {
    const month = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" }[Number(q[1])];
    return `${y[0]}-${month}`;
  }
  return null;
}

export function normalisePropertyType(raw) {
  const key = str(raw).toLowerCase().trim();
  return TYPE_MAP.get(key) ?? null;
}

export function parseVicPropertySales(rows, { retrievedAt, resourceSha } = {}) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return { drift: true, driftReason: "no rows", records: [], quarantined: [] };
  }
  const h = rows[0].map((c) => str(c).toLowerCase());
  const shapeOk =
    /^locality|^suburb/.test(h[0] || "") &&
    /property type|^type/.test(h[1] || "") &&
    /period|quarter/.test(h[2] || "") &&
    /^sales|count/.test(h[3] || "") &&
    /median/.test(h[4] || "");
  if (!shapeOk) {
    return { drift: true, driftReason: `schema drift: unexpected header ${JSON.stringify(rows[0])}`, records: [], quarantined: [] };
  }

  const records = [];
  const quarantined = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const suburb = str(r[0]).toUpperCase();
    if (!suburb) continue;
    const propertyType = normalisePropertyType(r[1]);
    const periodEnd = vicQuarterEnd(r[2]);
    const sales = num(r[3]);
    const median = num(r[4]);
    const base = {
      source_id: SOURCE_ID,
      resource_sha: resourceSha ?? null,
      parser_version: PARSER_VERSION,
      state: "VIC",
      suburb,
      property_type: propertyType,
      bedroom_group: "all",
      aggregate_bedroom_legitimate: true,
      current_period_end: periodEnd,
      retrieved_at: retrievedAt ?? null,
      median_sale_price: median,
      sales_count: sales,
      classification: "direct",
    };
    if (propertyType == null) { quarantined.push({ ...base, quarantine_reason: "unknown_property_type" }); continue; }
    if (periodEnd == null) { quarantined.push({ ...base, quarantine_reason: "unparseable_period" }); continue; }
    if (median == null || median <= 0) { quarantined.push({ ...base, quarantine_reason: "non_positive_or_suppressed_median" }); continue; }
    if (sales == null || sales < MIN_SALES) { quarantined.push({ ...base, quarantine_reason: "insufficient_sample" }); continue; }
    records.push(base);
  }
  // Stable ordering → deterministic, idempotent reruns.
  records.sort((a, b) =>
    `${a.suburb}|${a.property_type}|${a.current_period_end}`.localeCompare(`${b.suburb}|${b.property_type}|${b.current_period_end}`),
  );
  return { drift: false, records, quarantined };
}
