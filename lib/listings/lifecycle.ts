/**
 * Listing lifecycle + retention rules (V7B). Pure, deterministic helpers.
 *
 * Staleness and purge exist so we honour provider retention terms (e.g. Domain's
 * delete-cached / don't-store guidance, Cotality's destroy-on-termination) — see
 * docs/decisions/V7B_listing_provider_decision.md.
 */
import type { CanonicalListing } from "./types";
import { TERMINAL_STATUSES } from "./types";

function daysBetween(aIso: string, bIso: string): number {
  return (new Date(bIso).getTime() - new Date(aIso).getTime()) / 86_400_000;
}

/** A listing is stale when its provider-confirmed data is older than `staleDays`. */
export function isStale(listing: CanonicalListing, now: string, staleDays: number): boolean {
  return daysBetween(listing.providerUpdatedAt, now) > staleDays;
}

/**
 * Purge rule: a canonical row must be dropped once it exceeds its licence
 * retentionDays since last seen, OR is terminal and older than `terminalKeepDays`.
 * Returns the retained store and the purged keys (for audit).
 */
export function purgeExpired(
  store: Map<string, CanonicalListing>,
  now: string,
  opts: { terminalKeepDays?: number } = {},
): { retained: Map<string, CanonicalListing>; purgedKeys: string[] } {
  const terminalKeepDays = opts.terminalKeepDays ?? 7;
  const retained = new Map<string, CanonicalListing>();
  const purgedKeys: string[] = [];
  for (const [key, l] of store) {
    const overRetention = daysBetween(l.lastSeenAt, now) > l.licence.retentionDays;
    const terminalExpired = TERMINAL_STATUSES.has(l.status) && daysBetween(l.lastSeenAt, now) > terminalKeepDays;
    if (overRetention || terminalExpired) {
      purgedKeys.push(key);
    } else {
      retained.set(key, l);
    }
  }
  purgedKeys.sort();
  return { retained, purgedKeys };
}

/**
 * Provider-directed purge (e.g. a takedown / licence termination): drop every row
 * for a provider. Required by provider licensing.
 */
export function purgeProvider(
  store: Map<string, CanonicalListing>,
  provider: string,
): { retained: Map<string, CanonicalListing>; purgedKeys: string[] } {
  const retained = new Map<string, CanonicalListing>();
  const purgedKeys: string[] = [];
  for (const [key, l] of store) {
    if (l.provider === provider) purgedKeys.push(key);
    else retained.set(key, l);
  }
  purgedKeys.sort();
  return { retained, purgedKeys };
}

/** Listings safe to display: on-market (incl. under-offer), redistributable, and not stale. */
export function isDisplayable(listing: CanonicalListing, now: string, staleDays: number): boolean {
  if (TERMINAL_STATUSES.has(listing.status)) return false; // sold/withdrawn/removed are never shown as live
  if (!listing.licence.redistributionOk) return false; // enrichment-only providers never display
  return !isStale(listing, now, staleDays);
}
