/**
 * Sprint 12, Workstream 10 — shared, pure/testable logic for
 * refresh_engine_v3.mjs. Extracted into its own module (rather than inlined
 * in the orchestrator script, matching v2's structure) specifically so the
 * dependency-graph traversal and retry/backoff logic can be unit tested
 * without spawning a real orchestrator subprocess for every case.
 */

/**
 * Given a changed dataset_id, returns every dataset (including the
 * original) whose depends_on chain transitively includes it — "affected
 * downstream marts", per the mission's dependency-awareness requirement
 * (a geography change must invalidate dependent geography-derived marts;
 * a rate change must rebuild only affordability contexts that use it; a
 * rent change must rebuild rent/yield outputs but not unrelated supply
 * facts). Uses the registry's existing `depends_on` field — no new schema
 * needed, this graph already existed, it just wasn't being traversed.
 */
export function affectedDatasets(datasets, changedDatasetId) {
  const byId = new Map(datasets.map((d) => [d.dataset_id, d]));
  if (!byId.has(changedDatasetId)) throw new Error(`unknown dataset_id '${changedDatasetId}'`);
  const affected = new Set([changedDatasetId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of datasets) {
      if (affected.has(d.dataset_id)) continue;
      if ((d.depends_on ?? []).some((dep) => affected.has(dep))) {
        affected.add(d.dataset_id);
        grew = true;
      }
    }
  }
  return datasets.filter((d) => affected.has(d.dataset_id)).sort((a, b) => a.tier - b.tier);
}

/**
 * Retry an operation with bounded exponential backoff. Only retries
 * TRANSIENT-looking failures (network/timeout-shaped messages) — a
 * deterministic failure (e.g. a SQL syntax error, a missing file) will
 * fail identically on every retry, so retrying it 4 times just wastes 4x
 * the time before reporting the same error. `isRetryable` is injectable
 * for testing; defaults to a conservative pattern match.
 */
const DEFAULT_RETRYABLE_PATTERN = /ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|timeout|socket hang up/i;

export async function withRetry(fn, { maxAttempts = 3, baseDelayMs = 500, isRetryable = (err) => DEFAULT_RETRYABLE_PATTERN.test(String(err?.message ?? err)), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isRetryable(err)) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      onRetry?.(attempt, delay, err);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Maps a `category` filter onto the registry's existing field — no schema change needed, `category` already IS the domain concept. */
export function filterByDomain(datasets, domain) {
  if (!domain) return datasets;
  return datasets.filter((d) => d.category === domain);
}

export function filterByJurisdiction(datasets, jurisdiction) {
  if (!jurisdiction || jurisdiction === "ALL") return datasets;
  return datasets.filter((d) => d.jurisdiction === jurisdiction || d.jurisdiction === "ALL");
}
