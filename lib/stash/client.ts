import { z } from "zod";
import { checkRateLimit } from "@/lib/security/rateLimiter";
import { getStashConfig, isStashEnabled, type StashConfig } from "./env";
import { StashError, kindForStatus } from "./errors";
import {
  stashLocalityListSchema,
  stashSuburbStatisticsSchema,
  stashSuburbTimeseriesSchema,
  stashSuburbDemographicsSchema,
  stashRecentSalesSchema,
  type StashLocality,
  type StashSuburbStatistics,
  type StashSuburbTimeseries,
  type StashSuburbDemographics,
  type StashRecentSales,
} from "./schemas";

export type StashClientOptions = {
  config: StashConfig;
  /** Injectable for tests — unit tests NEVER touch the network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Hard per-instance cap on total upstream requests (defence against runaway loops). */
  requestBudget?: number;
  /** Sliding-window rate limit applied per client key. */
  rateLimit?: { limit: number; windowMs: number; key?: string };
};

const DEFAULTS = {
  timeoutMs: 8000,
  maxRetries: 2,
  baseBackoffMs: 300,
  requestBudget: 50,
  rateLimit: { limit: 30, windowMs: 60_000 },
};

const RETRYABLE = new Set(["timeout", "rate_limited", "network_error", "upstream_error"]);

export class StashClient {
  private readonly config: StashConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseBackoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly requestBudget: number;
  private readonly rateLimit: { limit: number; windowMs: number; key: string };
  private requestsMade = 0;

  constructor(opts: StashClientOptions) {
    this.config = opts.config;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs;
    this.maxRetries = opts.maxRetries ?? DEFAULTS.maxRetries;
    this.baseBackoffMs = opts.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.requestBudget = opts.requestBudget ?? DEFAULTS.requestBudget;
    this.rateLimit = {
      limit: opts.rateLimit?.limit ?? DEFAULTS.rateLimit.limit,
      windowMs: opts.rateLimit?.windowMs ?? DEFAULTS.rateLimit.windowMs,
      key: opts.rateLimit?.key ?? "stash:global",
    };
  }

  /** Resolve candidate localities for a suburb query. */
  async suggestLocalities(query: { suburb: string; state?: string; postcode?: string }): Promise<StashLocality[]> {
    const params = new URLSearchParams({ suburb: query.suburb });
    if (query.state) params.set("state", query.state);
    if (query.postcode) params.set("postcode", query.postcode);
    return this.request(`/localities?${params.toString()}`, stashLocalityListSchema);
  }

  getSuburbStatistics(localityId: string): Promise<StashSuburbStatistics> {
    return this.request(`/localities/${encodeURIComponent(localityId)}/statistics`, stashSuburbStatisticsSchema);
  }

  getSuburbTimeseries(localityId: string, metric: string): Promise<StashSuburbTimeseries> {
    return this.request(
      `/localities/${encodeURIComponent(localityId)}/timeseries?metric=${encodeURIComponent(metric)}`,
      stashSuburbTimeseriesSchema
    );
  }

  getSuburbDemographics(localityId: string): Promise<StashSuburbDemographics> {
    return this.request(`/localities/${encodeURIComponent(localityId)}/demographics`, stashSuburbDemographicsSchema);
  }

  getRecentSales(localityId: string): Promise<StashRecentSales> {
    return this.request(`/localities/${encodeURIComponent(localityId)}/recent-sales`, stashRecentSalesSchema);
  }

  // ── internals ────────────────────────────────────────────────────────────

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (this.requestsMade >= this.requestBudget) {
      throw new StashError("budget_exceeded", "Stash request budget exhausted for this client instance");
    }
    const rl = checkRateLimit(this.rateLimit.key, this.rateLimit.limit, this.rateLimit.windowMs);
    if (!rl.allowed) {
      throw new StashError("rate_limited", "Local rate limit exceeded before calling Stash", {
        retryAfterMs: rl.retryAfterMs,
      });
    }

    let attempt = 0;
    let lastError: StashError | null = null;
    while (attempt <= this.maxRetries) {
      try {
        return await this.attempt(path, schema);
      } catch (err) {
        const e = err instanceof StashError ? err : new StashError("network_error", "Stash request failed");
        lastError = e;
        if (!RETRYABLE.has(e.kind) || attempt === this.maxRetries) throw e;
        const backoff = e.retryAfterMs ?? this.baseBackoffMs * 2 ** attempt;
        await this.sleep(backoff);
        attempt += 1;
      }
    }
    throw lastError ?? new StashError("network_error", "Stash request failed");
  }

  private async attempt<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    this.requestsMade += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
        method: "GET",
        headers: {
          // Credential lives only in this header, never logged or returned.
          Authorization: `Bearer ${this.config.apiKey}`,
          Accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new StashError("timeout", `Stash request timed out after ${this.timeoutMs}ms`);
      }
      throw new StashError("network_error", "Stash request network error");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const kind = kindForStatus(res.status);
      const retryAfterMs = res.status === 429 ? parseRetryAfter(res.headers.get("retry-after")) : undefined;
      // Do NOT include the upstream body — it could echo request detail.
      throw new StashError(kind, `Stash responded with HTTP ${res.status}`, { status: res.status, retryAfterMs });
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      throw new StashError("malformed_response", "Stash response was not valid JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new StashError("malformed_response", "Stash response failed schema validation");
    }
    return parsed.data;
  }
}

/** Milliseconds from a Retry-After header (seconds or HTTP-date); null → undefined. */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/**
 * Factory for live use. Returns null when the integration is disabled or
 * unconfigured — callers MUST treat null as "Stash unavailable" and fall back,
 * so a missing/never-approved Stash package degrades gracefully rather than
 * breaking the page. Never throws for the disabled case.
 */
export function createStashClient(overrides?: Partial<StashClientOptions>): StashClient | null {
  if (!isStashEnabled()) return null;
  const config = getStashConfig();
  if (!config) return null;
  return new StashClient({ config, ...overrides });
}
