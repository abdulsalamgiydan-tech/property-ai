/**
 * Parser: Victorian DFFH "Moving annual median rent by suburb and town"
 * (catalogued CC BY on discover.data.vic.gov.au; file served by dffh.vic.gov.au).
 * Per-dwelling+bedroom sheets ("1 bedroom flat", "2 bedroom house", …), a wide
 * time-series (Mar 2000 → latest), col A = region, col B = suburb/town, then
 * repeating Count/Median pairs per quarter. `-` = suppressed.
 *
 * Emits the LATEST-period DIRECT suburb rent per dwelling type + bedroom group.
 * COMBINED provider localities (e.g. "Albert Park-Middle Park", "CBD-St Kilda
 * Rd") are NOT single suburbs and resolve to no SAL → quarantined by the
 * resolver (never masqueraded as a suburb). Schema-drift-safe; every emitted row
 * validated; suppressed/insufficient rows quarantined with a reason.
 */
import { num, str } from "../sa_common.mjs";

export const PARSER_VERSION = "vic_rental_report@1";
export const SOURCE_ID = "vic_dffh_moving_annual_rent";
export const MIN_LEASES = 10;

// sheet name -> { property_type, bedroom_group }
export const SHEET_MAP = {
  "1 bedroom flat": { property_type: "unit", bedroom_group: "1" },
  "2 bedroom flat": { property_type: "unit", bedroom_group: "2" },
  "3 bedroom flat": { property_type: "unit", bedroom_group: "3" },
  "2 bedroom house": { property_type: "house", bedroom_group: "2" },
  "3 bedroom house": { property_type: "house", bedroom_group: "3" },
  "4 bedroom house": { property_type: "house", bedroom_group: "4+" },
};

/** "Jun 2025" -> "2025-06-30". */
export function monthQuarterEnd(label) {
  const m = String(label).match(/(Mar|Jun|Sep|Dec)\s*(\d{4})/i);
  if (!m) return null;
  const end = { mar: "03-31", jun: "06-30", sep: "09-30", dec: "12-31" }[m[1].toLowerCase()];
  return `${m[2]}-${end}`;
}

/** Locate the latest period's Count and Median columns from the header rows. */
export function locateLatest(rows) {
  const periodRow = (rows[1] || []).map(str); // row 2 (quarter labels)
  const kindRow = (rows[2] || []).map(str);    // row 3 (Count/Median)
  let medianCol = -1;
  for (let c = kindRow.length - 1; c >= 0; c--) if (kindRow[c] === "Median" && periodRow[c]) { medianCol = c; break; }
  if (medianCol < 1) return null;
  const countCol = medianCol - 1; // Count precedes Median in each pair
  const period = monthQuarterEnd(periodRow[medianCol]);
  if (!period) return null;
  return { countCol, medianCol, period };
}

export function parseVicRent(rows, { retrievedAt, resourceSha, sheetName }) {
  const map = SHEET_MAP[sheetName];
  if (!map) return { drift: true, driftReason: `unmapped sheet '${sheetName}'`, observations: [], quarantined: [] };
  if (!Array.isArray(rows) || rows.length < 5) return { drift: true, driftReason: "no rows", observations: [], quarantined: [] };
  const loc = locateLatest(rows);
  if (!loc) return { drift: true, driftReason: "schema drift: latest Count/Median columns not found", observations: [], quarantined: [] };

  const observations = [];
  const quarantined = [];
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i] || [];
    const suburb = str(r[1]); // col B
    if (!suburb || /^total$/i.test(suburb)) continue;
    const median = num(r[loc.medianCol]);
    const count = num(r[loc.countCol]);
    const base = {
      source_id: SOURCE_ID, resource_sha: resourceSha, parser_version: PARSER_VERSION, state: "VIC", suburb,
      metric: "median_rent", unit: "AUD/week", property_type: map.property_type, bedroom_group: map.bedroom_group,
      aggregate_bedroom_legitimate: false, period_end: loc.period, retrieved_at: retrievedAt, value: median, sample_size: count,
    };
    if (median == null || median <= 0) { quarantined.push({ ...base, quarantine_reason: "suppressed_or_non_positive" }); continue; }
    if (count == null || count < MIN_LEASES) { quarantined.push({ ...base, quarantine_reason: "insufficient_sample" }); continue; }
    observations.push({ ...base, geography_level: "suburb", status: "direct" });
  }
  return { drift: false, period: loc.period, observations, quarantined };
}
