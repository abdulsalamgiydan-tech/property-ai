import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockClient: unknown = null;
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mockClient }));

import { GET, POST, DELETE } from "./route";

function client(opts: { user: { id: string } | null; result?: { data: unknown[] | null; error: { code?: string; message: string } | null } }) {
  const result = opts.result ?? { data: [], error: null };
  const t: Record<string, unknown> = {};
  Object.assign(t, {
    select: () => t, order: () => t, eq: () => t, upsert: () => t, delete: () => t, insert: () => t,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
  });
  return { auth: { getUser: async () => ({ data: { user: opts.user } }) }, from: () => t };
}

const url = "http://localhost/api/dealhunter/pipeline";
afterEach(() => { mockClient = null; vi.restoreAllMocks(); });

describe("pipeline route — auth + fail-closed", () => {
  it("GET unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    expect((await GET()).status).toBe(401);
  });

  it("POST rejecting without a reason → 400 (validation)", async () => {
    mockClient = client({ user: { id: "A" } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "rejected" }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("POST rejecting WITH a reason → 200 {ok,id}", async () => {
    mockClient = client({ user: { id: "A" }, result: { data: [{ id: "p1" }], error: null } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "rejected", rejection_reason: "too_expensive" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id: "p1" });
  });

  it("POST surfaces the DB rejected-needs-reason check (23514) as 400", async () => {
    mockClient = client({ user: { id: "A" }, result: { data: null, error: { code: "23514", message: "check" } } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "reviewing" }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("DELETE affecting ZERO rows → 404 (never {ok:true})", async () => {
    mockClient = client({ user: { id: "A" }, result: { data: [], error: null } });
    const req = new NextRequest(`${url}?listing_key=replay:RPL-0001`, { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBeUndefined();
  });
});
