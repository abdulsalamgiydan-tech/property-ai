import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const searchGeographiesV2 = vi.fn();
const getMarketSnapshotV2 = vi.fn();

vi.mock("@/lib/warehouse/queries", () => ({
  searchGeographiesV2: (...args: unknown[]) => searchGeographiesV2(...args),
  getMarketSnapshotV2: (...args: unknown[]) => getMarketSnapshotV2(...args),
}));

function req(query: string) {
  return new NextRequest(`http://localhost/api/analyse/suburb-suggestions?${query}`);
}

describe("GET /api/analyse/suburb-suggestions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    searchGeographiesV2.mockReset();
    getMarketSnapshotV2.mockReset();
  });

  it("returns 404 with feature_disabled when WAREHOUSE_PREVIEW_ENABLED is off", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", undefined as unknown as string);
    const { GET } = await import("./route");
    const res = await GET(req("suburb=Calderwood&state=NSW"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: "feature_disabled" });
  });

  it("returns state_not_covered for a jurisdiction outside NSW/VIC, without calling the warehouse", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    const { GET } = await import("./route");
    const res = await GET(req("suburb=Brisbane&state=QLD"));
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: "state_not_covered" });
    expect(searchGeographiesV2).not.toHaveBeenCalled();
  });

  it("returns no_match when the warehouse has no result for the suburb", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    searchGeographiesV2.mockResolvedValue([]);
    const { GET } = await import("./route");
    const res = await GET(req("suburb=Nowhereville&state=NSW"));
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: "no_match" });
  });

  it("never fabricates vacancy — always null even on a full match", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    searchGeographiesV2.mockResolvedValue([
      { geography_id: "g1", geography_code: "12345", geography_name: "Calderwood", geography_type: "SAL", jurisdiction: "NSW" },
    ]);
    getMarketSnapshotV2.mockResolvedValue({
      annual_price_change_pct: 3.5,
      annual_rent_change_pct: 2.1,
      median_sale_price_12m: 950000,
      median_weekly_rent_latest: 620,
    });
    const { GET } = await import("./route");
    const res = await GET(req("suburb=Calderwood&state=NSW"));
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.suggestions.vacancyPercent).toBeNull();
    expect(body.suggestions.suburbGrowthPercent).toBe(3.5);
    expect(body.suggestions.rentalGrowthPercent).toBe(2.1);
    expect(body.geographyId).toBe("g1");
  });

  it("returns insufficient_data when a geography matches but has no snapshot", async () => {
    vi.stubEnv("WAREHOUSE_PREVIEW_ENABLED", "true");
    searchGeographiesV2.mockResolvedValue([
      { geography_id: "g1", geography_code: "12345", geography_name: "Calderwood", geography_type: "SAL", jurisdiction: "NSW" },
    ]);
    getMarketSnapshotV2.mockResolvedValue(null);
    const { GET } = await import("./route");
    const res = await GET(req("suburb=Calderwood&state=NSW"));
    const body = await res.json();
    expect(body).toEqual({ available: false, reason: "insufficient_data" });
  });
});
