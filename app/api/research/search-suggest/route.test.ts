import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/warehouse/queries", () => ({
  searchGeographiesV2: vi.fn(async () => [
    { geography_id: "1", geography_type: "SAL", geography_code: "123", geography_name: "Testville", jurisdiction: "NSW", has_suburb_snapshot: true, has_postcode_snapshot: false },
  ]),
}));

describe("GET /api/research/search-suggest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("returns 404 when WAREHOUSE_PREVIEW_ENABLED is off, even if MULTI_STATE_RESEARCH_ENABLED is on", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "true");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/research/search-suggest?q=test"));
    expect(res.status).toBe(404);
  });

  it("returns 404 when MULTI_STATE_RESEARCH_ENABLED is off, even if WAREHOUSE_PREVIEW_ENABLED is on", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", undefined as unknown as string);
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/research/search-suggest?q=test"));
    expect(res.status).toBe(404);
  });

  it("returns results when both flags are on", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "true");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/research/search-suggest?q=test"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.results[0].geography_name).toBe("Testville");
  });

  it("rate-limits a caller that exceeds 60 requests/minute with 429 + Retry-After", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    vi.stubEnv("MULTI_STATE_RESEARCH_ENABLED", "true");
    const { GET } = await import("./route");
    let lastRes;
    for (let i = 0; i < 61; i++) {
      lastRes = await GET(new NextRequest("http://localhost/api/research/search-suggest?q=test"));
    }
    expect(lastRes!.status).toBe(429);
    expect(lastRes!.headers.get("Retry-After")).not.toBeNull();
  });
});
