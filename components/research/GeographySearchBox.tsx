"use client";

import React, { useEffect, useRef, useState } from "react";
import { StateBadge } from "@/components/research/StateBadge";
import { addRecentSearch, getRecentSearches, type RecentSearchEntry } from "@/lib/research/recentSearches";
import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";

const DEBOUNCE_MS = 300;

// The fields every consumer actually needs, common to both a live search
// result and a stored recent-search entry (which doesn't carry the
// has_*_snapshot flags) — avoids an unsafe cast between the two shapes.
type GeographySelection = Pick<
  GeographySearchResultV2,
  "geography_id" | "geography_code" | "geography_name" | "geography_type" | "jurisdiction"
>;

/**
 * Reusable national-search input: debounced as-you-type suggestions,
 * up/down/Enter/Escape keyboard navigation, loading/empty/error states,
 * and a recent-searches list for unauthenticated preview users. Backed by
 * /api/research/search-suggest (internal — gated the same way as the rest
 * of the /research UI, independent of the public /api/v1 rollout).
 *
 * Every consumer of this component shares one search implementation —
 * do not build a second search input elsewhere in the app.
 */
export function GeographySearchBox({
  onSelect,
  placeholder = "Search suburb or postcode",
  jurisdiction,
  geographyType,
  autoFocus = false,
  className,
}: {
  onSelect: (result: GeographySelection) => void;
  placeholder?: string;
  jurisdiction?: "NSW" | "VIC";
  geographyType?: "SAL" | "POA";
  autoFocus?: boolean;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<GeographySearchResultV2[]>([]);
  const [recent, setRecent] = useState<RecentSearchEntry[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRecent(getRecentSearches());
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), limit: "8" });
        if (jurisdiction) params.set("jurisdiction", jurisdiction);
        if (geographyType) params.set("type", geographyType);
        const res = await fetch(`/api/research/search-suggest?${params.toString()}`);
        if (!res.ok) throw new Error(`search-suggest returned ${res.status}`);
        const data = (await res.json()) as { results: GeographySearchResultV2[] };
        setResults(data.results ?? []);
        setActiveIndex(-1);
      } catch {
        setError(true);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, jurisdiction, geographyType]);

  function selectResult(r: GeographySelection) {
    addRecentSearch({
      geography_id: r.geography_id,
      geography_code: r.geography_code,
      geography_name: r.geography_name,
      geography_type: r.geography_type,
      jurisdiction: r.jurisdiction,
    });
    setRecent(getRecentSearches());
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(r);
  }

  const showingRecent = query.trim().length === 0 && recent.length > 0;
  const list: GeographySelection[] = showingRecent ? recent : results;

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = list[activeIndex] ?? list[0];
      if (chosen) selectResult(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="geography-search-listbox"
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/60 focus:outline-none"
      />

      {open ? (
        <div
          id="geography-search-listbox"
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950/95 shadow-xl backdrop-blur-xl"
        >
          {loading ? (
            <p className="px-4 py-3 text-xs text-zinc-500">Searching…</p>
          ) : error ? (
            <p className="px-4 py-3 text-xs text-rose-300">Search failed — try again.</p>
          ) : list.length === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-500">
              {query.trim() ? "No matches. Try a different suburb or postcode name." : "Start typing a suburb or postcode."}
            </p>
          ) : (
            <>
              {showingRecent ? (
                <p className="border-b border-zinc-800/70 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Recent searches
                </p>
              ) : null}
              <ul>
                {list.map((r, i) => (
                  <li key={r.geography_id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeIndex}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => selectResult(r)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
                        i === activeIndex ? "bg-violet-600/20 text-violet-200" : "text-zinc-200 hover:bg-zinc-800/60"
                      }`}
                    >
                      <span>
                        {r.geography_name}
                        <StateBadge jurisdiction={r.jurisdiction} className="ml-2" />
                      </span>
                      <span className="text-[11px] text-zinc-500">{r.geography_type === "SAL" ? "Suburb" : "Postcode"}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
