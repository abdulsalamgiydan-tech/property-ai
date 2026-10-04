/**
 * Build a canonical listing from USER-ENTERED facts (V8 Bring Your Own Deal) and
 * analyse it with the exact same tested V7 engine (deriveBuyBox → rankDeals →
 * buildDealBrief). Nothing is scraped or fabricated: every field is `origin: "user"`,
 * the market evidence stays `origin: "provider"/"derived"`, and the source URL +
 * capture timestamp are preserved as provenance.
 */
import type {
  CanonicalListing,
  FieldProvenance,
  ProviderLicence,
} from "@/lib/listings/types";
import { contentSignatureOf } from "@/lib/listings/canonicalize";
import { rankDeals } from "@/lib/dealhunter/ranking";
import { buildDealBrief, type DealBrief } from "@/lib/dealhunter/dealbrief";
import type { BuyBox, DealResult, SuburbEvidence } from "@/lib/dealhunter/types";
import type { ByodListingInput } from "./schema";

export const USER_ENTERED_PROVIDER = "user-entered";

/** The user's own facts about a property they found — safe to show back to them. */
export const USER_ENTERED_LICENCE: ProviderLicence = {
  provider: USER_ENTERED_PROVIDER,
  licenceClass: "open_cc_by",
  redistributionOk: true,
  attributionText: "Entered by you (not verified by Propellect)",
  retentionDays: 3650,
};

const money = (n: number) => `A$${Math.round(n).toLocaleString("en-AU")}`;

function priceBounds(input: ByodListingInput): {
  lower: number | null;
  upper: number | null;
  text: string | null;
} {
  const p = input.price ?? null;
  switch (input.priceDisplay) {
    case "exact":
      return { lower: p, upper: p, text: p != null ? money(p) : null };
    case "range":
      return { lower: p, upper: input.priceUpper ?? null, text: p != null && input.priceUpper != null ? `${money(p)} – ${money(input.priceUpper)}` : p != null ? `${money(p)}+` : null };
    case "offers_over":
      return { lower: p, upper: null, text: p != null ? `Offers over ${money(p)}` : "Offers over (price not entered)" };
    case "contact_agent":
      return { lower: null, upper: null, text: "Contact agent" };
    case "undisclosed":
    default:
      return { lower: null, upper: null, text: "Undisclosed" };
  }
}

export interface BuildOpts {
  submissionId: string;
  now: string;
}

/** Deterministically map validated user input → a canonical listing with user provenance. */
export function buildUserEnteredListing(input: ByodListingInput, opts: BuildOpts): CanonicalListing {
  const retrievedAt = input.sourceCapturedAt ?? opts.now;
  const userProv = (): FieldProvenance => ({ origin: "user", provider: USER_ENTERED_PROVIDER, retrievedAt });
  const { lower, upper, text } = priceBounds(input);

  const address: CanonicalListing["address"] = {
    full: input.address.full,
    suburb: input.address.suburb,
    state: input.address.state,
    postcode: input.address.postcode ?? null,
    geographyId: input.geographyId,
    latitude: null,
    longitude: null,
    precision: "street",
  };

  const base = {
    address,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    landAreaSqm: input.landAreaSqm ?? null,
  };

  return {
    provider: USER_ENTERED_PROVIDER,
    providerListingId: opts.submissionId,
    key: `${USER_ENTERED_PROVIDER}:${opts.submissionId}`,
    propertyId: null,
    saleMode: "sale",
    status: input.listingStatus,
    firstSeenAt: retrievedAt,
    providerUpdatedAt: retrievedAt,
    lastSeenAt: opts.now,
    address,
    propertyType: input.propertyType,
    bedrooms: input.bedrooms ?? null,
    bathrooms: input.bathrooms ?? null,
    parking: input.parking ?? null,
    landAreaSqm: input.landAreaSqm ?? null,
    buildingAreaSqm: null,
    priceText: text,
    priceLowerBound: lower,
    priceUpperBound: upper,
    priceDisplay: input.priceDisplay,
    description: null,
    media: [],
    inspections: [],
    agent: null,
    sourceUrl: input.sourceUrl ?? null,
    provenance: {
      status: userProv(),
      price: userProv(),
      address: userProv(),
      bedrooms: userProv(),
      bathrooms: userProv(),
      parking: userProv(),
      landAreaSqm: userProv(),
    },
    licence: USER_ENTERED_LICENCE,
    rawRef: `${USER_ENTERED_PROVIDER}:${opts.submissionId}@${retrievedAt}`,
    relistedFromKey: null,
    contentSignature: contentSignatureOf(base),
  };
}

export type DealBucket = "ranked" | "needs_review" | "ineligible";

export interface ByodAnalysis {
  deal: DealResult;
  brief: DealBrief;
  bucket: DealBucket;
  listingKey: string;
}

/** Score one user-entered listing against the user's buy box + official evidence. */
export function analyzeUserEnteredDeal(args: {
  input: ByodListingInput;
  buyBox: BuyBox;
  evidenceByGeo: Record<string, SuburbEvidence>;
  now: string;
  submissionId: string;
}): ByodAnalysis {
  const listing = buildUserEnteredListing(args.input, { submissionId: args.submissionId, now: args.now });
  const out = rankDeals([listing], args.buyBox, args.evidenceByGeo, { asOf: args.now });
  let deal: DealResult;
  let bucket: DealBucket;
  if (out.ranked[0]) { deal = out.ranked[0]; bucket = "ranked"; }
  else if (out.needsReview[0]) { deal = out.needsReview[0]; bucket = "needs_review"; }
  else { deal = out.ineligible[0]; bucket = "ineligible"; }
  const brief = buildDealBrief(deal, args.now);
  return { deal, brief, bucket, listingKey: listing.key };
}
