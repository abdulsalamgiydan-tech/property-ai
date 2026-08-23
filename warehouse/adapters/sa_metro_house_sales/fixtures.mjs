/**
 * REAL-SCHEMA fixtures for the SA house-sales parser — trimmed verbatim from the
 * official CC-BY resource (data.sa.gov.au metro-median-house-sales,
 * resource sha256 9cfa8aa7…, "Metropolitan Median House Sales Q2 2026",
 * Last-Modified 2026-07-17). These are the actual header + real rows (the XLSX
 * binary itself is gitignored, never committed).
 */
export const REAL_ROWS = [
  ["City", "Suburb", "Sales 2Q 2025", "Median 2Q 2025", "Sales 2Q 2026", "Median 2Q 2026", "Median Change"],
  ["ADELAIDE", "ADELAIDE", 7, 1185000, 6, 1555000, 0.31223628691983124], // sales<10 → quarantine insufficient_sample
  ["ADELAIDE HILLS", "ALDGATE", 16, 1604000, 9, 1205000, -0.24875311720698254], // curr sales 9 → quarantine
  ["ADELAIDE HILLS", "ASHTON", "", "", 1, 1800000, ""], // suppressed prior + tiny sample → quarantine
  ["ADELAIDE HILLS", "BALHANNAH", 4, 857500, 5, 1015000, 0.1836734693877551], // sales 5 → quarantine
  ["ADELAIDE HILLS", "BELAIR", 17, 1207007, 16, 1455000, 0.20546111165883876], // sales 16 → ACCEPT
  ["ADELAIDE HILLS", "STIRLING", 25, 1400000, 22, 1520000, 0.0857], // ACCEPT
];

/** Header renamed → schema drift. */
export const DRIFTED_ROWS = [
  ["City", "Locality", "Sales", "Median", "Sales", "Median", "Change"],
  ["ADELAIDE", "ADELAIDE", 20, 1000000, 22, 1100000, 0.1],
];

/**
 * Committed-style SA SAL spine slice (ASGS 2021 codes, state_code "4") for
 * offline geography-mapping tests. Mirrors warehouse/metadata/sa_all_sals.json
 * ({ geography_code, geography_name }). "Newtown" appears twice with distinct
 * codes to exercise the ambiguous-match quarantine; "Springfield" is absent to
 * exercise zero-match.
 */
export const SPINE_FIXTURE = [
  { geography_code: "40001", geography_name: "Belair" },
  { geography_code: "40002", geography_name: "Stirling (SA)" },
  { geography_code: "40003", geography_name: "Adelaide" },
  { geography_code: "40004", geography_name: "Aldgate" },
  { geography_code: "40005", geography_name: "Balhannah" },
  { geography_code: "40006", geography_name: "Ashton" },
  { geography_code: "40010", geography_name: "Newtown" },
  { geography_code: "40011", geography_name: "Newtown" },
];

/**
 * Two suburbs each appearing twice: BELAIR resolves to one SAL with an identical
 * median + change (→ deduped), STIRLING resolves to one SAL with conflicting
 * medians (→ both quarantined as conflicting_value_same_natural_key). Exercises
 * deterministic dedupe/conflict reconciliation.
 */
export const DEDUP_CONFLICT_ROWS = [
  ["City", "Suburb", "Sales 2Q 2025", "Median 2Q 2025", "Sales 2Q 2026", "Median 2Q 2026", "Median Change"],
  ["ADELAIDE HILLS", "BELAIR", 17, 1207007, 16, 1455000, 0.2054],
  ["CITY OF MITCHAM", "BELAIR", 14, 1300000, 15, 1455000, 0.2054], // same SAL, identical median+change → dedupe
  ["ADELAIDE HILLS", "STIRLING", 25, 1400000, 22, 1520000, 0.0857],
  ["ONKAPARINGA", "STIRLING", 20, 1450000, 18, 1600000, 0.10], // same SAL, conflicting median → both quarantined
];
