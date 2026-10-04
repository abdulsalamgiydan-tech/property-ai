/**
 * Deal-feed assembly helpers (V7B). Pure functions (no I/O) so they are unit-testable
 * and reusable by the API route. The route supplies candidate evidence (from the
 * existing least-privilege RPC) and replay listings; these helpers shape them.
 */
import { MANDATORY_METRICS, type CandidateRow } from "@/lib/opportunity/types";
import type { CanonicalListing } from "@/lib/listings/types";
import { ReplayListingProvider } from "@/lib/listings/providers/replay";
import type { SuburbEvidence } from "./types";

/** Map candidate RPC rows → per-suburb market evidence keyed by geography_id. */
export function candidatesToEvidence(rows: CandidateRow[]): Record<string, SuburbEvidence> {
  const out: Record<string, SuburbEvidence> = {};
  for (const r of rows) {
    const ev: SuburbEvidence = {};
    for (const m of MANDATORY_METRICS) {
      const p = r.metrics?.[m];
      if (p) ev[m] = p;
    }
    out[r.geography_id] = ev;
  }
  return out;
}

/** Load the latest batch of labelled replay listings for a state, as canonical rows. */
export async function loadReplayListings(state: string, saleMode: "sale" | "rent" = "sale"): Promise<CanonicalListing[]> {
  const provider = new ReplayListingProvider();
  const raw = await provider.fetchRaw({ state, saleMode });
  return raw.map((r) => provider.toCanonical(r));
}
