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
