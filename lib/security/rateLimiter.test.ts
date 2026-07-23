import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetRateLimiterForTests, checkRateLimit } from "./rateLimiter";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimiterForTests();
    vi.useRealTimers();
  });

  it("allows requests up to the limit within a window", () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit("key-a", 5, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks the request that exceeds the limit", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-b", 5, 60_000);
    const sixth = checkRateLimit("key-b", 5, 60_000);
    expect(sixth.allowed).toBe(false);
    expect(sixth.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks separate keys independently — one caller's usage never blocks another's", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("key-c", 5, 60_000);
    const otherKey = checkRateLimit("key-d", 5, 60_000);
    expect(otherKey.allowed).toBe(true);
  });

  it("resets the count once the window has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    for (let i = 0; i < 5; i++) checkRateLimit("key-e", 5, 1000);
    expect(checkRateLimit("key-e", 5, 1000).allowed).toBe(false);

    vi.setSystemTime(1001);
    expect(checkRateLimit("key-e", 5, 1000).allowed).toBe(true);
    vi.useRealTimers();
  });

  it("reports decreasing remaining count as requests are used", () => {
    const first = checkRateLimit("key-f", 3, 60_000);
    const second = checkRateLimit("key-f", 3, 60_000);
    expect(first.remaining).toBe(2);
    expect(second.remaining).toBe(1);
  });
});
