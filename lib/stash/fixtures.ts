import type {
  StashLocality,
  StashSuburbStatistics,
  StashSuburbDemographics,
  StashRecentSales,
} from "./schemas";

/**
 * Documented-SHAPE fixtures for tests and offline development.
 *
 * These are SYNTHETIC. Propellect has no Stash API access at time of writing
 * (see STASH_ACCESS_REQUIREMENTS.md), so no real Stash response has been
 * captured. Values here are illustrative and exist only to exercise the adapter,
 * schema validation, locality matching, and fallback logic — they must never be
 * presented to a user as real Stash data. Once licensed access exists, replace
 * these with fixtures captured from the live API (still no secrets in the file).
 */

export const calderwoodStashLocalities: StashLocality[] = [
  { locality_id: "stash-loc-2527-calderwood", suburb: "Calderwood", state: "NSW", postcode: "2527" },
  // A same-name decoy in another state, to prove name-only matching is refused.
  { locality_id: "stash-loc-vic-calderwood", suburb: "Calderwood", state: "VIC", postcode: "3999" },
];

export const calderwoodStashStatistics: StashSuburbStatistics = {
  locality_id: "stash-loc-2527-calderwood",
  as_of: "2026-06-30",
  median_sale_price: [
    { property_type: "house", bedrooms: null, value: 905000, unit: "AUD", as_of: "2026-06-30", sample_size: 118 },
    { property_type: "unit", bedrooms: null, value: 640000, unit: "AUD", as_of: "2026-06-30", sample_size: 22 },
  ],
  median_rent: [
    { property_type: "house", bedrooms: null, value: 680, unit: "AUD/week", as_of: "2026-06-30", sample_size: 40 },
  ],
  gross_yield: [
    { property_type: "house", bedrooms: null, value: 3.9, unit: "%", as_of: "2026-06-30", sample_size: null },
  ],
  vacancy_rate: [
    { property_type: "all", bedrooms: null, value: 1.4, unit: "%", as_of: "2026-06-30", sample_size: null },
  ],
  days_on_market: [
    { property_type: "house", bedrooms: null, value: 31, unit: "days", as_of: "2026-06-30", sample_size: null },
  ],
  sales_volume: [
    { property_type: "house", bedrooms: null, value: 118, unit: "count", as_of: "2026-06-30", sample_size: null },
  ],
};

export const calderwoodStashDemographics: StashSuburbDemographics = {
  locality_id: "stash-loc-2527-calderwood",
  as_of: "2021",
  population: 6100,
  median_age: 34,
  households: 2050,
};

export const calderwoodStashRecentSales: StashRecentSales = {
  locality_id: "stash-loc-2527-calderwood",
  sales: [
    { sale_date: "2026-06-18", price: 912000, property_type: "house", bedrooms: 4, address: null },
    { sale_date: "2026-05-30", price: 878000, property_type: "house", bedrooms: 3, address: null },
  ],
};
