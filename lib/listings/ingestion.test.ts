import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { ReplayListingProvider } from "./providers/replay";
import { DomainListingProvider } from "./providers/domain";
import { upsertListings, dedupeBatch, contentSignatureOf } from "./canonicalize";
import { isStale, purgeExpired, purgeProvider, isDisplayable } from "./lifecycle";
import type { CanonicalListing } from "./types";

const provider = new ReplayListingProvider();

async function canonicalBatch(batchIndex: number): Promise<CanonicalListing[]> {
  const raw = await provider.fetchRaw({ state: "SA", saleMode: "sale" }, batchIndex);
  return raw.map((r) => provider.toCanonical(r));
}

describe("replay adapter contract", () => {
  it("maps raw → canonical with a stable key, provenance on every material field, and licence", async () => {
    const [c] = await canonicalBatch(0);
    expect(c.key).toBe(`replay:${c.providerListingId}`);
    expect(c.licence.provider).toBe("replay");
    for (const field of ["status", "price", "address", "bedrooms", "media", "agent"]) {
      expect(c.provenance[field]?.origin).toBe("provider");
      expect(c.provenance[field]?.provider).toBe("replay");
    }
    expect(c.rawRef).toContain("@"); // raw→canonical lineage
  });

  it("handles hidden/undisclosed and range prices without inventing a number", async () => {
    const rows = await canonicalBatch(0);
    const belair = rows.find((r) => r.providerListingId === "RPL-0002")!;
    expect(belair.priceDisplay).toBe("contact_agent");
    expect(belair.priceLowerBound).toBeNull();
    expect(belair.priceUpperBound).toBeNull();
    const grange = rows.find((r) => r.providerListingId === "RPL-0001")!;
    expect(grange.priceDisplay).toBe("range");
    expect(grange.priceLowerBound).toBe(850000);
  });
});

describe("canonicalisation + idempotent upsert", () => {
  it("first ingest emits one 'new' per listing; re-applying the SAME batch emits nothing", async () => {
    const batch0 = await canonicalBatch(0);
    const first = upsertListings(new Map(), batch0, { now: "2026-08-01T00:00:00Z" });
    expect(first.changes.every((c) => c.kind === "new")).toBe(true);
    expect(first.changes).toHaveLength(batch0.length);
    // Idempotency: same batch again → zero changes, identical store size.
    const second = upsertListings(first.store, batch0, { now: "2026-08-01T06:00:00Z" });
    expect(second.changes).toHaveLength(0);
    expect(second.store.size).toBe(first.store.size);
  });

  it("dedupeBatch collapses duplicate keys, keeping the newest by providerUpdatedAt", () => {
    const mk = (id: string, updated: string): CanonicalListing =>
      ({ key: `replay:${id}`, providerListingId: id, providerUpdatedAt: updated } as CanonicalListing);
    const out = dedupeBatch([mk("A", "2026-08-01"), mk("A", "2026-08-03"), mk("B", "2026-08-02")]);
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.providerListingId === "A")!.providerUpdatedAt).toBe("2026-08-03");
  });

  it("batch 2 produces price_changed, under_offer, withdrawn, relisting and removal — deterministically", async () => {
    const b0 = await canonicalBatch(0);
    const b1 = await canonicalBatch(1);
    const s1 = upsertListings(new Map(), b0, { now: "2026-08-01T00:00:00Z" });
    const s2 = upsertListings(s1.store, b1, { now: "2026-08-06T00:00:00Z", removeUnseen: true });
    const byKey = Object.fromEntries(s2.changes.map((c) => [c.key, c]));

    expect(byKey["replay:RPL-0001"].kind).toBe("price_changed");
    expect(byKey["replay:RPL-0001"].from?.priceLowerBound).toBe(850000);
    expect(byKey["replay:RPL-0001"].to?.priceLowerBound).toBe(820000);

    expect(byKey["replay:RPL-0003"].kind).toBe("status_changed");
    expect(byKey["replay:RPL-0003"].to?.status).toBe("under_offer");

    expect(byKey["replay:RPL-0005"].to?.status).toBe("withdrawn");

    // RPL-0006 is the relisting of the now-withdrawn RPL-0005 (same content signature).
    expect(byKey["replay:RPL-0006"].kind).toBe("relisting");
    expect(byKey["replay:RPL-0006"].relistedFromKey).toBe("replay:RPL-0005");

    // RPL-0002 vanished from the batch → removed.
    expect(byKey["replay:RPL-0002"].kind).toBe("removed");
    expect(s2.store.get("replay:RPL-0002")!.status).toBe("removed");

    // RPL-0004 was unchanged → no event for it.
    expect(byKey["replay:RPL-0004"]).toBeUndefined();

    // Determinism: identical replay yields identical change list.
    const s2b = upsertListings(s1.store, b1, { now: "2026-08-06T00:00:00Z", removeUnseen: true });
    expect(JSON.stringify(s2b.changes)).toBe(JSON.stringify(s2.changes));
  });

  it("relisting links to a terminal predecessor with matching content signature", async () => {
    const b0 = await canonicalBatch(0);
    const b1 = await canonicalBatch(1);
    const sig5 = contentSignatureOf(b0.find((x) => x.providerListingId === "RPL-0005")!);
    const sig6 = contentSignatureOf(b1.find((x) => x.providerListingId === "RPL-0006")!);
    expect(sig5).toBe(sig6); // same home, different listing id
  });
});

describe("lifecycle + retention", () => {
  it("flags stale listings and purges rows past their licence retention window", async () => {
    const b0 = await canonicalBatch(0);
    const { store } = upsertListings(new Map(), b0, { now: "2026-08-01T00:00:00Z" });
    const now = "2026-09-15T00:00:00Z"; // > 30d after last seen
    const anyListing = [...store.values()][0];
    expect(isStale(anyListing, now, 21)).toBe(true);
    const { retained, purgedKeys } = purgeExpired(store, now);
    expect(retained.size).toBe(0); // all replay rows exceed 30d retention
    expect(purgedKeys.length).toBe(store.size);
  });

  it("provider-directed purge drops exactly that provider's rows", async () => {
    const b0 = await canonicalBatch(0);
    const { store } = upsertListings(new Map(), b0, { now: "2026-08-01T00:00:00Z" });
    const { retained, purgedKeys } = purgeProvider(store, "replay");
    expect(retained.size).toBe(0);
    expect(purgedKeys.length).toBe(store.size);
  });

  it("terminal and non-redistributable listings are not displayable", async () => {
    const b0 = await canonicalBatch(0);
    const [live] = b0;
    expect(isDisplayable(live, "2026-08-02T00:00:00Z", 21)).toBe(true);
    const enrichmentOnly = { ...live, licence: { ...live.licence, redistributionOk: false } };
    expect(isDisplayable(enrichmentOnly, "2026-08-02T00:00:00Z", 21)).toBe(false);
    const sold = { ...live, status: "sold" as const };
    expect(isDisplayable(sold, "2026-08-02T00:00:00Z", 21)).toBe(false);
  });
});

describe("domain adapter safety", () => {
  it("is inert without credentials — no client secrets, fails closed", async () => {
    expect(DomainListingProvider.isConfigured()).toBe(false);
    const d = new DomainListingProvider();
    await expect(d.fetchRaw({ state: "SA" })).rejects.toThrow(/not configured|awaiting/i);
  });
});
