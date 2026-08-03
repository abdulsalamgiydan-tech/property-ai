import { afterEach, describe, expect, it, vi } from "vitest";

// Mockable warehouse client — the query function must call the RPC through it.
const rpc = vi.fn();
let clientValue: { rpc: typeof rpc } | null = { rpc };
vi.mock("./client", () => ({
  createWarehouseClient: () => clientValue,
}));

import { getOfficialSuburbMetricsV1 } from "./queries";

describe("getOfficialSuburbMetricsV1 — official metrics consumer query", () => {
  afterEach(() => {
    rpc.mockReset();
    clientValue = { rpc };
  });

  it("calls the SECURITY DEFINER RPC with the geography id and returns typed rows", async () => {
    rpc.mockResolvedValue({
      data: [
        { geography_id: "SAL_40085_ASGS3_2021", metric: "median_house_price", property_type: "house", bedroom_group: "all", value: 940000, unit: "AUD", sample_size: 32, period_start: "2026-04-01", period_end: "2026-06-30", status: "direct", is_derived: false, derived_from: null, source_id: "sa_metro_median_house_sales", attribution: "© Government of South Australia (CC BY 4.0)", retrieved_at: "2026-08-02T00:00:00Z" },
        { geography_id: "SAL_40085_ASGS3_2021", metric: "gross_yield", property_type: "house", bedroom_group: "all", value: 3.32, unit: "%", sample_size: null, period_start: null, period_end: "2026-06-30", status: "derived", is_derived: true, derived_from: "gross_yield@2", source_id: "derived", attribution: "© Government of South Australia (CC BY 4.0)", retrieved_at: "2026-08-02T00:00:00Z" },
      ],
      error: null,
    });
    const rows = await getOfficialSuburbMetricsV1("SAL_40085_ASGS3_2021");
    expect(rpc).toHaveBeenCalledWith("get_official_suburb_metrics_v1", { p_geography_id: "SAL_40085_ASGS3_2021" });
    expect(rows).toHaveLength(2);
    const derived = rows.find((r) => r.metric === "gross_yield")!;
    expect(derived.is_derived).toBe(true);
    expect(derived.derived_from).toBe("gross_yield@2");
    expect(derived.retrieved_at).toBeTruthy(); // freshness surfaced
  });

  it("returns [] (never throws) when the RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await getOfficialSuburbMetricsV1("SAL_40085_ASGS3_2021")).toEqual([]);
  });

  it("returns [] when the warehouse client is not configured", async () => {
    clientValue = null;
    expect(await getOfficialSuburbMetricsV1("SAL_40085_ASGS3_2021")).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
