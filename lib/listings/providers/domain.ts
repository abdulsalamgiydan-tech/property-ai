import "server-only";
/**
 * Optional Domain (Agents & Listings) adapter — SERVER-ONLY, credential-gated,
 * and INERT until real, authorised credentials exist. It never invents credentials
 * and never runs in the browser (no client-side provider secrets — see
 * docs/decisions/V7B_listing_provider_decision.md).
 *
 * Until Domain approves Propellect's use case in writing (a signed Product Schedule,
 * not a developer trial), `isConfigured()` returns false and `fetchRaw` throws — the
 * app falls back to the labelled replay provider. The canonical mapping is stubbed
 * to the documented Domain shape so it is ready the moment access is granted.
 */
import type {
  CanonicalListing,
  ListingProviderAdapter,
  ProviderLicence,
  RawListing,
} from "../types";
import { contentSignatureOf } from "../canonicalize";

/** Domain terms: licensed, display-with-attribution, Australia-only, delete-on-termination. */
export const DOMAIN_LICENCE: ProviderLicence = {
  provider: "domain",
  licenceClass: "licensed_restricted",
  redistributionOk: true, // display allowed WITH "Powered by Domain" attribution + link-back
  attributionText: "Powered by Domain",
  retentionDays: 1, // storing listing data is discouraged; re-fetch frequently
};

/** Reads server-only env; absent by default → adapter stays inert. */
function domainConfig(): { clientId: string; clientSecret: string; baseUrl: string } | null {
  const clientId = process.env.DOMAIN_API_CLIENT_ID;
  const clientSecret = process.env.DOMAIN_API_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null; // never invent credentials
  return { clientId, clientSecret, baseUrl: process.env.DOMAIN_API_BASE_URL ?? "https://api.domain.com.au" };
}

export class DomainListingProvider implements ListingProviderAdapter {
  readonly provider = "domain";
  readonly licence = DOMAIN_LICENCE;

  static isConfigured(): boolean {
    return domainConfig() !== null;
  }

  async fetchRaw(): Promise<RawListing[]> {
    if (!DomainListingProvider.isConfigured()) {
      throw new Error(
        "Domain adapter is not configured (no authorised credentials). Use the replay provider until a signed Domain Product Schedule and server-only credentials exist.",
      );
    }
    // Intentionally not implemented here: the live HTTP calls (OAuth token, listings
    // search, mandatory view/image/enquiry event reporting per clause 17.1) are wired
    // only after written commercial approval. Failing closed is deliberate.
    throw new Error("Domain live fetch not enabled in this alpha — awaiting commercial approval.");
  }

  /** Maps a documented Domain listing payload to canonical (ready for when access lands). */
  toCanonical(raw: RawListing): CanonicalListing {
    const p = { origin: "provider" as const, provider: this.provider, retrievedAt: raw.retrievedAt };
    const d = raw.payload as Record<string, unknown>;
    const addr = (d.propertyDetails ?? {}) as Record<string, unknown>;
    const priceDetails = (d.priceDetails ?? {}) as Record<string, unknown>;
    const address: CanonicalListing["address"] = {
      full: (addr.displayableAddress as string) ?? null,
      suburb: (addr.suburb as string) ?? null,
      state: (addr.state as string) ?? null,
      postcode: (addr.postcode as string) ?? null,
      geographyId: null, // resolved via warehouse geography lookup downstream
      latitude: (addr.latitude as number) ?? null,
      longitude: (addr.longitude as number) ?? null,
      precision: addr.latitude ? "rooftop" : "locality",
    };
    const base = {
      address,
      propertyType: (addr.propertyType as CanonicalListing["propertyType"]) ?? null,
      bedrooms: (addr.bedrooms as number) ?? null,
      bathrooms: (addr.bathrooms as number) ?? null,
      landAreaSqm: (addr.landArea as number) ?? null,
    };
    return {
      provider: this.provider,
      providerListingId: raw.providerListingId,
      key: `${this.provider}:${raw.providerListingId}`,
      propertyId: (d.propertyId as string) ?? null,
      saleMode: "sale",
      status: "for_sale",
      firstSeenAt: raw.retrievedAt,
      providerUpdatedAt: raw.providerUpdatedAt,
      lastSeenAt: raw.retrievedAt,
      address,
      propertyType: base.propertyType,
      bedrooms: base.bedrooms,
      bathrooms: base.bathrooms,
      parking: (addr.carspaces as number) ?? null,
      landAreaSqm: base.landAreaSqm,
      buildingAreaSqm: (addr.buildingArea as number) ?? null,
      priceText: (priceDetails.displayPrice as string) ?? null,
      priceLowerBound: (priceDetails.priceFrom as number) ?? null,
      priceUpperBound: (priceDetails.priceTo as number) ?? null,
      priceDisplay: priceDetails.displayPrice ? "range" : "undisclosed",
      description: (d.description as string) ?? null,
      media: [],
      inspections: [],
      agent: null,
      sourceUrl: (d.seoUrl as string) ?? null,
      provenance: { status: p, price: p, address: p },
      licence: this.licence,
      rawRef: `${this.provider}:${raw.providerListingId}@${raw.providerUpdatedAt}`,
      relistedFromKey: null,
      contentSignature: contentSignatureOf(base),
    };
  }
}
