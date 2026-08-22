/**
 * Listing events (V7B, part F). Deterministically turns ingestion-level listing
 * changes + buy-box membership + score movement into per-user Deal Hunter events.
 *
 * These are LISTING events (property-level) and are kept distinct from V7A's
 * suburb change alerts (migration 062) — different data model, different table
 * (draft migration 063). We do not overload the suburb-change table.
 */
import type { ListingChange } from "@/lib/listings/canonicalize";

export type DealEventKind =
  | "new_match"
  | "price_changed"
  | "under_offer"
  | "removed"
  | "score_threshold"
  | "evidence_stale";

export interface DealEvent {
  key: string; // listing key
  kind: DealEventKind;
  detail: string;
  at: string;
}

export interface DealEventContext {
  /** Listing keys that currently match the user's buy box (ranked or needs-review). */
  matchedKeys: Set<string>;
  /** Current deal scores by listing key (for threshold crossing). */
  scores?: Map<string, number>;
  /** Previous deal scores by listing key. */
  priorScores?: Map<string, number>;
  /** Score threshold the user configured (e.g. 70). */
  scoreThreshold?: number;
  /** Matched listing keys whose material evidence just became stale/missing. */
  staleKeys?: Set<string>;
}

const money = (n: number | null | undefined) => (n == null ? "price on application" : `A$${Math.round(n).toLocaleString("en-AU")}`);

/**
 * Produce the events a user should see. Only listings in their buy box generate
 * events (no noise from non-matches). Deterministic ordering by key then kind.
 */
export function deriveListingEvents(changes: ListingChange[], ctx: DealEventContext): DealEvent[] {
  const out: DealEvent[] = [];
  const matched = ctx.matchedKeys;

  for (const c of changes) {
    if (!matched.has(c.key)) continue; // only buy-box members
    if (c.kind === "new" || c.kind === "relisting") {
      out.push({ key: c.key, kind: "new_match", detail: c.kind === "relisting" ? "A previously-listed match is back on the market." : "A new listing entered your buy box.", at: c.at });
    } else if (c.kind === "price_changed") {
      const from = c.from?.priceLowerBound ?? null;
      const to = c.to?.priceLowerBound ?? null;
      const dir = from != null && to != null ? (to < from ? "reduced" : "increased") : "changed";
      out.push({ key: c.key, kind: "price_changed", detail: `Advertised price ${dir} (${money(from)} → ${money(to)}).`, at: c.at });
    } else if (c.kind === "status_changed" && c.to?.status === "under_offer") {
      out.push({ key: c.key, kind: "under_offer", detail: "A match is now under offer — act quickly or move on.", at: c.at });
    } else if (c.kind === "removed" || (c.kind === "status_changed" && (c.to?.status === "withdrawn" || c.to?.status === "removed"))) {
      out.push({ key: c.key, kind: "removed", detail: "A match was withdrawn or removed from the market.", at: c.at });
    }
  }

  // Score threshold crossing (upward) for matched listings.
  if (ctx.scores && ctx.priorScores && ctx.scoreThreshold != null) {
    for (const [key, score] of ctx.scores) {
      if (!matched.has(key)) continue;
      const prior = ctx.priorScores.get(key);
      if (prior != null && prior < ctx.scoreThreshold && score >= ctx.scoreThreshold) {
        out.push({ key, kind: "score_threshold", detail: `Deal score rose past ${ctx.scoreThreshold} (now ${score}).`, at: new Date(0).toISOString() });
      }
    }
  }

  // Evidence going stale on a matched listing (trust signal — always surfaced).
  if (ctx.staleKeys) {
    for (const key of ctx.staleKeys) {
      if (matched.has(key)) out.push({ key, kind: "evidence_stale", detail: "Material evidence for this match became stale or unavailable — confidence lowered.", at: new Date(0).toISOString() });
    }
  }

  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
  return out;
}
