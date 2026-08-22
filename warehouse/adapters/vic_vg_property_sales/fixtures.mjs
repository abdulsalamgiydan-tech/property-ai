/**
 * Representative official-format fixtures for the VIC Property Sales Statistics
 * parser. Shape mirrors the published Valuer-General Victoria "Property Sales
 * Statistics" spreadsheet in long form (Locality × Property Type × Period). The
 * XLSX binary itself is never committed — these are the header + representative
 * rows (values are illustrative but structurally faithful; sample sizes chosen to
 * exercise accept + every quarantine branch).
 */

export const REAL_ROWS = [
  ["Locality", "Property Type", "Period", "Sales", "Median Price"],
  ["ABBOTSFORD", "House", "Q2 2026", 24, 1275000], // ACCEPT (house)
  ["ABBOTSFORD", "Unit", "Q2 2026", 61, 640000], // ACCEPT (unit)
  ["BRUNSWICK", "House", "Q2 2026", 38, 1180000], // ACCEPT
  ["BALWYN", "House", "Q2 2026", 6, 2450000], // sales<10 → insufficient_sample
  ["CARLTON", "Unit", "Q2 2026", 15, 0], // median 0 → non_positive_or_suppressed_median
  ["DOCKLANDS", "Studio", "Q2 2026", 20, 480000], // unknown property type → quarantine
  ["FITZROY", "House", "H2 2026", 22, 1400000], // unparseable period → quarantine
  ["", "House", "Q2 2026", 30, 900000], // blank suburb → skipped
];

/** Header renamed → schema drift (parser must refuse, not guess). */
export const DRIFTED_ROWS = [
  ["Area", "Dwelling", "When", "Count", "Price"],
  ["ABBOTSFORD", "House", "Q2 2026", 24, 1275000],
];

/**
 * Minimal offline geography spine fixture (ASGS SAL 2021 subset) used to prove
 * suburb→geography mapping without any remote warehouse call. `ARARAT` is present
 * in two LGAs to exercise ambiguous-mapping rejection.
 */
export const SPINE_FIXTURE = [
  { geography_id: "SAL21134", suburb: "ABBOTSFORD", state: "VIC", lga: "Yarra" },
  { geography_id: "SAL22345", suburb: "BRUNSWICK", state: "VIC", lga: "Merri-bek" },
  { geography_id: "SAL22110", suburb: "BALWYN", state: "VIC", lga: "Boroondara" },
  { geography_id: "SAL22500", suburb: "CARLTON", state: "VIC", lga: "Melbourne" },
  { geography_id: "SAL29001", suburb: "ARARAT", state: "VIC", lga: "Ararat" },
  { geography_id: "SAL29002", suburb: "ARARAT", state: "VIC", lga: "Northern Grampians" }, // duplicate → ambiguous
  { geography_id: "SAL10001", suburb: "ABBOTSFORD", state: "NSW", lga: "Canada Bay" }, // different state
];
