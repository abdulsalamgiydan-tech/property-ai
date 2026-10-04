/**
 * "Bring Your Own Deal" (V8) — user-entered listing input.
 *
 * The customer pastes a listing URL FOR REFERENCE ONLY and manually enters the facts.
 * We NEVER scrape or auto-extract the page. Every field here is user-supplied and is
 * labelled `origin: "user"` downstream. The source URL + capture timestamp are kept as
 * provenance so the brief can show where the facts came from.
 */
import { z } from "zod";

export const BYOD_PROPERTY_TYPES = ["house", "unit", "townhouse", "land", "other"] as const;
export const BYOD_PRICE_DISPLAYS = ["exact", "range", "offers_over", "contact_agent", "undisclosed"] as const;
export const BYOD_STATUSES = ["for_sale", "under_offer", "sold", "withdrawn"] as const;
export const BYOD_STATES = ["SA", "VIC", "NSW", "QLD", "WA", "TAS", "ACT", "NT"] as const;

export const byodListingSchema = z
  .object({
    /** Reference only — never fetched/scraped. */
    sourceUrl: z.string().url().max(2048).nullable().optional(),
    /** ISO time the user captured the facts from the listing (defaults to now server-side). */
    sourceCapturedAt: z.string().datetime().nullable().optional(),

    address: z.object({
      full: z.string().min(3).max(240),
      suburb: z.string().min(1).max(120),
      state: z.enum(BYOD_STATES),
      postcode: z.string().max(8).nullable().optional(),
    }),
    /** Canonical SAL geography id the user selected (links to official market evidence). */
    geographyId: z.string().min(3).max(32),

    propertyType: z.enum(BYOD_PROPERTY_TYPES),
    bedrooms: z.number().int().min(0).max(20).nullable().optional(),
    bathrooms: z.number().int().min(0).max(20).nullable().optional(),
    parking: z.number().int().min(0).max(20).nullable().optional(),
    landAreaSqm: z.number().positive().max(1_000_000).nullable().optional(),

    priceDisplay: z.enum(BYOD_PRICE_DISPLAYS),
    /** Lower bound / exact price. Null only when priceDisplay is contact_agent/undisclosed. */
    price: z.number().positive().max(50_000_000).nullable().optional(),
    /** Upper bound (range only). */
    priceUpper: z.number().positive().max(50_000_000).nullable().optional(),

    listingStatus: z.enum(BYOD_STATUSES),
  })
  .strict();

export type ByodListingInput = z.infer<typeof byodListingSchema>;

/** Fields that materially affect the score; absence must be confirmed before scoring. */
export interface Completeness {
  /** Facts the user left blank that materially affect the score / brief. */
  missing: string[];
  /** True when a disclosed price is expected but absent (blocks affordability gating). */
  priceMissing: boolean;
  complete: boolean;
}

const PRICE_DISCLOSED = new Set(["exact", "range", "offers_over"]);

export function assessCompleteness(input: ByodListingInput): Completeness {
  const missing: string[] = [];
  const priceExpected = PRICE_DISCLOSED.has(input.priceDisplay);
  const priceMissing = priceExpected && (input.price == null);
  if (priceMissing) missing.push("price");
  if (input.priceDisplay === "range" && input.priceUpper == null) missing.push("price upper bound");
  if (input.bedrooms == null) missing.push("bedrooms");
  if (input.bathrooms == null) missing.push("bathrooms");
  if (input.parking == null) missing.push("parking");
  if (input.propertyType !== "unit" && input.landAreaSqm == null) missing.push("land area");
  return { missing, priceMissing, complete: missing.length === 0 };
}
