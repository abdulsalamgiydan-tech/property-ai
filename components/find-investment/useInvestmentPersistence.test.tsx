// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInvestmentPersistence } from "./useInvestmentPersistence";

type Call = { url: string; method: string; body?: string };

function installFetch(): Call[] {
  const calls: Call[] = [];
  global.fetch = vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
    const u = String(url);
    const method = opts?.method ?? "GET";
    calls.push({ url: u, method, body: opts?.body as string | undefined });
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body } as Response);
    if (u.includes("/api/investment/profile") && method === "GET") return json({ profiles: [{ id: "p1", name: "Saved", inputs: {}, updated_at: "2026-01-01" }] });
    if (u.includes("/api/investment/shortlist") && method === "GET") return json({ items: [{ geography_id: "SAL_40530_ASGS3_2021" }] });
    if (u.includes("/api/investment/profile") && method === "POST") return json({ ok: true, id: "new-id" });
    if (u.includes("/api/investment/shortlist") && method === "POST") return json({ ok: true });
    if (u.includes("/api/investment/shortlist") && method === "DELETE") return json({ ok: true, deleted: 1 });
    return json({}, 200);
  }) as typeof fetch;
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("useInvestmentPersistence — the UI persistence layer calls the real APIs", () => {
  it("rehydrates profiles + shortlist from the server on mount (survives reload)", async () => {
    const calls = installFetch();
    const { result } = renderHook(() => useInvestmentPersistence(true));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(calls.some((c) => c.url.includes("/api/investment/profile") && c.method === "GET")).toBe(true);
    expect(calls.some((c) => c.url.includes("/api/investment/shortlist") && c.method === "GET")).toBe(true);
    expect(result.current.profiles).toHaveLength(1);
    expect(result.current.shortlist.has("SAL_40530_ASGS3_2021")).toBe(true);
  });

  it("signed-out hydrates empty and makes no API calls", async () => {
    const calls = installFetch();
    const { result } = renderHook(() => useInvestmentPersistence(false));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(calls).toHaveLength(0);
    expect(result.current.shortlist.size).toBe(0);
  });

  it("addShortlist POSTs to the shortlist API and updates state", async () => {
    const calls = installFetch();
    const { result } = renderHook(() => useInvestmentPersistence(true));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => { await result.current.addShortlist("SAL_40026_ASGS3_2021"); });
    expect(calls.some((c) => c.url.includes("/api/investment/shortlist") && c.method === "POST")).toBe(true);
    expect(result.current.shortlist.has("SAL_40026_ASGS3_2021")).toBe(true);
  });

  it("removeShortlist DELETEs and updates state", async () => {
    const calls = installFetch();
    const { result } = renderHook(() => useInvestmentPersistence(true));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    await act(async () => { await result.current.removeShortlist("SAL_40530_ASGS3_2021"); });
    expect(calls.some((c) => c.url.includes("geography_id=SAL_40530_ASGS3_2021") && c.method === "DELETE")).toBe(true);
    expect(result.current.shortlist.has("SAL_40530_ASGS3_2021")).toBe(false);
  });

  it("saveProfile POSTs and returns the created id", async () => {
    installFetch();
    const { result } = renderHook(() => useInvestmentPersistence(true));
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let id: string | null = null;
    await act(async () => {
      id = await result.current.saveProfile("My plan", {
        maxPrice: 900000, deposit: 250000, strategy: "growth", acceptableWeeklyHoldingCost: 400,
        propertyType: "house", states: ["SA"], riskTolerance: "medium", holdingPeriodYears: 10,
      });
    });
    expect(id).toBe("new-id");
  });
});
