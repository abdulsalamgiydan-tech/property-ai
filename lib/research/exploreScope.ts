import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";
import type { Jurisdiction } from "@/lib/warehouse/contracts";

/**
 * The jurisdictions the /research/explore browse actually supports. The market
 * warehouse only carries NSW and VIC mart data (see lib/warehouse/contracts.ts
 * `Jurisdiction`), and the Explore page/filter advertise exactly those two. The
 * underlying `search_market_geographies_v2` RPC, however, returns the ENTIRE
 * national core.dim_geography (incl. NT/QLD/etc.) when no jurisdiction is
 * passed — so an unfiltered Explore query would leak unsupported geographies.
 * Scoping the default query to this list keeps the results honest without
 * touching the RPC or globally restricting the public API (which may still be
 * queried nationally by other callers).
 */
export const SUPPORTED_EXPLORE_JURISDICTIONS = ["NSW", "VIC"] as const;

/**
 * Resolves which jurisdictions to query for an Explore request. An explicit,
 * supported state selection narrows to just that state; anything else
 * (including "no filter") falls back to the full supported set — never an
 * unbounded national query.
 */
export function resolveExploreJurisdictions(state?: string | null): Jurisdiction[] {
  if (state === "NSW" || state === "VIC") return [state];
  return [...SUPPORTED_EXPLORE_JURISDICTIONS];
}

/**
 * Merges per-jurisdiction result lists into a single stable, name-sorted view
 * capped at `limit` — the shape the Explore results list expects. Because only
 * supported-jurisdiction lists are ever passed in, the merged output can never
 * contain an unsupported geography.
 */
export function mergeExploreResults(
  lists: GeographySearchResultV2[][],
  limit = 50
): GeographySearchResultV2[] {
  return lists
    .flat()
    .sort((a, b) => a.geography_name.localeCompare(b.geography_name))
    .slice(0, limit);
}
