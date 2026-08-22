import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockClient: unknown = null;
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mockClient }));

import { GET, POST, PATCH } from "./route";

/** A chainable, thenable Supabase query stub whose terminal resolves to `result`. */
function client(opts: {
  user: { id: string } | null;
  result?: { data: unknown[] | null; error: { message: string } | null };
  rpc?: { data: unknown; error: { message: string } | null };
}) {
  const result = opts.result ?? { data: [], error: null };
  const t: Record<string, unknown> = {};
  Object.assign(t, {
    select: () => t,
    order: () => t,
    is: () => t,
    in: () => t,
    update: () => t,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
  });
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => t,
    rpc: async () => opts.rpc ?? { data: 0, error: null },
  };
}

const url = "http://localhost/api/investment/changes";
afterEach(() => { mockClient = null; vi.restoreAllMocks(); });

describe("changes route — auth + fail-closed", () => {
  it("GET unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    expect((await GET(new NextRequest(url))).status).toBe(401);
  });

  it("POST (detect) unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    expect((await POST()).status).toBe(401);
  });

  it("PATCH unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ all: true }) });
    expect((await PATCH(req)).status).toBe(401);
  });

  it("PATCH with an invalid body → 400", async () => {
    mockClient = client({ user: { id: "A" } });
    const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ nope: 1 }) });
    expect((await PATCH(req)).status).toBe(400);
  });

  it("PATCH marking ZERO rows seen → 404 (never {ok:true})", async () => {
    mockClient = client({ user: { id: "A" }, result: { data: [], error: null } });
    const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ all: true }) });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("PATCH marking real rows seen → 200 {ok, updated}", async () => {
    mockClient = client({ user: { id: "A" }, result: { data: [{ id: "e1" }, { id: "e2" }], error: null } });
    const req = new NextRequest(url, { method: "PATCH", body: JSON.stringify({ all: true }) });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, updated: 2 });
  });

  it("POST returns the detector's insert count", async () => {
    mockClient = client({ user: { id: "A" }, rpc: { data: 3, error: null } });
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, detected: 3 });
  });
});

describe("changes route — provenance-mapped messages", () => {
  it("GET renders a sourced, plain-English message from the stored row", async () => {
    mockClient = client({
      user: { id: "A" },
      result: {
        data: [
          {
            id: "e1",
            geography_id: "SAL40001",
            metric: "price_growth_12m",
            property_type: "house",
            direction: "up",
            old_value: 4.2,
            new_value: 6.1,
            old_period_end: "2025-03-31",
            new_period_end: "2025-06-30",
            unit: "%",
            source_id: "SA-VG",
            attribution: "Government of SA",
            detected_at: "2025-07-01T00:00:00Z",
            seen_at: null,
          },
        ],
        error: null,
      },
    });
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].message).toContain("12-month price growth rose from 4.20% to 6.10%");
    expect(body.items[0].message).toContain("Source: Government of SA.");
    expect(body.items[0].message.toLowerCase()).not.toMatch(/recommend|should|forecast/);
  });
});
