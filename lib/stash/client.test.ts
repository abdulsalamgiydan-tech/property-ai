import { afterEach, describe, expect, it, vi } from "vitest";
import { StashClient } from "./client";
import { StashError } from "./errors";
import { _resetRateLimiterForTests } from "@/lib/security/rateLimiter";
import { calderwoodStashStatistics } from "./fixtures";
import type { StashConfig } from "./env";

const config: StashConfig = { baseUrl: "https://stash.example/api/v2/data", apiKey: "test-secret-key" };

function jsonResponse(body: unknown, init: Partial<{ status: number; headers: Record<string, string> }> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function client(fetchImpl: typeof fetch, overrides = {}) {
  return new StashClient({
    config,
    fetchImpl,
    sleep: () => Promise.resolve(), // deterministic: no real backoff waits
    rateLimit: { limit: 1000, windowMs: 60_000, key: `test:${Math.random()}` },
    ...overrides,
  });
}

afterEach(() => {
  _resetRateLimiterForTests();
  vi.restoreAllMocks();
});

describe("StashClient", () => {
  it("returns validated data on a well-formed 200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(calderwoodStashStatistics));
    const stats = await client(fetchImpl).getSuburbStatistics("loc-1");
    expect(stats.median_sale_price[0].value).toBe(905000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("never puts the API key in the URL and sends it only as a Bearer header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(calderwoodStashStatistics));
    await client(fetchImpl).getSuburbStatistics("loc-1");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain("test-secret-key");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-secret-key");
  });

  it("fails as malformed_response (not a crash) when the body fails schema validation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ locality_id: 1, median_sale_price: "not-an-array" }));
    await expect(client(fetchImpl).getSuburbStatistics("loc-1")).rejects.toMatchObject({ kind: "malformed_response" });
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
  ])("maps HTTP %i to %s and does not retry", async (status, kind) => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status }));
    await expect(client(fetchImpl).getSuburbStatistics("loc-1")).rejects.toMatchObject({ kind });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // non-retryable
  });

  it("retries a 429 respecting Retry-After, then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(jsonResponse(calderwoodStashStatistics));
    const stats = await client(fetchImpl).getSuburbStatistics("loc-1");
    expect(stats.locality_id).toBe("stash-loc-2527-calderwood");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up with rate_limited after exhausting retries on persistent 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, { status: 429 }));
    await expect(client(fetchImpl, { maxRetries: 2 }).getSuburbStatistics("loc-1")).rejects.toMatchObject({ kind: "rate_limited" });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("times out via AbortController and surfaces a timeout error", async () => {
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        (init.signal as AbortSignal).addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      })
    );
    await expect(client(fetchImpl, { timeoutMs: 5, maxRetries: 0 }).getSuburbStatistics("loc-1")).rejects.toMatchObject({ kind: "timeout" });
  });

  it("enforces a per-instance request budget", async () => {
    // Fresh Response per call — a Response body can only be read once.
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(calderwoodStashStatistics)));
    const c = client(fetchImpl, { requestBudget: 2 });
    await c.getSuburbStatistics("a");
    await c.getSuburbStatistics("b");
    await expect(c.getSuburbStatistics("c")).rejects.toMatchObject({ kind: "budget_exceeded" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces a network error safely (no secret in message)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNRESET test-secret-key"));
    try {
      await client(fetchImpl, { maxRetries: 0 }).getSuburbStatistics("loc-1");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(StashError);
      expect((e as StashError).message).not.toContain("test-secret-key");
      expect((e as StashError).toSafeObject()).not.toHaveProperty("apiKey");
    }
  });
});
