/**
 * Deterministic fixture/replay provider (V7B). Reads a labelled synthetic SA
 * dataset (lib/listings/fixtures/sa_listings_replay.json) organised as time-ordered
 * batches, so tests and the alpha can replay ingestion and observe lifecycle events
 * without any live provider access. Every value is invented for testing and is
 * clearly labelled as replay data — never presented as a real market listing.
 */
import type {
  CanonicalListing,
  ListingProviderAdapter,
  ListingQuery,
  PriceDisplay,
  ProviderLicence,
  RawListing,
} from "../types";
import { contentSignatureOf } from "../canonicalize";
import fixture from "../fixtures/sa_listings_replay.json";

export const REPLAY_LICENCE: ProviderLicence = {
  provider: "replay",
  licenceClass: "open_cc_by",
  redistributionOk: true, // synthetic data — safe to display in the alpha
  attributionText: "Replay dataset (synthetic — not a real listing)",
  retentionDays: 30,
};

interface FixtureRaw {
  id: string;
  propertyId: string | null;
  updatedAt: string;
  saleMode: "sale" | "rent";
  status: CanonicalListing["status"];
  address: {
    full: string; suburb: string; state: string; postcode: string;
    geographyId: string | null; lat: number | null; lon: number | null;
    precision: CanonicalListing["address"]["precision"];
  };
  propertyType: CanonicalListing["propertyType"];
  bedrooms: number | null; bathrooms: number | null; parking: number | null;
  landSqm: number | null; buildingSqm: number | null;
  priceText: string | null; priceLower: number | null; priceUpper: number | null;
  priceDisplay: PriceDisplay;
  description: string | null;
  media: { kind: "image" | "floorplan"; url: string }[];
  inspections: { start: string; end: string }[];
  agent: { name: string | null; agency: string | null; contactUrl: string | null } | null;
  sourceUrl: string | null;
}

interface FixtureFile {
  label: string;
  provider: string;
  state: string;
  batches: { asOf: string; listings: FixtureRaw[] }[];
}

const DATA = fixture as unknown as FixtureFile;

export class ReplayListingProvider implements ListingProviderAdapter {
  readonly provider = "replay";
  readonly licence = REPLAY_LICENCE;

  /** Number of replayable batches (snapshots over time). */
  get batchCount(): number {
    return DATA.batches.length;
  }

  /** fetchRaw returns a specific batch (default: the latest). */
  async fetchRaw(query: ListingQuery, batchIndex?: number): Promise<RawListing[]> {
    const idx = batchIndex ?? DATA.batches.length - 1;
    const batch = DATA.batches[idx];
    if (!batch) return [];
    const rows = batch.listings
      .filter((l) => (query.saleMode ? l.saleMode === query.saleMode : true))
      .filter(() => DATA.state === query.state);
    const limited = query.limit ? rows.slice(0, query.limit) : rows;
    return limited.map((l) => ({
      provider: this.provider,
      providerListingId: l.id,
      payload: l as unknown as Record<string, unknown>,
      providerUpdatedAt: l.updatedAt,
      retrievedAt: batch.asOf,
    }));
  }

  toCanonical(raw: RawListing): CanonicalListing {
    const l = raw.payload as unknown as FixtureRaw;
    const prov = (retrievedAt: string) => ({ origin: "provider" as const, provider: this.provider, retrievedAt });
    const p = prov(raw.retrievedAt);
    const address: CanonicalListing["address"] = {
      full: l.address.full, suburb: l.address.suburb, state: l.address.state, postcode: l.address.postcode,
      geographyId: l.address.geographyId, latitude: l.address.lat, longitude: l.address.lon, precision: l.address.precision,
    };
    const base = {
      address,
      propertyType: l.propertyType,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      landAreaSqm: l.landSqm,
    };
    return {
      provider: this.provider,
      providerListingId: l.id,
      key: `${this.provider}:${l.id}`,
      propertyId: l.propertyId,
      saleMode: l.saleMode,
      status: l.status,
      firstSeenAt: raw.retrievedAt,
      providerUpdatedAt: raw.providerUpdatedAt,
      lastSeenAt: raw.retrievedAt,
      address,
      propertyType: l.propertyType,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      parking: l.parking,
      landAreaSqm: l.landSqm,
      buildingAreaSqm: l.buildingSqm,
      priceText: l.priceText,
      priceLowerBound: l.priceLower,
      priceUpperBound: l.priceUpper,
      priceDisplay: l.priceDisplay,
      description: l.description,
      media: l.media.map((m) => ({ kind: m.kind, url: m.url, displayable: this.licence.redistributionOk })),
      inspections: l.inspections,
      agent: l.agent,
      sourceUrl: l.sourceUrl,
      provenance: {
        status: p, price: p, address: p, bedrooms: p, bathrooms: p, parking: p,
        landAreaSqm: p, buildingAreaSqm: p, media: p, agent: p, inspections: p,
      },
      licence: this.licence,
      rawRef: `${this.provider}:${l.id}@${raw.providerUpdatedAt}`,
      relistedFromKey: null,
      contentSignature: contentSignatureOf(base),
    };
  }
}

export const FIXTURE_LABEL = DATA.label;
