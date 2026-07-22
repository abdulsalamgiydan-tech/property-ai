/**
 * Pure reordering logic for the comparison table's column order, kept
 * separate from CompareTable.tsx so it's testable without mounting a
 * component. The URL's ?ids= query param stays the source of truth for
 * order — see CompareTable's use of router.replace.
 */

/** Swap the item at `index` with its left (-1) or right (+1) neighbour, clamped to bounds. */
export function moveGeographyId(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= ids.length || index < 0 || index >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Sort rows to match a given id order, dropping any row whose id isn't in the order list. */
export function sortByIdOrder<T extends { geography_id: string }>(rows: T[], orderedIds: string[]): T[] {
  const byId = new Map(rows.map((r) => [r.geography_id, r]));
  return orderedIds.map((id) => byId.get(id)).filter((r): r is T => r !== undefined);
}
