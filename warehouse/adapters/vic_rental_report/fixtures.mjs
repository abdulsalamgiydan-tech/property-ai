/**
 * REAL-SCHEMA fixtures for the VIC rental parser — structure + values trimmed
 * verbatim from the official CC-BY resource (discover.data.vic.gov.au →
 * dffh.vic.gov.au "Moving annual median rent by suburb and town - June Quarter
 * 2025", sha256 89c37951…, Last-Modified 2025-11-14), "2 bedroom house" sheet.
 * Narrowed to three quarters so latest-period detection is exercised; the XLSX
 * binary is gitignored, never committed. `-` = suppressed.
 */
export const REAL_ROWS_2BR_HOUSE = [
  ["Moving annual median rent", null], // row1 title
  [null, null, "Dec 2024", "Dec 2024", "Mar 2025", "Mar 2025", "Jun 2025", "Jun 2025"], // row2 periods
  [null, null, "Count", "Median", "Count", "Median", "Count", "Median"], // row3 kind
  ["Inner Melbourne", "Albert Park-Middle Park-West St Kilda", 80, 770, 82, 775, 84, 780], // combined -> resolver quarantines downstream
  [null, "Armadale", 28, 790, 29, 795, 30, 798], // single suburb -> accept
  [null, "Carlton North", 100, 740, 104, 745, 107, 750], // accept
  [null, "Docklands", "-", "-", "-", "-", "-", "-"], // suppressed
  [null, "Fitzroy", 55, 790, 56, 795, 57, 800], // accept
  [null, "Tinytown", 5, 900, 6, 905, 7, 910], // count 7 < 10 -> insufficient_sample
];

export const DRIFTED_ROWS = [
  ["title"],
  [null, null, "Q1", "Q1"], // no recognisable Mon-Year quarter labels
  [null, null, "Count", "Median"],
  [null, "Armadale", 30, 798],
];
