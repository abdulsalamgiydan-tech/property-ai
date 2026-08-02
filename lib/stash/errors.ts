/**
 * Structured, secret-safe error type for the Stash adapter. NEVER carries the
 * API key, Authorization header, raw upstream body, or any credential — only a
 * coarse `kind`, the HTTP status where relevant, and a short safe message. This
 * is the only error shape the adapter throws/returns, so nothing sensitive can
 * leak into logs or (via a route) the browser.
 */
export type StashErrorKind =
  | "disabled" // integration not enabled/configured — no call attempted
  | "unauthorized" // 401
  | "forbidden" // 403 (e.g. plan does not permit this data/use)
  | "not_found" // 404 (locality/metric not available)
  | "rate_limited" // 429
  | "budget_exceeded" // local request-budget guard tripped, no call made
  | "timeout" // request exceeded the configured timeout
  | "malformed_response" // upstream 2xx but body failed schema validation
  | "upstream_error" // other non-2xx
  | "network_error"; // fetch threw (DNS, connection reset, etc.)

export class StashError extends Error {
  readonly kind: StashErrorKind;
  readonly status?: number;
  /** Milliseconds to wait before retrying, when the upstream supplies Retry-After. */
  readonly retryAfterMs?: number;

  constructor(kind: StashErrorKind, message: string, opts?: { status?: number; retryAfterMs?: number }) {
    super(message);
    this.name = "StashError";
    this.kind = kind;
    this.status = opts?.status;
    this.retryAfterMs = opts?.retryAfterMs;
  }

  /** A safe, credential-free plain object suitable for structured logging. */
  toSafeObject(): { kind: StashErrorKind; status?: number; message: string } {
    return { kind: this.kind, status: this.status, message: this.message };
  }
}

/** Maps an HTTP status to the corresponding error kind. */
export function kindForStatus(status: number): StashErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return "upstream_error";
}
