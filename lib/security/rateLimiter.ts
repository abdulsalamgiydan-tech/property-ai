/**
 * Best-effort, single-instance, in-memory sliding-window rate limiter
 * (Sprint 13 WS13). Explicitly NOT a distributed limiter — Vercel
 * serverless functions are stateless across cold starts and concurrent
 * instances, so this only bounds abuse within one warm instance's
 * lifetime. That is a real, known limitation, not an oversight: a
 * proper distributed limiter (e.g. Upstash Redis) is new paid
 * infrastructure and requires explicit approval per this project's
 * guardrails, so it isn't introduced here. This is "prepare a rate
 * limiting strategy," not "ship a production-grade one" — see
 * warehouse/reports/sprint13_phase2_security_report.md for the full
 * strategy writeup.
 */

type Bucket = { count: number; windowStartMs: number };

const buckets = new Map<string, Bucket>();

// Periodically drop old buckets so this map can't grow unbounded across
// a long-lived warm instance.
const MAX_TRACKED_KEYS = 10_000;

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStartMs >= windowMs) {
    buckets.set(key, { count: 1, windowStartMs: now });
    if (buckets.size > MAX_TRACKED_KEYS) {
      // Cheap eviction: drop the oldest-inserted entry (Map preserves
      // insertion order). Good enough for a best-effort limiter.
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: windowMs - (now - existing.windowStartMs) };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterMs: 0 };
}

/** Test-only: clears all tracked buckets so tests don't leak state into each other. */
export function _resetRateLimiterForTests(): void {
  buckets.clear();
}
