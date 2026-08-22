import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

type Access =
  | { ok: true; supabase: ReturnType<typeof client>; user: { id: string; email: string } }
  | { ok: false; status: 401 | 403 | 404; body: { error: string } };

let access: Access;

vi.mock("@/lib/auth/foundingBetaAccess", () => ({
  requireFoundingBetaAccess: async () => access,
  foundingBetaDeniedResponse: (a: Extract<Access, { ok: false }>) => NextResponse.json(a.body, { status: a.status }),
}));
vi.mock("@/lib/opportunity/candidates", () => ({ fetchCandidateRows: async () => [] }));

import * as deals from "./deals/route";
import * as feedback from "./feedback/route";
import * as pipeline from "./pipeline/route";

function client() {
  const pipelineTable: Record<string, unknown> = {
    select: () => pipelineTable,
    order: () => Promise.resolve({ data: [], error: null }),
    upsert: () => ({ select: () => Promise.resolve({ data: [{ id: "pipeline-1" }], error: null }) }),
    delete: () => pipelineTable,
    eq: () => pipelineTable,
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: [{ id: "pipeline-1" }], error: null }).then(res, rej),
  };
  const feedbackTable = {
    insert: () => Promise.resolve({ error: null }),
    select: () => Promise.resolve({ data: [], error: null }),
  };
  const profileTable = {
    select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }),
  };
  return {
    from: (name: string) => {
      if (name === "deal_pipeline_items") return pipelineTable;
      if (name === "deal_listing_feedback") return feedbackTable;
      return profileTable;
    },
  };
}

const deniedCases = [
  { label: "warehouse Preview off", status: 404 as const, body: { error: "not found" } },
  { label: "signed out", status: 401 as const, body: { error: "unauthenticated" } },
  { label: "authenticated but not invited", status: 403 as const, body: { error: "not in founding beta" } },
];

const routeCalls = [
  { label: "deals GET", call: () => deals.GET() },
  { label: "pipeline GET", call: () => pipeline.GET() },
  { label: "pipeline POST", call: () => pipeline.POST(new NextRequest("http://localhost/api/dealhunter/pipeline", { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", status: "reviewing" }) })) },
  { label: "pipeline DELETE", call: () => pipeline.DELETE(new NextRequest("http://localhost/api/dealhunter/pipeline?listing_key=replay:RPL-0001", { method: "DELETE" })) },
  { label: "feedback GET", call: () => feedback.GET() },
  { label: "feedback POST", call: () => feedback.POST(new NextRequest("http://localhost/api/dealhunter/feedback", { method: "POST", body: JSON.stringify({ listing_key: "replay:RPL-0001", kind: "saved" }) })) },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Deal Hunter API founding-beta access", () => {
  for (const denied of deniedCases) {
    for (const route of routeCalls) {
      it(`${route.label} denies direct API access when ${denied.label}`, async () => {
        access = { ok: false, status: denied.status, body: denied.body };
        expect((await route.call()).status).toBe(denied.status);
      });
    }
  }

  it("allows an invited user through every Deal Hunter API method", async () => {
    access = { ok: true, supabase: client(), user: { id: "user-1", email: "invited@example.com" } };
    const results = await Promise.all(routeCalls.map((route) => route.call()));
    expect(results.map((res) => res.status)).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it("does not expose raw database details from Deal Hunter APIs", async () => {
    const leakingClient = {
      from: () => ({
        select: () => ({
          order: () => Promise.resolve({ data: null, error: { message: "relation public.secret_table column access_token failed" } }),
        }),
      }),
    };
    access = { ok: true, supabase: leakingClient as ReturnType<typeof client>, user: { id: "user-1", email: "invited@example.com" } };
    const res = await pipeline.GET();
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).toBe(JSON.stringify({ error: "server error" }));
    expect(JSON.stringify(body)).not.toMatch(/relation|column|access_token|secret_table/i);
  });
});
