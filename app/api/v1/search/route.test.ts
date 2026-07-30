import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const searchGeographiesV2 = vi.fn(async () => []);

vi.mock("@/lib/warehouse/queries", () => ({
  searchGeographiesV2: (...args: unknown[]) => searchGeographiesV2(...args),
}));

function req(query: string) {
  return new NextRequest(`http://localhost/api/v1/search?${query}`);
}

describe("GET /api/v1/search — unrestricted-warehouse-query protection (Sprint 14 WS16)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    searchGeographiesV2.mockClear();
  });

  async function withApiV1Enabled() {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "some-key");
    return import("./route");
  }

  it("clamps an attempt to request 100,000 results down to the documented 100-row cap", async () => {
    const { GET } = await withApiV1Enabled();
    await GET(req("q=melbourne&limit=100000"));
    expect(searchGeographiesV2).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("clamps a negative/zero limit to the sane default of 20, not 0 (which some libraries treat as unlimited)", async () => {
    const { GET } = await withApiV1Enabled();
    await GET(req("q=melbourne&limit=0"));
    expect(searchGeographiesV2).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));

    searchGeographiesV2.mockClear();
    await GET(req("q=melbourne&limit=-5"));
    expect(searchGeographiesV2).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it("ignores a non-numeric limit rather than passing NaN through to the warehouse query", async () => {
    const { GET } = await withApiV1Enabled();
    await GET(req("q=melbourne&limit=drop-table"));
    expect(searchGeographiesV2).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
  });

  it("rejects unsupported jurisdiction filters before querying the warehouse", async () => {
    const { GET } = await withApiV1Enabled();
    const res = await GET(req("q=x&jurisdiction=QLD"));
    expect(res.status).toBe(400);
    expect(searchGeographiesV2).not.toHaveBeenCalled();
  });

  it("rejects unsupported geography type filters before querying the warehouse", async () => {
    const { GET } = await withApiV1Enabled();
    const res = await GET(req("q=x&type=LGA"));
    expect(res.status).toBe(400);
    expect(searchGeographiesV2).not.toHaveBeenCalled();
  });

  it("404s when the public API flag is off, before ever calling the warehouse", async () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", undefined as unknown as string);
    const { GET } = await import("./route");
    const res = await GET(req("q=melbourne&limit=100000"));
    expect(res.status).toBe(404);
    expect(searchGeographiesV2).not.toHaveBeenCalled();
  });
});
