import { describe, expect, it, beforeEach } from "vitest";
import { addRecentSearch, clearRecentSearches, getRecentSearches, type RecentSearchEntry } from "./recentSearches";

function entry(id: string): RecentSearchEntry {
  return {
    geography_id: id,
    geography_code: id,
    geography_name: `Suburb ${id}`,
    geography_type: "SAL",
    jurisdiction: "NSW",
  };
}

describe("recentSearches (in-memory fallback, no window/localStorage in this test environment)", () => {
  beforeEach(() => {
    clearRecentSearches();
  });

  it("starts empty", () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it("adds an entry and returns it most-recent-first", () => {
    addRecentSearch(entry("1"));
    addRecentSearch(entry("2"));
    const all = getRecentSearches();
    expect(all.map((e) => e.geography_id)).toEqual(["2", "1"]);
  });

  it("dedupes by geography_id, moving the re-selected entry to the front", () => {
    addRecentSearch(entry("1"));
    addRecentSearch(entry("2"));
    addRecentSearch(entry("1"));
    const all = getRecentSearches();
    expect(all.map((e) => e.geography_id)).toEqual(["1", "2"]);
    expect(all).toHaveLength(2);
  });

  it("caps at 5 entries, dropping the oldest", () => {
    for (const id of ["1", "2", "3", "4", "5", "6"]) {
      addRecentSearch(entry(id));
    }
    const all = getRecentSearches();
    expect(all).toHaveLength(5);
    expect(all.map((e) => e.geography_id)).toEqual(["6", "5", "4", "3", "2"]);
  });

  it("clears all entries", () => {
    addRecentSearch(entry("1"));
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });
});
