"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { listPropertyReports, type SavedPropertyReport } from "@/lib/supabase/reports";
import { listComparisons, type SavedComparison } from "@/lib/supabase/comparisons";
import { listWatchlistItems, type WatchlistItem } from "@/lib/supabase/watchlist";
import { formatAud } from "@/lib/formatCurrency";
import Link from "next/link";
import { useEffect, useState } from "react";

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    strong: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
    borderline: "border-amber-500/40 bg-amber-950/30 text-amber-300",
    weak: "border-red-500/40 bg-red-950/30 text-red-300",
  };
  const labels: Record<string, string> = {
    strong: "Green status",
    borderline: "Amber status",
    weak: "Red status",
  };
  const cls = styles[status] ?? "border-zinc-600/40 bg-zinc-900/30 text-zinc-400";
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

function ReportCard({ report }: { report: SavedPropertyReport }) {
  return (
    <Link
      href={`/reports/${report.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4 transition hover:border-violet-500/50 hover:bg-zinc-800/60"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white group-hover:text-violet-200 transition line-clamp-1">
          {report.property_name || "Untitled property"}
        </h3>
        <StatusPill status={report.status_colour} />
      </div>
      {report.suburb && (
        <p className="text-xs text-zinc-400">
          {report.suburb}{report.state ? `, ${report.state}` : ""}
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
        {report.purchase_price != null && (
          <span>Purchase: <span className="text-zinc-300">{formatAud(report.purchase_price)}</span></span>
        )}
        {report.score != null && (
          <span>Score: <span className="text-zinc-300">{Math.round(report.score)}</span></span>
        )}
      </div>
      <p className="text-[10px] text-zinc-600">
        Saved {new Date(report.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </Link>
  );
}

function ComparisonCard({ comparison }: { comparison: SavedComparison }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
      <h3 className="text-sm font-semibold text-white line-clamp-1">
        {comparison.label || "Saved comparison"}
      </h3>
      <p className="text-[10px] text-zinc-600">
        Saved {new Date(comparison.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </div>
  );
}

function WatchlistCard({ item }: { item: WatchlistItem }) {
  const label =
    item.type === "suburb"
      ? [item.suburb, item.state].filter(Boolean).join(", ") || "Suburb"
      : item.type === "note"
        ? item.notes || "Note"
        : "Property";

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-zinc-600/50 bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          {item.type}
        </span>
      </div>
      <p className="text-sm font-medium text-zinc-200 line-clamp-1">{label}</p>
      {item.notes && item.type !== "note" && (
        <p className="text-xs text-zinc-500 line-clamp-2">{item.notes}</p>
      )}
    </div>
  );
}

function EmptyCard({ title, body, cta, ctaHref }: { title: string; body: string; cta: string; ctaHref: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-700/50 bg-zinc-900/30 px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-zinc-600">{body}</p>
      <Link
        href={ctaHref}
        className="mt-1 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-violet-500"
      >
        {cta}
      </Link>
    </div>
  );
}

export function DashboardClient() {
  const { user, loading, openEarlyAccessModal } = useAuth();
  const [reports, setReports] = useState<SavedPropertyReport[]>([]);
  const [comparisons, setComparisons] = useState<SavedComparison[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      // Defer to avoid setState-in-effect lint rule
      const t = setTimeout(() => setDataLoading(false), 0);
      return () => clearTimeout(t);
    }

    async function loadData() {
      setDataLoading(true);
      const [rRes, cRes, wRes] = await Promise.all([
        listPropertyReports(),
        listComparisons(),
        listWatchlistItems(),
      ]);
      if (rRes.ok) setReports(rRes.reports);
      if (cRes.ok) setComparisons(cRes.comparisons);
      if (wRes.ok) setWatchlist(wRes.items);
      setDataLoading(false);
    }

    void loadData();
  }, [user]);

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
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Dashboard</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Sign in to view your dashboard
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Your saved reports, comparisons, watchlist, and portfolio are waiting for you.
          </p>
          <button
            type="button"
            onClick={openEarlyAccessModal}
            className="mt-8 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500"
          >
            Sign in / Get free early access
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
            Dashboard
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-zinc-400">{user.email}</p>
        </header>

        {/* Quick actions */}
        <div className="mb-10 flex flex-wrap gap-3">
          <Link
            href="/analyse-property"
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500"
          >
            <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Analyse a property
          </Link>
          <Link
            href="/compare-properties"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/80 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/80"
          >
            Compare 2 properties
          </Link>
          <Link
            href="/watchlist"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/80 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/80"
          >
            Watchlist
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/80 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/80"
          >
            Portfolio
          </Link>
        </div>

        {dataLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
          </div>
        ) : (
          <div className="space-y-10">
            {/* Saved reports */}
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Saved property reports
                  {reports.length > 0 && (
                    <span className="ml-2 rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] text-violet-300">
                      {reports.length}
                    </span>
                  )}
                </h2>
                {reports.length > 0 && (
                  <Link href="/analyse-property" className="text-xs text-violet-400 transition hover:text-violet-300">
                    + New analysis
                  </Link>
                )}
              </div>
              {reports.length === 0 ? (
                <EmptyCard
                  title="No saved reports yet"
                  body="Analyse a property and save the report to keep it here for future reference."
                  cta="Analyse a property"
                  ctaHref="/analyse-property"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reports.map((r) => (
                    <ReportCard key={r.id} report={r} />
                  ))}
                </div>
              )}
            </section>

            {/* Saved comparisons */}
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Saved comparisons
                  {comparisons.length > 0 && (
                    <span className="ml-2 rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] text-violet-300">
                      {comparisons.length}
                    </span>
                  )}
                </h2>
                {comparisons.length > 0 && (
                  <Link href="/compare-properties" className="text-xs text-violet-400 transition hover:text-violet-300">
                    + New comparison
                  </Link>
                )}
              </div>
              {comparisons.length === 0 ? (
                <EmptyCard
                  title="No saved comparisons yet"
                  body="Compare two properties side by side and save the result."
                  cta="Compare 2 properties"
                  ctaHref="/compare-properties"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {comparisons.map((c) => (
                    <ComparisonCard key={c.id} comparison={c} />
                  ))}
                </div>
              )}
            </section>

            {/* Watchlist */}
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Watchlist
                  {watchlist.length > 0 && (
                    <span className="ml-2 rounded-full bg-violet-600/20 px-2 py-0.5 text-[10px] text-violet-300">
                      {watchlist.length}
                    </span>
                  )}
                </h2>
                {watchlist.length > 0 && (
                  <Link href="/watchlist" className="text-xs text-violet-400 transition hover:text-violet-300">
                    View all
                  </Link>
                )}
              </div>
              {watchlist.length === 0 ? (
                <EmptyCard
                  title="Your watchlist is empty"
                  body="Add properties or suburbs to track to your watchlist."
                  cta="Go to watchlist"
                  ctaHref="/watchlist"
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {watchlist.slice(0, 6).map((item) => (
                    <WatchlistCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>

            {/* Portfolio snapshot placeholder */}
            <section>
              <div className="mb-4">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  Portfolio snapshot
                </h2>
              </div>
              <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-300">Track your portfolio</p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                      Add saved property reports to your portfolio to see total value, debt, equity, and cashflow.
                    </p>
                  </div>
                  <Link
                    href="/portfolio"
                    className="shrink-0 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
                  >
                    View portfolio →
                  </Link>
                </div>
              </div>
            </section>
          </div>
        )}

        <p className="mt-12 text-center text-[11px] leading-relaxed text-zinc-600">
          Illustrative modelling only. Not financial, tax, or legal advice.
        </p>
      </div>
    </div>
  );
}
