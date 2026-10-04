/**
 * Provider-neutral listing-ingestion contract (V7B Deal Hunter).
 *
 * A listing enters through an adapter that maps a provider's raw payload to the
 * canonical shape below WITH explicit, field-level provenance and licensing
 * metadata. Adding Domain / PropTrack / Cotality is an adapter + registry change,
 * never a change to the ranking engine — the same provider-neutral principle as
 * the V6A scoring contract (migration 059 meta.metric_provider).
 *
 * Nothing here fabricates: a value that a provider does not supply stays absent
 * (null / undisclosed), it is never invented.
 */

/** Licence class mirrors meta.metric_provider (059): open vs licensed-restricted. */
export type LicenceClass = "open_cc_by" | "licensed_restricted";

export interface ProviderLicence {
  provider: string;
  licenceClass: LicenceClass;
  /** May the value be displayed/redistributed verbatim, or only drive an internal score? */
  redistributionOk: boolean;
  /** Attribution string that must accompany any display (e.g. "Powered by Domain"). */
  attributionText: string | null;
  /** Max days a canonical row may be retained before it must be re-fetched or purged. */
  retentionDays: number;
}

/** Where a single field's value came from — the field-level provenance requirement. */
export interface FieldProvenance {
  origin: "provider" | "derived" | "user";
  provider: string | null;
  /** ISO timestamp the underlying value was retrieved / last confirmed. */
  retrievedAt: string;
}

export type SaleMode = "sale" | "rent";

/**
 * Lifecycle status. `removed` means the listing disappeared from the feed without
 * an explicit terminal status (inferred, not fabricated — see lifecycle.ts).
 */
export type ListingStatus =
  | "for_sale"
  | "under_offer"
  | "sold"
  | "withdrawn"
  | "removed";

export const TERMINAL_STATUSES: ReadonlySet<ListingStatus> = new Set(["sold", "withdrawn", "removed"]);

/** How the advertised price is expressed — hidden-price handling is explicit. */
export type PriceDisplay = "exact" | "range" | "offers_over" | "contact_agent" | "undisclosed";

export type AddressPrecision = "rooftop" | "street" | "locality" | "unknown";

export interface CanonicalAddress {
  full: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  /** Canonical SAL geography id (links to the warehouse / opportunity engine), when resolvable. */
  geographyId: string | null;
  latitude: number | null;
  longitude: number | null;
  precision: AddressPrecision;
}

export type MediaKind = "image" | "floorplan";
export interface MediaRef {
  kind: MediaKind;
  url: string;
  /** Whether the provider licence permits displaying this media. */
  displayable: boolean;
}

export interface InspectionTime {
  start: string; // ISO
  end: string; // ISO
}

export interface AgentRef {
  name: string | null;
  agency: string | null;
  /** Contact link — must not be paywalled under some provider terms (see decision doc). */
  contactUrl: string | null;
}

/** The raw provider payload — deliberately loose; the adapter owns the mapping. */
export interface RawListing {
  provider: string;
  providerListingId: string;
  /** Opaque provider payload, kept verbatim for raw→canonical lineage. */
  payload: Record<string, unknown>;
  /** ISO time the provider says this listing was last updated. */
  providerUpdatedAt: string;
  /** ISO time we retrieved it. */
  retrievedAt: string;
}

/** The canonical, engine-facing listing. */
export interface CanonicalListing {
  provider: string;
  providerListingId: string;
  /** Stable composite key = `${provider}:${providerListingId}`. */
  key: string;
  /** Provider property id when supplied (address-level), else null. */
  propertyId: string | null;

  saleMode: SaleMode;
  status: ListingStatus;

  firstSeenAt: string;
  providerUpdatedAt: string;
  lastSeenAt: string;

  address: CanonicalAddress;

  propertyType: "house" | "unit" | "townhouse" | "land" | "other" | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  landAreaSqm: number | null;
  buildingAreaSqm: number | null;

  priceText: string | null;
  priceLowerBound: number | null;
  priceUpperBound: number | null;
  priceDisplay: PriceDisplay;

  description: string | null;
  media: MediaRef[];
  inspections: InspectionTime[];
  agent: AgentRef | null;
  sourceUrl: string | null;

  /** Field-level provenance for every material field the UI may surface. */
  provenance: Record<string, FieldProvenance>;
  licence: ProviderLicence;

  /** Lineage: id of the raw payload this canonical row was derived from. */
  rawRef: string;
  /** When this listing is a relisting of an earlier one, the earlier canonical key. */
  relistedFromKey: string | null;
  /** Content signature (address + core attributes) used for duplicate/relisting detection. */
  contentSignature: string;
}

/** A query an adapter honours (deliberately minimal for the alpha). */
export interface ListingQuery {
  state: string;
  saleMode?: SaleMode;
  /** Optional cap for deterministic replay. */
  limit?: number;
}

/** The contract every provider adapter implements. */
export interface ListingProviderAdapter {
  readonly provider: string;
  readonly licence: ProviderLicence;
  /** Fetch raw listings for a query. Replay reads fixtures; Domain would call the API. */
  fetchRaw(query: ListingQuery): Promise<RawListing[]>;
  /** Deterministically map one raw payload to canonical, attaching provenance. */
  toCanonical(raw: RawListing): CanonicalListing;
}
