/**
 * SYNTHETIC representative fixtures for the QLD RTA median-rents parser.
 * Not real RTA data — illustrative rows matching the documented column shape so
 * the parser and its guards can be tested offline. Replace with a checksum'd
 * captured sample once the source is licensed/ingested.
 */

export const validRows = [
  { locality: "Fortitude Valley", postcode: "4006", lga: "Brisbane", dwelling_type: "flat/unit", bedrooms: "2", median_weekly_rent: "620", bond_count: "310", quarter: "2026-Q1" },
  { locality: "Toowong", postcode: "4066", lga: "Brisbane", dwelling_type: "house", bedrooms: "3", median_weekly_rent: "780", bond_count: "142", quarter: "2026-Q1" },
  { locality: "Toowong", postcode: "4066", lga: "Brisbane", dwelling_type: "house", bedrooms: "all", median_weekly_rent: "760", bond_count: "9", quarter: "2026-Q1" }, // < min sample → quarantine
  { locality: "Bad Row", postcode: "40x6", lga: "Brisbane", dwelling_type: "house", bedrooms: "2", median_weekly_rent: "500", bond_count: "50", quarter: "2026-Q1" }, // bad postcode → quarantine
];

// Header renamed ("suburb" instead of "locality") → schema drift.
export const driftedRows = [
  { suburb: "Fortitude Valley", postcode: "4006", lga: "Brisbane", dwelling_type: "flat/unit", bedrooms: "2", median_weekly_rent: "620", bond_count: "310", quarter: "2026-Q1" },
];
