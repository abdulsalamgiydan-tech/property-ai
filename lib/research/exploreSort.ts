/**
 * Client-side sort for Explore results (Sprint 14 WS3/WS4 — discovery
 * polish). Purely a display-order transform over data the warehouse
 * already returned; never re-queries, never filters anything out.
 */
import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";

export type ExploreSortOption = "data_first" | "name";

export const EXPLORE_SORT_OPTIONS: { id: ExploreSortOption; label: string }[] = [
  { id: "data_first", label: "Has market data first" },
  { id: "name", label: "Name (A-Z)" },
];

function hasSnapshot(r: GeographySearchResultV2): boolean {
  return r.has_suburb_snapshot || r.has_postcode_snapshot;
}

/**
 * "data_first" is a STABLE sort: within the "has data" group and within
 * the "no data" group, the warehouse's own original order is preserved
 * — this only regroups, it never re-orders within a group.
 */
export function sortExploreResults(
  results: GeographySearchResultV2[],
  sortBy: ExploreSortOption
): GeographySearchResultV2[] {
  if (sortBy === "name") {
    return [...results].sort((a, b) => a.geography_name.localeCompare(b.geography_name));
  }

  const withData: GeographySearchResultV2[] = [];
  const withoutData: GeographySearchResultV2[] = [];
  for (const r of results) {
    (hasSnapshot(r) ? withData : withoutData).push(r);
  }
  return [...withData, ...withoutData];
}
