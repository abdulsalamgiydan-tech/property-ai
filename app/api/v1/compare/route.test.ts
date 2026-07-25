import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const compareMarketGeographies = vi.fn(async (ids: string[]) => ids.map((id) => ({ geography_id: id })));

vi.mock("@/lib/warehouse/queries", () => ({
  compareMarketGeographies: (...args: [string[]]) => compareMarketGeographies(...args),
}));

function req(query: string) {
  return new NextRequest(`http://localhost/api/v1/compare?${query}`);
}

describe("GET /api/v1/compare — unrestricted-warehouse-query protection (Sprint 14 WS16)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    compareMarketGeographies.mockClear();
  });

  async function withApiV1Enabled() {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", "true");
    vi.stubEnv("WAREHOUSE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("WAREHOUSE_SUPABASE_ANON_KEY", "some-key");
    return import("./route");
  }

  it("returns 400 without ever querying the warehouse when 'ids' is missing", async () => {
    const { GET } = await withApiV1Enabled();
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect(compareMarketGeographies).not.toHaveBeenCalled();
  });

  it("rejects a single id (below the 2-geography minimum) without querying the warehouse", async () => {
    const { GET } = await withApiV1Enabled();
    const res = await GET(req("ids=SAL_1"));
    expect(res.status).toBe(400);
    expect(compareMarketGeographies).not.toHaveBeenCalled();
  });

  it("rejects an attempt to compare more than 10 geographies in one call — the real unrestricted-query risk", async () => {
    const { GET } = await withApiV1Enabled();
    const manyIds = Array.from({ length: 50 }, (_, i) => `SAL_${i}`).join(",");
    const res = await GET(req(`ids=${manyIds}`));
    expect(res.status).toBe(400);
    // Must reject BEFORE calling the warehouse — the bound is enforced at
    // the route, not left to the query function to silently truncate.
    expect(compareMarketGeographies).not.toHaveBeenCalled();
  });

  it("accepts exactly 10 geographies (the documented upper bound)", async () => {
    const { GET } = await withApiV1Enabled();
    const tenIds = Array.from({ length: 10 }, (_, i) => `SAL_${i}`).join(",");
    const res = await GET(req(`ids=${tenIds}`));
    expect(res.status).toBe(200);
    expect(compareMarketGeographies).toHaveBeenCalledWith(expect.arrayContaining(["SAL_0"]));
    const body = await res.json();
    expect(body.data.count).toBe(10);
  });

  it("404s (not 400) when the public API flag is off, before validating anything else", async () => {
    vi.stubEnv("PUBLIC_API_V1_ENABLED", undefined as unknown as string);
    const { GET } = await import("./route");
    const res = await GET(req("ids=a,b,c,d,e,f,g,h,i,j,k,l"));
    expect(res.status).toBe(404);
    expect(compareMarketGeographies).not.toHaveBeenCalled();
  });
});
