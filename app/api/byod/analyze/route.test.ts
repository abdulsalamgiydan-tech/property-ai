import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let flagOn = true;
let betaOpen = true;
let mockClient: unknown = null;
vi.mock("@/lib/auth/foundingBetaAccess", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    requireFoundingBetaAccess: async () => {
      if (!flagOn) return { ok: false, status: 404, body: { error: "not found" } };
      const user = (mockClient as { auth?: { getUser?: () => Promise<{ data: { user: unknown } }> } } | null)?.auth?.getUser
        ? (await (mockClient as { auth: { getUser: () => Promise<{ data: { user: unknown } }> } }).auth.getUser()).data.user
        : null;
      if (!user) return { ok: false, status: 401, body: { error: "unauthenticated" } };
      if (!betaOpen) return { ok: false, status: 403, body: { error: "not in founding beta" } };
      return { ok: true, supabase: mockClient, user };
    },
    foundingBetaDeniedResponse: (access: { status: number; body: unknown }) => NextResponse.json(access.body, { status: access.status }),
  };
});
vi.mock("@/lib/opportunity/candidates", () => ({ fetchCandidateRows: async () => [] }));

import { POST } from "./route";

const PROFILE = {
  maxPrice: 1_500_000, deposit: 600_000, strategy: "growth", acceptableWeeklyHoldingCost: 2_000,
  propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
};
function client(opts: { user: { id: string; email: string } | null; profiles?: unknown[] }) {
  const t: Record<string, unknown> = {};
  Object.assign(t, {
    select: () => t, order: () => t, limit: () => t,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: opts.profiles ?? [], error: null }).then(res, rej),
  });
  return { auth: { getUser: async () => ({ data: { user: opts.user } }) }, from: () => t };
}
const url = "http://localhost/api/byod/analyze";
const listing = (overrides: Record<string, unknown> = {}) => ({
  sourceUrl: "https://example.com/p/1", address: { full: "12 Test St, Grange SA 5022", suburb: "Grange", state: "SA", postcode: "5022" },
  geographyId: "SAL_40530", propertyType: "house", bedrooms: 3, bathrooms: 1, parking: 2, landAreaSqm: 620,
  priceDisplay: "exact", price: 800_000, listingStatus: "for_sale", ...overrides,
});
const post = (body: unknown) => POST(new NextRequest(url, { method: "POST", body: JSON.stringify(body) }));

afterEach(() => { flagOn = true; betaOpen = true; mockClient = null; vi.restoreAllMocks(); });

describe("byod analyze — gating", () => {
  it("flag off → 404", async () => { flagOn = false; mockClient = client({ user: { id: "A", email: "a@x.com" } }); expect((await post({ listing: listing() })).status).toBe(404); });
  it("unauthenticated → 401", async () => { mockClient = client({ user: null }); expect((await post({ listing: listing() })).status).toBe(401); });
  it("not in founding beta → 403", async () => { betaOpen = false; mockClient = client({ user: { id: "A", email: "a@x.com" } }); expect((await post({ listing: listing() })).status).toBe(403); });
});

describe("byod analyze — behaviour", () => {
  it("incomplete facts without confirmation → needsConfirmation (not a score)", async () => {
    mockClient = client({ user: { id: "A", email: "a@x.com" }, profiles: [{ inputs: PROFILE }] });
    const res = await post({ listing: listing({ bedrooms: null }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.needsConfirmation).toBe(true);
    expect(body.deal).toBeUndefined();
    expect(body.completeness.missing).toContain("bedrooms");
  });

  it("no saved buy box → needsProfile", async () => {
    mockClient = client({ user: { id: "A", email: "a@x.com" }, profiles: [] });
    const body = await (await post({ listing: listing() })).json();
    expect(body.needsProfile).toBe(true);
  });

  it("complete + profile → 200 with a class-labelled deal + one-page brief", async () => {
    mockClient = client({ user: { id: "A", email: "a@x.com" }, profiles: [{ inputs: PROFILE }] });
    const res = await post({ listing: listing() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.dataSource).toBe("user-entered");
    expect(body.deal).toBeTruthy();
    expect(body.brief.disclaimer).toMatch(/not financial, legal, lending or tax advice/i);
    expect(body.listingKey).toMatch(/^user-entered:/);
  });

  it("incomplete + confirmIncomplete → scores anyway", async () => {
    mockClient = client({ user: { id: "A", email: "a@x.com" }, profiles: [{ inputs: PROFILE }] });
    const body = await (await post({ listing: listing({ bathrooms: null }), confirmIncomplete: true })).json();
    expect(body.deal).toBeTruthy();
  });
});
