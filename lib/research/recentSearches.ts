export type RecentSearchEntry = {
  geography_id: string;
  geography_code: string;
  geography_name: string;
  geography_type: "SAL" | "POA";
  jurisdiction: "NSW" | "VIC" | null;
};

const STORAGE_KEY = "propellect.research.recentSearches";
const MAX_ENTRIES = 5;

// In-memory fallback so this module stays pure/testable outside a browser
// (vitest here runs with environment: "node" — see vitest.config.ts — so
// window/localStorage aren't guaranteed to exist).
let memoryStore: RecentSearchEntry[] = [];

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): RecentSearchEntry[] {
  if (!hasLocalStorage()) return memoryStore;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries: RecentSearchEntry[]): void {
  if (!hasLocalStorage()) {
    memoryStore = entries;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage unavailable/full — recent searches are a convenience,
    // not a source of truth, so fail silently rather than surface an error.
  }
}

export function getRecentSearches(): RecentSearchEntry[] {
  return readAll();
}

export function addRecentSearch(entry: RecentSearchEntry): RecentSearchEntry[] {
  const deduped = readAll().filter((e) => e.geography_id !== entry.geography_id);
  const next = [entry, ...deduped].slice(0, MAX_ENTRIES);
  writeAll(next);
  return next;
}

export function clearRecentSearches(): void {
  writeAll([]);
}
