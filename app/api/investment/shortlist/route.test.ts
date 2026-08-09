import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let mockClient: unknown = null;
vi.mock("@/lib/warehouse/env", () => ({ isWarehousePreviewEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => mockClient }));

import { DELETE, POST, GET } from "./route";

type DeleteResult = { data: unknown[] | null; error: { code?: string; message: string } | null };

function client(opts: { user: { id: string } | null; deleteResult?: DeleteResult; upsertError?: { code?: string; message: string } | null }) {
  return {
    auth: { getUser: async () => ({ data: { user: opts.user } }) },
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
      upsert: async () => ({ error: opts.upsertError ?? null }),
      delete: () => ({ eq: () => ({ select: async () => opts.deleteResult ?? { data: [], error: null } }) }),
    }),
  };
}

afterEach(() => { mockClient = null; vi.restoreAllMocks(); });

describe("shortlist route — auth + fail-closed", () => {
  it("GET unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    expect((await GET()).status).toBe(401);
  });

  it("POST unauthenticated → 401", async () => {
    mockClient = client({ user: null });
    const req = new NextRequest("http://localhost/api/investment/shortlist", { method: "POST", body: JSON.stringify({ geography_id: "SAL_40530_ASGS3_2021" }) });
    expect((await POST(req)).status).toBe(401);
  });

  it("POST rejects a foreign profile_id (FK 23503) with 403, no leak", async () => {
    mockClient = client({ user: { id: "A" }, upsertError: { code: "23503", message: "fk" } });
    const req = new NextRequest("http://localhost/api/investment/shortlist", { method: "POST", body: JSON.stringify({ geography_id: "SAL_40530_ASGS3_2021", profile_id: "11111111-1111-4111-8111-111111111111" }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
    expect((await res.json()).error).not.toContain("11111111"); // no ownership detail leaked
  });

  it("DELETE affecting ZERO rows → 404 (never {ok:true})", async () => {
    mockClient = client({ user: { id: "A" }, deleteResult: { data: [], error: null } });
    const req = new NextRequest("http://localhost/api/investment/shortlist?geography_id=SAL_40530_ASGS3_2021", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBeUndefined();
  });

  it("DELETE affecting a real row → 200 {ok, deleted}", async () => {
    mockClient = client({ user: { id: "A" }, deleteResult: { data: [{ id: "s1" }], error: null } });
    const req = new NextRequest("http://localhost/api/investment/shortlist?geography_id=SAL_40530_ASGS3_2021", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ ok: true, deleted: 1 });
  });
});
