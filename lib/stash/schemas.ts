import { z } from "zod";

/**
 * Zod schemas for the Stash Property v2 data API responses.
 *
 * IMPORTANT: the public Swagger UI at
 * https://www.stashproperty.com.au/app/api/v2/data/docs/ renders client-side,
 * so the exact wire field names could not be captured statically. These schemas
 * encode the DOCUMENTED capability shapes (suburb suggest/lookup, statistics,
 * timeseries, demographics, recent sales) and MUST be re-verified against the
 * live OpenAPI spec once licensed access is granted (see
 * STASH_ACCESS_REQUIREMENTS.md). Every response is validated before use, so a
 * shape mismatch surfaces as a `malformed_response` error rather than silently
 * feeding bad data into the UI.
 *
 * Unknown extra keys are stripped (zod default), so upstream additions never
 * break parsing, and no raw upstream field is passed through untyped.
 */

const propertyType = z.enum(["house", "unit", "townhouse", "land", "all"]);

/** Suburb suggestion / lookup — identity fields used to resolve a Stash locality. */
export const stashLocalitySchema = z.object({
  locality_id: z.union([z.string(), z.number()]).transform(String),
  suburb: z.string(),
  state: z.string(),
  postcode: z.string(),
});
export type StashLocality = z.infer<typeof stashLocalitySchema>;

export const stashLocalityListSchema = z.array(stashLocalitySchema);

/** A single statistic value with the provenance the fallback layer needs. */
export const stashStatSchema = z.object({
  property_type: propertyType,
  bedrooms: z.number().int().nullable().optional(),
  value: z.number().nullable(),
  unit: z.string().nullable().optional(),
  /** ISO date the observation is as-of. */
  as_of: z.string().nullable().optional(),
  sample_size: z.number().int().nullable().optional(),
});
export type StashStat = z.infer<typeof stashStatSchema>;

/** Suburb statistics keyed by metric — each metric carries its own property-type/bedroom context. */
export const stashSuburbStatisticsSchema = z.object({
  locality_id: z.union([z.string(), z.number()]).transform(String),
  as_of: z.string().nullable().optional(),
  median_sale_price: z.array(stashStatSchema).default([]),
  median_rent: z.array(stashStatSchema).default([]),
  gross_yield: z.array(stashStatSchema).default([]),
  vacancy_rate: z.array(stashStatSchema).default([]),
  days_on_market: z.array(stashStatSchema).default([]),
  sales_volume: z.array(stashStatSchema).default([]),
});
export type StashSuburbStatistics = z.infer<typeof stashSuburbStatisticsSchema>;

export const stashTimeseriesPointSchema = z.object({
  period: z.string(),
  property_type: propertyType,
  value: z.number().nullable(),
});
export const stashSuburbTimeseriesSchema = z.object({
  locality_id: z.union([z.string(), z.number()]).transform(String),
  metric: z.string(),
  points: z.array(stashTimeseriesPointSchema).default([]),
});
export type StashSuburbTimeseries = z.infer<typeof stashSuburbTimeseriesSchema>;

export const stashSuburbDemographicsSchema = z.object({
  locality_id: z.union([z.string(), z.number()]).transform(String),
  as_of: z.string().nullable().optional(),
  population: z.number().nullable().optional(),
  median_age: z.number().nullable().optional(),
  households: z.number().nullable().optional(),
});
export type StashSuburbDemographics = z.infer<typeof stashSuburbDemographicsSchema>;

export const stashRecentSaleSchema = z.object({
  sale_date: z.string(),
  price: z.number().nullable(),
  property_type: propertyType,
  bedrooms: z.number().int().nullable().optional(),
  address: z.string().nullable().optional(),
});
export const stashRecentSalesSchema = z.object({
  locality_id: z.union([z.string(), z.number()]).transform(String),
  sales: z.array(stashRecentSaleSchema).default([]),
});
export type StashRecentSales = z.infer<typeof stashRecentSalesSchema>;
