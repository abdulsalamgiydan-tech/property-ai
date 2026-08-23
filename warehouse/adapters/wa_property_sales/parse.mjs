/**
 * Candidate adapter for the Australian Government Regional Data Hub collection
 * "Property Sales and Trends, WA".
 *
 * Official catalogue evidence confirms a CC-BY collection describing top weekly
 * property sales by suburb. It does NOT establish a reusable median-price CSV
 * schema. This parser therefore accepts only the versioned, normalised weekly
 * aggregate contract below and emits sales-count/turnover facts — never a median
 * and never a valuation. The lane remains non-publishable until a real official
 * resource header is matched and its extraction is independently reviewed.
 *
 * Pure + deterministic: no filesystem, network or database access.
 */
import crypto from "node:crypto";
import { num, str } from "../sa_common.mjs";

export const SOURCE_ID = "wa_property_sales";
export const PARSER_VERSION = "wa_property_sales@1-candidate";
export const SCHEMA_VERSION = "regional-data-hub-normalised@1";
export const EXPECTED_HEADER = ["Suburb", "State", "Week Ending", "Number of Sales", "Total Turnover"];

export function headerFingerprint(header) {
  const canonical = header.map((value) => str(value).toLowerCase().replace(/\s+/g, " ").trim()).join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export const EXPECTED_SCHEMA_FINGERPRINT = headerFingerprint(EXPECTED_HEADER);

function isIsoDate(value) {
  const text = str(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

export function parseWaPropertySales(rows, { retrievedAt, resourceSha } = {}) {
  if (!Array.isArray(rows) || rows.length < 2) {
    return { drift: true, driftReason: "no rows", schemaFingerprint: null, records: [], quarantined: [] };
  }

  const fingerprint = headerFingerprint(rows[0]);
  if (fingerprint !== EXPECTED_SCHEMA_FINGERPRINT) {
    return {
      drift: true,
      driftReason: `schema drift: expected normalised header ${JSON.stringify(EXPECTED_HEADER)}, received ${JSON.stringify(rows[0])}`,
      schemaFingerprint: fingerprint,
      records: [],
      quarantined: [],
    };
  }

  const records = [];
  const quarantined = [];
  for (let index = 1; index < rows.length; index++) {
    const input = rows[index];
    const suburb = str(input[0]).toUpperCase();
    if (!suburb) continue;
    const state = str(input[1]).toUpperCase();
    const periodEnd = str(input[2]);
    const salesCount = num(input[3]);
    const turnover = num(input[4]);
    const base = {
      source_id: SOURCE_ID,
      resource_sha: resourceSha ?? null,
      parser_version: PARSER_VERSION,
      schema_version: SCHEMA_VERSION,
      state,
      suburb,
      property_type: "all_residential",
      current_period_end: periodEnd,
      retrieved_at: retrievedAt ?? null,
      sales_count: salesCount,
      total_turnover: turnover,
      classification: "direct",
    };

    if (state !== "WA") { quarantined.push({ ...base, quarantine_reason: "wrong_state" }); continue; }
    if (!isIsoDate(periodEnd)) { quarantined.push({ ...base, quarantine_reason: "unparseable_period" }); continue; }
    if (!Number.isInteger(salesCount) || salesCount <= 0) { quarantined.push({ ...base, quarantine_reason: "non_positive_or_suppressed_sales_count" }); continue; }
    if (!Number.isFinite(turnover) || turnover <= 0) { quarantined.push({ ...base, quarantine_reason: "non_positive_or_suppressed_turnover" }); continue; }
    records.push(base);
  }

  records.sort((a, b) => `${a.suburb}|${a.current_period_end}`.localeCompare(`${b.suburb}|${b.current_period_end}`));
  return { drift: false, schemaFingerprint: fingerprint, records, quarantined };
}
