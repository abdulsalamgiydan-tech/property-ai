/**
 * REAL-SCHEMA fixtures for the SA rent parser — trimmed verbatim from the
 * official CC-BY resource (data.sa.gov.au private-rent-report, resource sha256
 * d0db486e…, "Private Rental Report 2026-03", Last-Modified 2026-05-22),
 * "Suburb" sheet. Real multi-row header + real suburb rows (`*` = suppressed).
 * The XLSX binary is gitignored, never committed.
 */
// 27-wide rows, verbatim (row 13 dwelling header, row 15 count/median, then data).
export const REAL_ROWS = [
  Array(27).fill(null), // r1..r12 collapsed to blanks for brevity
  [null, "Flats/Units", null, null, null, null, null, null, null, "Flats/Units Count", "Flats/Units Median", "Houses", null, null, null, null, null, null, null, "Houses Count", "Houses Median", "Other/Unknown", null, "Other/Unknown Count", "Other/Unknown Median", "Total Count", "Total Median"],
  [null, "1 bedroom", null, "2 bedrooms", null, "3 bedrooms", null, "4+ bedrooms", null, null, null, "1 bedroom", null, "2 bedrooms", null, "3 bedrooms", null, "4+ bedrooms", null, null, null, "Not applicable"],
  ["Row Labels", "Count", "Median", "Count", "Median", "Count", "Median", "Count", "Median", null, null, "Count", "Median", "Count", "Median", "Count", "Median", "Count", "Median", null, null, "Count", "Median"],
  ["Metro", null, null, null, null, null, null, null, null, 50000, 500, null, null, null, null, null, null, null, null, 60000, 620, null, null, null, null, 110000, 560], // group row → skipped
  ["Aberfoyle Park", null, null, null, null, "*", 650, null, null, "*", 650, null, null, null, null, 25, 600, "*", 760, 30, 600, null, null, null, null, 30, 600], // house count 30 → ACCEPT; unit count '*' → suppressed
  ["Adelaide", 1610, 419.5, 265, 650, 60, 850, 5, 290, 1945, 459, 20, 299.5, 40, 655, 35, 762.5, 5, 605, 100, 650, 200, 330, 200, 330, 2245, 439], // house 100 + unit 1945 → both ACCEPT
  ["Alberton", "*", 375, 5, 260, null, null, null, null, 10, 260, null, null, "*", 490, "*", 670, "*", 700, 5, 500, null, null, null, null, 15, 427.5], // house count 5 → insufficient; unit count 10 → ACCEPT
];

/** Dwelling header markers removed → schema drift. */
export const DRIFTED_ROWS = [
  ["Row Labels", "Count", "Median", "Count", "Median"],
  ["Adelaide", 100, 650, 200, 439],
];
