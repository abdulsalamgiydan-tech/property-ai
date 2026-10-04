import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type Access =
  | { ok: true; supabase: ReturnType<typeof client>; user: { id: string; email: string } }
  | { ok: false; status: 401 | 403 | 404; body: { error: string } };

let access: Access;

vi.mock("@/lib/auth/foundingBetaAccess", () => ({
  requireFoundingBetaAccess: async () => access,
  foundingBetaDeniedResponse: (a: Extract<Access, { ok: false }>) => NextResponse.json(a.body, { status: a.status }),
}));

import { GET, POST } from "./route";

function client(opts: { result?: { data: unknown[] | { id: string } | null; error: { message: string } | null } } = {}) {
  const result = opts.result ?? { data: [], error: null };
  const table: Record<string, unknown> = {
    select: () => table,
    order: () => Promise.resolve(result),
    insert: () => table,
    single: () => Promise.resolve(result),
  };
  return { from: () => table };
}

const validListing = {
  sourceUrl: "https://example.com/p/1",
  address: { full: "12 Test St, Grange SA 5022", suburb: "Grange", state: "SA", postcode: "5022" },
  geographyId: "SAL_40530",
  propertyType: "house",
  bedrooms: 3,
  bathrooms: 1,
  parking: 2,
  landAreaSqm: 620,
  priceDisplay: "exact",
  price: 800_000,
  listingStatus: "for_sale",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("BYOD submissions founding-beta access", () => {
  it("GET denies a non-invited authenticated user", async () => {
    access = { ok: false, status: 403, body: { error: "not in founding beta" } };
    expect((await GET()).status).toBe(403);
  });

  it("POST denies a non-invited authenticated user", async () => {
    access = { ok: false, status: 403, body: { error: "not in founding beta" } };
    const req = new NextRequest("http://localhost/api/byod/submissions", { method: "POST", body: JSON.stringify({ listing: validListing }) });
    expect((await POST(req)).status).toBe(403);
  });

  it("GET allows an invited user", async () => {
    access = { ok: true, supabase: client(), user: { id: "user-1", email: "invited@example.com" } };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ submissions: [] });
  });

  it("POST allows an invited user and returns a user-entered listing key", async () => {
    access = { ok: true, supabase: client({ result: { data: { id: "submission-1" }, error: null } }), user: { id: "user-1", email: "invited@example.com" } };
    const req = new NextRequest("http://localhost/api/byod/submissions", { method: "POST", body: JSON.stringify({ listing: validListing }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id: "submission-1", listingKey: "user-entered:submission-1" });
  });

  it("does not expose raw database errors", async () => {
    access = { ok: true, supabase: client({ result: { data: null, error: { message: "relation public.byod_submissions secret_token failed" } } }), user: { id: "user-1", email: "invited@example.com" } };
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body).toEqual({ error: "server error" });
    expect(JSON.stringify(body)).not.toMatch(/relation|secret_token|byod_submissions/i);
  });
});
