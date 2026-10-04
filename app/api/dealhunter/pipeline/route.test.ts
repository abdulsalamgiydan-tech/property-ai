import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let gate: unknown = null;
vi.mock("@/lib/auth/foundingBetaAccess", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    requireFoundingBetaAccess: async () => gate,
    foundingBetaDeniedResponse: (access: { status: number; body: unknown }) => NextResponse.json(access.body, { status: access.status }),
  };
});

import { GET, POST, DELETE } from "./route";

function client(opts: {
  user: { id: string } | null;
  result?: { data: unknown[] | null; error: { code?: string; message: string } | null };
  onEq?: (column: string, value: string) => void;
}) {
  const result = opts.result ?? { data: [], error: null };
  const t: Record<string, unknown> = {};
  Object.assign(t, {
    select: () => t,
    order: () => t,
    eq: (column: string, value: string) => {
      opts.onEq?.(column, value);
      return t;
    },
    upsert: () => t,
    delete: () => t,
    insert: () => t,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
  });
  return { auth: { getUser: async () => ({ data: { user: opts.user } }) }, from: () => t };
}

const url = "http://localhost/api/dealhunter/pipeline";
function allow(opts: Parameters<typeof client>[0]) {
  gate = { ok: true, supabase: client(opts), user: opts.user };
}

afterEach(() => { gate = null; vi.restoreAllMocks(); });

describe("pipeline route — auth + fail-closed", () => {
  it("GET unauthenticated → 401", async () => {
    gate = { ok: false, status: 401, body: { error: "unauthenticated" } };
    expect((await GET()).status).toBe(401);
  });

  it("POST rejecting without a reason → 400 (validation)", async () => {
    allow({ user: { id: "A" } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "rejected" }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("POST rejecting WITH a reason → 200 {ok,id}", async () => {
    allow({ user: { id: "A" }, result: { data: [{ id: "p1" }], error: null } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "rejected", rejection_reason: "too_expensive" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, id: "p1" });
  });

  it("POST surfaces the DB rejected-needs-reason check (23514) as 400", async () => {
    allow({ user: { id: "A" }, result: { data: null, error: { code: "23514", message: "check" } } });
    const req = new NextRequest(url, { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "reviewing" }) });
    expect((await POST(req)).status).toBe(400);
  });

  it("DELETE affecting ZERO rows → 404 (never {ok:true})", async () => {
    allow({ user: { id: "A" }, result: { data: [], error: null } });
    const req = new NextRequest(`${url}?listing_key=replay:RPL-0001`, { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    expect((await res.json()).ok).toBeUndefined();
  });

  it("DELETE constrains the query by the authenticated user id before RLS also applies", async () => {
    const filters: Record<string, string> = {};
    allow({
      user: { id: "A" },
      result: { data: [], error: null },
      onEq: (column, value) => {
        filters[column] = value;
      },
    });
    const req = new NextRequest(`${url}?listing_key=replay:RPL-0001`, { method: "DELETE" });
    await DELETE(req);
    expect(filters).toMatchObject({ listing_key: "replay:RPL-0001", user_id: "A" });
  });

  it("DELETE cross-user attempt remains a 404 and never reports success", async () => {
    allow({ user: { id: "A" }, result: { data: [], error: null } });
    const req = new NextRequest(`${url}?listing_key=replay:owned-by-B`, { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not found" });
  });

  it("GET database errors return a generic server error without schema details", async () => {
    allow({ user: { id: "A" }, result: { data: null, error: { message: "relation public.deal_pipeline_items missing column secret_token" } } });
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server error" });
  });
});
