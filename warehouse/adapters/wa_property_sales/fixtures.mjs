/**
 * Sanitised illustrative fixtures for the adapter's versioned NORMALISED
 * contract. They are not represented as a byte-for-byte copy of an official
 * resource and are not evidence of live coverage.
 */
export const NORMALISED_ROWS = [
  ["Suburb", "State", "Week Ending", "Number of Sales", "Total Turnover"],
  ["FREMANTLE", "WA", "2026-08-21", 14, 17_800_000],
  ["ALBANY", "WA", "2026-08-21", 9, 6_120_000],
  ["SPRINGFIELD", "WA", "2026-08-21", 3, 1_440_000],
  ["PERTH", "NSW", "2026-08-21", 4, 2_000_000],
  ["BROOME", "WA", "week 34", 5, 3_000_000],
  ["BUNBURY", "WA", "2026-08-21", "suppressed", 2_000_000],
  ["GERALDTON", "WA", "2026-08-21", 4, 0],
  ["", "WA", "2026-08-21", 2, 1_000_000],
];

export const DRIFTED_ROWS = [
  ["Locality", "Jurisdiction", "Date", "Transactions", "Value"],
  ["FREMANTLE", "WA", "2026-08-21", 14, 17_800_000],
];

export const SPINE_FIXTURE = [
  { geography_id: "SAL51124", suburb: "FREMANTLE", state: "WA", lga: "Fremantle" },
  { geography_id: "SAL50018", suburb: "ALBANY", state: "WA", lga: "Albany" },
  { geography_id: "SAL59001", suburb: "SPRINGFIELD", state: "WA", lga: "Alpha" },
  { geography_id: "SAL59002", suburb: "SPRINGFIELD", state: "WA", lga: "Beta" },
  { geography_id: "SAL12345", suburb: "FREMANTLE", state: "NSW", lga: "Example" },
];
