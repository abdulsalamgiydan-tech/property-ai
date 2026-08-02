/**
 * Parser: Queensland RTA quarterly median rents.
 * Source (official, free): https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data
 *
 * Deterministic and schema-drift-safe: it validates the expected header set and
 * FAILS CLOSED (returns a fatal drift result, transforms nothing) if a required
 * column is missing or renamed — the Coverage Maximiser must never transform a
 * shape it does not recognise. Rows that individually fail validation are
 * quarantined with a reason, never silently dropped or coerced.
 *
 * This module only PARSES an already-downloaded, already-CSV-decoded row set
 * into canonical observations with full provenance. It performs no network I/O,
 * no name-only geography matching, and no bedroom/property-type mixing.
 */

export const PARSER_VERSION = "qld_rta_rent@1";
export const SOURCE_ID = "qld_rta_median_rents";

const REQUIRED_COLUMNS = ["locality", "postcode", "lga", "dwelling_type", "bedrooms", "median_weekly_rent", "bond_count", "quarter"];

// RTA dwelling types → canonical property types (aggregate stays aggregate).
const DWELLING_MAP = { house: "house", townhouse: "townhouse", "flat/unit": "unit", unit: "unit", "all dwellings": "all" };

function normBedrooms(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "all" || s === "") return "all";
  const m = s.match(/(\d+)/);
  if (!m) return null;
  return Number(m[1]) >= 4 ? "4+" : m[1];
}

/** ISO date for the END of a "YYYY-Qn" quarter label. */
function quarterEndIso(q) {
  const m = String(q).match(/^(\d{4})-?Q([1-4])$/i);
  if (!m) return null;
  const endMonth = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" }[Number(m[2])];
  return `${m[1]}-${endMonth}`;
}

/**
 * @param {object} input
 * @param {Array<Record<string,unknown>>} input.rows  already-decoded CSV rows
 * @param {string} input.retrievedAt                  ISO retrieval date
 * @param {number} [input.minBondSample]              minimum bonds to accept a row (default 10)
 * @returns {{drift:boolean, driftReason?:string, observations:Array, quarantined:Array}}
 */
export function parseQldRtaRent({ rows, retrievedAt, minBondSample = 10 }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { drift: true, driftReason: "no rows", observations: [], quarantined: [] };
  }
  const header = Object.keys(rows[0]);
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    // Fail closed — do not transform an unrecognised schema.
    return { drift: true, driftReason: `schema drift: missing columns ${missing.join(", ")}`, observations: [], quarantined: [] };
  }

  const observations = [];
  const quarantined = [];
  for (const row of rows) {
    const propertyType = DWELLING_MAP[String(row.dwelling_type ?? "").trim().toLowerCase()];
    const bedrooms = normBedrooms(row.bedrooms);
    const period = quarterEndIso(row.quarter);
    const rent = row.median_weekly_rent == null || row.median_weekly_rent === "" ? null : Number(row.median_weekly_rent);
    const bonds = row.bond_count == null || row.bond_count === "" ? null : Number(row.bond_count);
    const postcode = String(row.postcode ?? "").trim();

    let reason = null;
    if (!propertyType) reason = "incompatible_property_type";
    else if (bedrooms === null) reason = "incompatible_bedroom_group";
    else if (!period) reason = "incompatible_period";
    else if (rent == null || !Number.isFinite(rent) || rent <= 0) reason = "calculation_inputs_missing";
    else if (bonds == null || bonds < minBondSample) reason = "insufficient_sample";
    else if (!/^\d{4}$/.test(postcode)) reason = "geography_unmatched";

    const provenance = {
      metric: "median_rent",
      unit: "AUD/week",
      source_id: SOURCE_ID,
      source_field: `median_weekly_rent[${row.dwelling_type}/${row.bedrooms}bd]`,
      state: "QLD",
      locality_raw: String(row.locality ?? "").trim(),
      postcode,
      lga_raw: String(row.lga ?? "").trim(),
      property_type: propertyType ?? null,
      bedroom_group: bedrooms,
      observation_period: period,
      retrieved_at: retrievedAt,
      sample_size: bonds,
      parser_version: PARSER_VERSION,
    };

    if (reason) {
      quarantined.push({ ...provenance, value: rent, quarantine_reason: reason });
      continue;
    }
    observations.push({
      ...provenance,
      value: rent,
      // Geography level is decided downstream by an AUTHORITATIVE locality match
      // (suburb+state+postcode). Until then this is postcode-anchored context.
      geography_level: "postcode",
      status: "contextual",
    });
  }
  return { drift: false, observations, quarantined };
}
