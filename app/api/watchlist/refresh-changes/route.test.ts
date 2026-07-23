import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getMarketSnapshotV2 = vi.fn();

// Minimal chainable Supabase mock covering exactly the calls this route
// makes: .from("watchlist_items").select().eq().not(), .from(...).upsert(),
// .from("watchlist_items").update().eq().
function makeSupabaseMock(watchlistItems: unknown[]) {
  const upsertCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const limitCalls: unknown[] = [];

  const watchlistItemsQuery = {
    select: () => watchlistItemsQuery,
    eq: () => watchlistItemsQuery,
    not: () => watchlistItemsQuery,
    order: () => watchlistItemsQuery,
    limit: async (n: number) => {
      limitCalls.push(n);
      return { data: watchlistItems, error: null };
    },
  };

  return {
    auth: { getUser: (...args: unknown[]) => getUser(...args) },
    from: (table: string) => {
      if (table === "watchlist_items") {
        return {
          select: watchlistItemsQuery.select,
          update: (payload: unknown) => ({
            eq: async (_col: string, id: string) => {
              updateCalls.push({ payload, id });
              return { error: null };
            },
          }),
        };
      }
      if (table === "watchlist_change_events") {
        return {
          upsert: async (payload: unknown) => {
            upsertCalls.push(payload);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    _upsertCalls: upsertCalls,
    _updateCalls: updateCalls,
    _limitCalls: limitCalls,
  };
}

vi.mock("@/lib/supabase/env", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => true }));
vi.mock("@/lib/warehouse/queries", () => ({
  getMarketSnapshotV2: (...args: unknown[]) => getMarketSnapshotV2(...args),
}));

let mockSupabase: ReturnType<typeof makeSupabaseMock>;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => mockSupabase,
}));

describe("POST /api/watchlist/refresh-changes", () => {
  afterEach(() => {
    vi.resetModules();
    getUser.mockReset();
    getMarketSnapshotV2.mockReset();
  });

  it("returns 401 when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    mockSupabase = makeSupabaseMock([]);
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("checks each geography-linked item and generates events for a real change", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    const previousSnapshot = {
      latest_sales_period: "2026-06",
      latest_rent_period: null,
      latest_yield_period: null,
      latest_approvals_period: null,
      median_sale_price_12m: 1_000_000,
      median_weekly_rent_latest: null,
      gross_yield_pct: null,
      approvals_12m: null,
      sales_sample_confidence: "medium",
      rent_confidence: null,
      yield_confidence: null,
      supply_confidence: null,
    };
    mockSupabase = makeSupabaseMock([
      { id: "item-1", geography_id: "geo-1", last_known_snapshot_json: previousSnapshot },
    ]);
    getMarketSnapshotV2.mockResolvedValue({ ...previousSnapshot, median_sale_price_12m: 1_100_000 });

    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.itemsChecked).toBe(1);
    expect(body.eventsGenerated).toBeGreaterThanOrEqual(1);
    expect(mockSupabase._upsertCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockSupabase._updateCalls).toHaveLength(1);
  });

  it("generates no events on the first check (no prior snapshot) and just establishes the baseline", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSupabase = makeSupabaseMock([{ id: "item-1", geography_id: "geo-1", last_known_snapshot_json: null }]);
    getMarketSnapshotV2.mockResolvedValue({
      latest_sales_period: "2026-06",
      latest_rent_period: null,
      latest_yield_period: null,
      latest_approvals_period: null,
      median_sale_price_12m: 1_000_000,
      median_weekly_rent_latest: null,
      gross_yield_pct: null,
      approvals_12m: null,
      sales_sample_confidence: "medium",
      rent_confidence: null,
      yield_confidence: null,
      supply_confidence: null,
    });

    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();

    expect(body.eventsGenerated).toBe(0);
    expect(mockSupabase._updateCalls).toHaveLength(1); // baseline still gets recorded
  });

  it("skips items without a geography_id (free-text-only watchlist entries)", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSupabase = makeSupabaseMock([{ id: "item-1", geography_id: null, last_known_snapshot_json: null }]);

    const { POST } = await import("./route");
    const res = await POST();
    const body = await res.json();

    expect(body.itemsChecked).toBe(0);
    expect(getMarketSnapshotV2).not.toHaveBeenCalled();
  });

  it("bounds the per-call fan-out to protect the warehouse from a pathological watchlist size", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockSupabase = makeSupabaseMock([]);
    const { POST } = await import("./route");
    await POST();
    expect(mockSupabase._limitCalls).toEqual([50]);
  });
});
