import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getUser = vi.fn();
const maybeSingle = vi.fn();
const isSupabaseConfigured = vi.fn(() => true);

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => isSupabaseConfigured() }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => maybeSingle(...args),
        }),
      }),
    }),
  }),
}));

describe("GET /api/account/entitlements", () => {
  afterEach(() => {
    vi.resetModules();
    getUser.mockReset();
    maybeSingle.mockReset();
    isSupabaseConfigured.mockReset().mockReturnValue(true);
  });

  it("returns 503 when Supabase isn't configured, without ever calling auth", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/account/entitlements"));
    expect(res.status).toBe(503);
    expect(getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/account/entitlements"));
    expect(res.status).toBe(401);
  });

  it("returns 'free' for a signed-in user with no entitlement row", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/account/entitlements"));
    const body = await res.json();
    expect(body.tier).toBe("free");
    expect(body.features.scenario_lab).toBe(false);
  });

  it("CANNOT be bypassed by a client-supplied ?tier= query param — the DB lookup always wins", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null }); // real tier is 'free'
    const { GET } = await import("./route");
    // Attempt to self-elevate via a query param a naive implementation might read.
    const res = await GET(new NextRequest("http://localhost/api/account/entitlements?tier=professional"));
    const body = await res.json();
    expect(body.tier).toBe("free");
    expect(body.features.public_api_v1).toBe(false);
    expect(body.features.export_reports).toBe(false);
  });

  it("returns the real tier and correct feature set when a row exists", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    maybeSingle.mockResolvedValue({ data: { tier: "investor_pro" }, error: null });
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/account/entitlements"));
    const body = await res.json();
    expect(body.tier).toBe("investor_pro");
    expect(body.features.public_api_v1).toBe(true);
    expect(body.features.professional_only).toBeUndefined();
  });
});
