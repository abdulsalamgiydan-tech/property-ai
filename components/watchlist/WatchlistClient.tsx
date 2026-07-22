"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  listWatchlistItems,
  addToWatchlist,
  removeFromWatchlist,
  type WatchlistItem,
} from "@/lib/supabase/watchlist";
import { GeographySearchBox } from "@/components/research/GeographySearchBox";
import {
  listChangeEvents,
  markChangeEventRead,
  refreshWatchlistChanges,
  type WatchlistChangeEvent,
} from "@/lib/supabase/watchlistChangeEvents";
import Link from "next/link";
import { useEffect, useState } from "react";

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

function WatchlistItemRow({
  item,
  onRemove,
}: {
  item: WatchlistItem;
  onRemove: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!confirm("Remove this item from your watchlist?")) return;
    setRemoving(true);
    const res = await removeFromWatchlist(item.id);
    if (res.ok) {
      onRemove(item.id);
    } else {
      setRemoving(false);
      alert(res.message);
    }
  }

  const title =
    item.type === "suburb"
      ? [item.suburb, item.state].filter(Boolean).join(", ")
      : item.type === "note"
        ? item.notes || "Note"
        : item.notes || "Property";

  const profileHref =
    item.geography_code && item.geography_type
      ? item.geography_type === "SAL"
        ? `/research/suburb/${item.geography_code}`
        : `/research/postcode/${item.geography_code}`
      : null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-zinc-600/50 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
            {item.type}
          </span>
          {item.property_report_id && (
            <Link
              href={`/reports/${item.property_report_id}`}
              className="text-[10px] text-violet-400 transition hover:text-violet-300"
            >
              View report →
            </Link>
          )}
          {profileHref && (
            <Link href={profileHref} className="text-[10px] text-violet-400 transition hover:text-violet-300">
              Open research profile →
            </Link>
          )}
        </div>
        <p className="text-sm font-medium text-zinc-200 line-clamp-2">{title}</p>
        <p className="text-[10px] text-zinc-600">
          Added{" "}
          {new Date(item.created_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <button
        type="button"
        onClick={handleRemove}
        disabled={removing}
        aria-label="Remove from watchlist"
        className="shrink-0 rounded-lg border border-red-500/25 bg-red-950/20 px-2.5 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-500/40 hover:bg-red-950/30 disabled:opacity-50"
      >
        {removing ? "…" : "Remove"}
      </button>
    </div>
  );
}

export function WatchlistClient({ geographySearchEnabled = false }: { geographySearchEnabled?: boolean } = {}) {
  const { user, loading, openEarlyAccessModal } = useAuth();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Add suburb form
  const [addSuburb, setAddSuburb] = useState("");
  const [addState, setAddState] = useState("VIC");
  const [addNotes, setAddNotes] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [geographyLink, setGeographyLink] = useState<{
    geographyId: string;
    geographyCode: string;
    geographyType: "SAL" | "POA";
  } | null>(null);
  const [changeEvents, setChangeEvents] = useState<WatchlistChangeEvent[]>([]);
  const [changesLoading, setChangesLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => setDataLoading(false), 0);
      return () => clearTimeout(t);
    }
    async function load() {
      const res = await listWatchlistItems();
      if (res.ok) setItems(res.items);
      setDataLoading(false);
    }
    void load();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    async function loadChanges() {
      setChangesLoading(true);
      // On-demand check, triggered by visiting the watchlist — no cron/
      // scheduled function involved (see refresh-changes route comment).
      await refreshWatchlistChanges();
      const res = await listChangeEvents();
      if (res.ok) setChangeEvents(res.events);
      setChangesLoading(false);
    }
    void loadChanges();
  }, [user]);

  async function handleMarkRead(id: string) {
    setChangeEvents((prev) => prev.map((e) => (e.id === id ? { ...e, read: true } : e)));
    await markChangeEventRead(id);
  }

  async function handleAddSuburb(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { openEarlyAccessModal(); return; }
    if (!addSuburb.trim()) { setAddError("Please enter a suburb name."); return; }
    setAdding(true);
    setAddError(null);
    const res = await addToWatchlist({
      type: "suburb",
      suburb: addSuburb.trim(),
      state: addState,
      notes: addNotes.trim() || null,
      geographyId: geographyLink?.geographyId ?? null,
      geographyCode: geographyLink?.geographyCode ?? null,
      geographyType: geographyLink?.geographyType ?? null,
    });
    setAdding(false);
    if (!res.ok) { setAddError(res.message); return; }
    // Refresh list
    const listRes = await listWatchlistItems();
    if (listRes.ok) setItems(listRes.items);
    setAddSuburb("");
    setAddNotes("");
    setGeographyLink(null);
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Watchlist</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Sign in to use your watchlist</h1>
          <p className="mt-3 text-sm text-zinc-400">Track properties and suburbs you are watching.</p>
          <button
            type="button"
            onClick={openEarlyAccessModal}
            className="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-500"
          >
            Sign in / Get free early access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-xs font-medium text-violet-400/90 transition hover:text-violet-300">
            ← Dashboard
          </Link>
        </div>

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Watchlist</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Your watchlist
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track properties and suburbs you are watching.
          </p>
        </header>

        {/* What changed? */}
        {changesLoading ? (
          <div className="mb-8 flex items-center gap-2 text-xs text-zinc-500">
            <span className="size-3 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
            Checking for updates…
          </div>
        ) : changeEvents.length > 0 ? (
          <section className="mb-8 rounded-xl border border-violet-500/30 bg-violet-950/15 p-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-violet-300">
              What changed? ({changeEvents.filter((e) => !e.read).length} unread)
            </h2>
            <ul className="space-y-2">
              {changeEvents.slice(0, 10).map((event) => (
                <li
                  key={event.id}
                  className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                    event.read ? "border-zinc-800 bg-zinc-900/30 text-zinc-500" : "border-violet-500/25 bg-zinc-900/60 text-zinc-200"
                  }`}
                >
                  <div>
                    <p>{event.description}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-600">
                      {new Date(event.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {!event.read && (
                    <button
                      type="button"
                      onClick={() => handleMarkRead(event.id)}
                      className="shrink-0 text-[10px] text-violet-400 hover:text-violet-300"
                    >
                      Mark read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Add suburb form */}
        <section className="mb-8 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Add a suburb to watch
          </h2>
          {geographySearchEnabled ? (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-zinc-400">
                Search research data (NSW/VIC) — links this entry to its market profile
              </label>
              <GeographySearchBox
                placeholder="Type a suburb or postcode…"
                onSelect={(r) => {
                  setAddSuburb(r.geography_name);
                  setAddState(r.jurisdiction ?? addState);
                  setGeographyLink({ geographyId: r.geography_id, geographyCode: r.geography_code, geographyType: r.geography_type });
                }}
              />
              <p className="mt-1 text-[11px] text-zinc-600">
                Or type a suburb name manually below for any state — only NSW/VIC search results link to a research
                profile.
              </p>
            </div>
          ) : null}
          <form onSubmit={handleAddSuburb} className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-zinc-400" htmlFor="wl-suburb">
                  Suburb {geographyLink ? <span className="text-violet-400">(linked to research profile)</span> : null}
                </label>
                <input
                  id="wl-suburb"
                  type="text"
                  value={addSuburb}
                  onChange={(e) => { setAddError(null); setAddSuburb(e.target.value); setGeographyLink(null); }}
                  placeholder="e.g. Fitzroy"
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
                />
              </div>
              <div className="w-24">
                <label className="mb-1 block text-xs font-medium text-zinc-400" htmlFor="wl-state">
                  State
                </label>
                <select
                  id="wl-state"
                  value={addState}
                  onChange={(e) => setAddState(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
                >
                  {STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-400" htmlFor="wl-notes">
                Notes (optional)
              </label>
              <input
                id="wl-notes"
                type="text"
                value={addNotes}
                onChange={(e) => setAddNotes(e.target.value)}
                placeholder="e.g. Strong rental demand, close to train"
                className="w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15"
              />
            </div>
            {addError && (
              <p className="text-xs text-red-300" role="alert">{addError}</p>
            )}
            <button
              type="submit"
              disabled={adding}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:opacity-70"
            >
              {adding ? "Adding…" : "Add to watchlist"}
            </button>
          </form>
        </section>

        {/* Watchlist items */}
        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-700/50 bg-zinc-900/30 px-4 py-12 text-center">
            <p className="text-sm font-medium text-zinc-400">Your watchlist is empty</p>
            <p className="max-w-xs text-xs leading-relaxed text-zinc-600">
              Add suburbs above, or save a property report and add it to your watchlist from the report page.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <WatchlistItemRow key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        )}

        <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-600">
          Illustrative only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
