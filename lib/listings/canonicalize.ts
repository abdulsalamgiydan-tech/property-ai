/**
 * Canonicalisation + idempotent upsert for provider-neutral listings (V7B).
 *
 * Pure functions over an in-memory canonical store (the DB persistence shape lives
 * in draft migration 063). Deterministic: same inputs → same store + same ordered
 * change list. Handles duplicate collapse, relisting detection, price/status change
 * events, and removal of unseen listings. Never fabricates a value.
 */
import type { CanonicalListing, ListingStatus } from "./types";
import { TERMINAL_STATUSES } from "./types";

export type ListingChangeKind = "new" | "price_changed" | "status_changed" | "relisting" | "removed";

export interface ListingChange {
  key: string;
  kind: ListingChangeKind;
  from?: { status?: ListingStatus; priceLowerBound?: number | null; priceUpperBound?: number | null };
  to?: { status?: ListingStatus; priceLowerBound?: number | null; priceUpperBound?: number | null };
  relistedFromKey?: string | null;
  at: string;
}

export type ListingStore = Map<string, CanonicalListing>;

/**
 * A stable content signature (address + core attributes) for duplicate / relisting
 * detection — independent of the provider listing id, so the same home relisted
 * later (new id) can be linked to its predecessor.
 */
export function contentSignatureOf(
  parts: Pick<CanonicalListing, "address" | "propertyType" | "bedrooms" | "bathrooms" | "landAreaSqm">,
): string {
  const a = parts.address;
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return [
    norm(a.full),
    norm(a.suburb),
    norm(a.postcode),
    parts.propertyType ?? "",
    parts.bedrooms ?? "",
    parts.bathrooms ?? "",
    parts.landAreaSqm ?? "",
  ].join("|");
}

function priceChanged(a: CanonicalListing, b: CanonicalListing): boolean {
  return a.priceLowerBound !== b.priceLowerBound || a.priceUpperBound !== b.priceUpperBound;
}

/** Collapse duplicates in an incoming batch: same key → keep the newest by providerUpdatedAt. */
export function dedupeBatch(incoming: CanonicalListing[]): CanonicalListing[] {
  const byKey = new Map<string, CanonicalListing>();
  for (const c of incoming) {
    const prev = byKey.get(c.key);
    if (!prev || c.providerUpdatedAt > prev.providerUpdatedAt) byKey.set(c.key, c);
  }
  // Deterministic order by key.
  return [...byKey.values()].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));
}

export interface UpsertOptions {
  now: string;
  /** When true, existing non-terminal listings absent from the batch become `removed`. */
  removeUnseen?: boolean;
}

export interface UpsertResult {
  store: ListingStore;
  changes: ListingChange[];
}

/**
 * Idempotently merge an incoming batch into the store. Returns a NEW store and the
 * ordered list of changes. Re-applying the same batch yields zero changes.
 */
export function upsertListings(
  existing: ListingStore,
  incomingRaw: CanonicalListing[],
  opts: UpsertOptions,
): UpsertResult {
  const store: ListingStore = new Map(existing);
  const changes: ListingChange[] = [];
  const incoming = dedupeBatch(incomingRaw);
  const seen = new Set<string>();

  for (const c of incoming) {
    seen.add(c.key);
    const prior = store.get(c.key);

    if (!prior) {
      // Relisting: a new key whose content matches an earlier TERMINAL listing.
      let relistedFromKey: string | null = null;
      for (const e of store.values()) {
        if (e.key !== c.key && TERMINAL_STATUSES.has(e.status) && e.contentSignature === c.contentSignature) {
          relistedFromKey = e.key;
          break;
        }
      }
      const next: CanonicalListing = { ...c, firstSeenAt: c.firstSeenAt, lastSeenAt: opts.now, relistedFromKey };
      store.set(c.key, next);
      changes.push({
        key: c.key,
        kind: relistedFromKey ? "relisting" : "new",
        to: { status: c.status, priceLowerBound: c.priceLowerBound, priceUpperBound: c.priceUpperBound },
        relistedFromKey,
        at: opts.now,
      });
      continue;
    }

    // Existing: idempotent when the provider hasn't advanced and nothing changed.
    const merged: CanonicalListing = {
      ...c,
      firstSeenAt: prior.firstSeenAt, // preserve original first-seen
      lastSeenAt: opts.now,
      relistedFromKey: prior.relistedFromKey,
    };

    const noAdvance = prior.providerUpdatedAt === c.providerUpdatedAt;
    const samePrice = !priceChanged(prior, c);
    const sameStatus = prior.status === c.status;
    if (noAdvance && samePrice && sameStatus) {
      // Seen again, unchanged — bump lastSeenAt only, emit nothing.
      store.set(c.key, merged);
      continue;
    }

    store.set(c.key, merged);
    if (!samePrice) {
      changes.push({
        key: c.key,
        kind: "price_changed",
        from: { priceLowerBound: prior.priceLowerBound, priceUpperBound: prior.priceUpperBound },
        to: { priceLowerBound: c.priceLowerBound, priceUpperBound: c.priceUpperBound },
        at: opts.now,
      });
    }
    if (!sameStatus) {
      changes.push({
        key: c.key,
        kind: "status_changed",
        from: { status: prior.status },
        to: { status: c.status },
        at: opts.now,
      });
    }
  }

  // Removal of unseen, non-terminal listings.
  if (opts.removeUnseen) {
    for (const [key, e] of [...store.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (seen.has(key) || TERMINAL_STATUSES.has(e.status)) continue;
      const removed: CanonicalListing = { ...e, status: "removed", lastSeenAt: e.lastSeenAt };
      store.set(key, removed);
      changes.push({ key, kind: "removed", from: { status: e.status }, to: { status: "removed" }, at: opts.now });
    }
  }

  // Deterministic change ordering: by key, then kind.
  changes.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return { store, changes };
}
