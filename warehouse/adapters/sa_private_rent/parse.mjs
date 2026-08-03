/**
 * Parser: SA Private Rental Report (data.sa.gov.au, CC BY) — "Suburb" sheet.
 * Source: https://data.sa.gov.au/data/dataset/private-rent-report
 * Real schema has a multi-row header (dwelling row: "Flats/Units Count",
 * "Flats/Units Median", "Houses Count", "Houses Median", "Total Count",
 * "Total Median"; a "Row Labels" row of Count/Median). Suburb rows follow.
 * `*` marks a privacy-suppressed small bond count.
 *
 * Emits DIRECT suburb rent per dwelling type (house / unit) with the real bond
 * COUNT as the sample. Rows with a suppressed/absent count are quarantined
 * (never presented as a defensible sample). Header located structurally so the
 * parser tolerates row shifts but fails closed if the markers vanish.
 */
import { num, str } from "../sa_common.mjs";

export const PARSER_VERSION = "sa_private_rent@1";
export const SOURCE_ID = "sa_private_rental_report";
export const MIN_BONDS = 10;
const GROUP_LABELS = new Set(["metro", "country", "total", "grand total", "sa", "south australia", "(blank)"]);
const MARKERS = { unitCount: "Flats/Units Count", unitMedian: "Flats/Units Median", houseCount: "Houses Count", houseMedian: "Houses Median", totalCount: "Total Count", totalMedian: "Total Median" };

function locate(rows) {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const r = (rows[i] || []).map(str);
    if (r.includes(MARKERS.houseMedian) && r.includes(MARKERS.totalMedian)) {
      const col = {};
      for (const [k, label] of Object.entries(MARKERS)) col[k] = r.indexOf(label);
      // "Row Labels" (suburb) is in the next header row (Count/Median row).
      let labelRow = -1;
      for (let j = i + 1; j <= i + 3 && j < rows.length; j++) if ((rows[j] || []).map(str).includes("Row Labels")) { labelRow = j; break; }
      col.suburb = 0;
      return { dwellingRow: i, dataStart: (labelRow === -1 ? i + 2 : labelRow + 1), col };
    }
  }
  return null;
}

export function parseSaRent(rows, { retrievedAt, resourceSha, periodEnd }) {
  if (!Array.isArray(rows) || rows.length < 3) return { drift: true, driftReason: "no rows", observations: [], quarantined: [] };
  const loc = locate(rows);
  if (!loc || loc.col.houseMedian < 0 || loc.col.totalMedian < 0) return { drift: true, driftReason: "schema drift: dwelling header markers not found", observations: [], quarantined: [] };
  if (!periodEnd) return { drift: true, driftReason: "no period end supplied", observations: [], quarantined: [] };

  const observations = [];
  const quarantined = [];
  const emit = (suburb, dwelling, count, median) => {
    const base = { source_id: SOURCE_ID, resource_sha: resourceSha, parser_version: PARSER_VERSION, state: "SA", suburb, metric: "median_rent", unit: "AUD/week", property_type: dwelling, bedroom_group: "all", aggregate_bedroom_legitimate: true, period_end: periodEnd, retrieved_at: retrievedAt, value: median, sample_size: count };
    if (median == null || median <= 0) { quarantined.push({ ...base, quarantine_reason: "non_positive_or_suppressed_median" }); return; }
    if (count == null) { quarantined.push({ ...base, quarantine_reason: "privacy_suppressed_count" }); return; }
    if (count < MIN_BONDS) { quarantined.push({ ...base, quarantine_reason: "insufficient_sample" }); return; }
    observations.push({ ...base, geography_level: "suburb", status: "direct" });
  };

  for (let i = loc.dataStart; i < rows.length; i++) {
    const r = rows[i] || [];
    const suburb = str(r[loc.col.suburb]);
    if (!suburb || GROUP_LABELS.has(suburb.toLowerCase())) continue;
    emit(suburb, "house", num(r[loc.col.houseCount]), num(r[loc.col.houseMedian]));
    emit(suburb, "unit", num(r[loc.col.unitCount]), num(r[loc.col.unitMedian]));
  }
  return { drift: false, observations, quarantined };
}
