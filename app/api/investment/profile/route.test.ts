import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockClient: unknown = null;
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mockClient }));

import { DELETE, PATCH, POST } from "./route";

const VALID_INPUTS = {
  maxPrice: 900000, deposit: 250000, strategy: "growth", acceptableWeeklyHoldingCost: 400,
  propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
};

function client(opts: {
  user: { id: string } | null;
  insertResult?: { data: { id: string } | null; error: { message: string } | null };
  changedRows?: unknown[];
}) {
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => opts.insertResult ?? { data: { id: "new-id" }, error: null } }) }),
      update: () => ({ eq: () => ({ select: async () => ({ data: opts.changedRows ?? [], error: null }) }) }),
      delete: () => ({ eq: () => ({ select: async () => ({ data: opts.changedRows ?? [], error: null }) }) }),
    }),
  };
}

afterEach(() => { mockClient = null; vi.restoreAllMocks(); });

describe("profile route — CRUD + fail-closed", () => {
  it("POST unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    const req = new NextRequest("http://localhost/api/investment/profile", { method: "POST", body: JSON.stringify({ name: "x", inputs: VALID_INPUTS }) });
    expect((await POST(req)).status).toBe(401);
  });

  it("POST returns the created profile id", async () => {
    mockClient = client({ user: { id: "A" }, insertResult: { data: { id: "abc-123" }, error: null } });
    const req = new NextRequest("http://localhost/api/investment/profile", { method: "POST", body: JSON.stringify({ name: "My plan", inputs: VALID_INPUTS }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, id: "abc-123" });
  });

  it("PATCH affecting ZERO rows → 404 (not owner / missing)", async () => {
    mockClient = client({ user: { id: "A" }, changedRows: [] });
    const req = new NextRequest("http://localhost/api/investment/profile", { method: "PATCH", body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", name: "renamed" }) });
    expect((await PATCH(req)).status).toBe(404);
  });

  it("PATCH changing a real row → 200", async () => {
    mockClient = client({ user: { id: "A" }, changedRows: [{ id: "11111111-1111-4111-8111-111111111111" }] });
    const req = new NextRequest("http://localhost/api/investment/profile", { method: "PATCH", body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", name: "renamed" }) });
    expect((await PATCH(req)).status).toBe(200);
  });

  it("DELETE affecting ZERO rows → 404", async () => {
    mockClient = client({ user: { id: "A" }, changedRows: [] });
    const req = new NextRequest("http://localhost/api/investment/profile?id=11111111-1111-4111-8111-111111111111", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("DELETE removing a real row → 200 {ok, deleted}", async () => {
    mockClient = client({ user: { id: "A" }, changedRows: [{ id: "11111111-1111-4111-8111-111111111111" }] });
    const req = new NextRequest("http://localhost/api/investment/profile?id=11111111-1111-4111-8111-111111111111", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, deleted: 1 });
  });
});
