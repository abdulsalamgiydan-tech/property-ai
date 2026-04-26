"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { addToWatchlist } from "@/lib/supabase/watchlist";
import Link from "next/link";
import { useState } from "react";

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/**
 * Suburb Intelligence — placeholder UI.
 *
 * This page is a foundation for future suburb data integration.
 * When a real data source (e.g. PropTrack, CoreLogic, or ABS) is connected,
 * replace the placeholder cards with real data fetched via API routes.
 */



function PlaceholderProfile({ suburb, state }: { suburb: string; state: string }) {
  const { user, openEarlyAccessModal } = useAuth();
  const [watchlisted, setWatchlisted] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  async function handleWatchlist() {
    if (!user) { openEarlyAccessModal(); return; }
    setWatchlistBusy(true);
    const res = await addToWatchlist({ type: "suburb", suburb, state });
    setWatchlistBusy(false);
    if (res.ok) setWatchlisted(true);
  }

  return (
    <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/60 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{suburb}, {state}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Suburb profile</p>
        </div>
        <button
          type="button"
          onClick={handleWatchlist}
          disabled={watchlistBusy || watchlisted}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 disabled:opacity-60"
        >
          {watchlisted ? "Added to watchlist ✓" : watchlistBusy ? "Adding…" : "Add to watchlist"}
        </button>
      </div>

      {/* Data placeholder grid */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: "Median house price", value: null, note: "Data coming soon" },
          { label: "Median unit price", value: null, note: "Data coming soon" },
          { label: "Median weekly rent", value: null, note: "Data coming soon" },
          { label: "Gross yield (house)", value: null, note: "Data coming soon" },
          { label: "Vacancy rate", value: null, note: "Data coming soon" },
          { label: "12-month growth", value: null, note: "Data coming soon" },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-600">—</p>
            <p className="mt-0.5 text-[10px] text-zinc-700">{item.note}</p>
          </div>
        ))}
      </div>

      {/* CTA to analyse */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/analyse-property?suburb=${encodeURIComponent(suburb)}&state=${encodeURIComponent(state)}`}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
        >
          Analyse a property in {suburb}
        </Link>
        <Link
          href="/compare-properties"
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
        >
          Compare properties
        </Link>
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-zinc-700">
        Suburb data integration is in development. When connected, this page will show historical medians,
        rental yields, vacancy rates, and growth trends from verified data sources. All figures will be
        clearly labelled as historical, not forecasts.
      </p>
    </div>
  );
}

export function SuburbIntelligenceClient() {
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("VIC");
  const [searched, setSearched] = useState<{ suburb: string; state: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!suburb.trim()) { setError("Please enter a suburb name."); return; }
    setError(null);
    setSearched({ suburb: suburb.trim(), state });
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
            Suburb intelligence
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Understand a suburb
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Search for a suburb to see its investment profile — median prices, rental yields, vacancy
            rates, and growth trends. Data integration is in development; results will appear here when
            connected.
          </p>
        </header>

        {/* Search form */}
        <form onSubmit={handleSearch} className="mb-8 flex flex-wrap gap-3">
          <div className="flex-1 min-w-[180px]">
            <input
              type="text"
              value={suburb}
              onChange={(e) => { setError(null); setSuburb(e.target.value); }}
              placeholder="Suburb name, e.g. Fitzroy"
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
            />
          </div>
          <div className="w-24">
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-3 text-sm text-zinc-100 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
            >
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
          >
            Search
          </button>
        </form>

        {error && <p className="mb-4 text-sm text-red-300" role="alert">{error}</p>}

        {searched && (
          <PlaceholderProfile suburb={searched.suburb} state={searched.state} />
        )}

        {!searched && (
          <div className="rounded-xl border border-dashed border-zinc-700/50 bg-zinc-900/30 px-6 py-12 text-center">
            <p className="text-sm font-medium text-zinc-400">Search for a suburb to get started</p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              Enter a suburb name and state above to view its investment profile.
            </p>
          </div>
        )}

        <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-600">
          Suburb data integration is in development. All future data will be historical, not forecasts.
          Not financial advice.
        </p>
      </div>
    </div>
  );
}
