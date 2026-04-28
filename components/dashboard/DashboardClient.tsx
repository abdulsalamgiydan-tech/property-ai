"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { CTAButton } from "@/components/design/CTAButton";
import { DisclaimerFooter } from "@/components/design/DisclaimerFooter";
import { MetricCard } from "@/components/design/MetricCard";
import { SectionCard } from "@/components/design/SectionCard";
import { StatusBadge } from "@/components/design/StatusBadge";
import { listPropertyReports, type SavedPropertyReport } from "@/lib/supabase/reports";
import { listComparisons, type SavedComparison } from "@/lib/supabase/comparisons";
import {
  listPortfolioProperties,
  type PortfolioProperty,
} from "@/lib/supabase/portfolio";
import { listWatchlistItems, type WatchlistItem } from "@/lib/supabase/watchlist";
import { formatAud } from "@/lib/formatCurrency";
import Link from "next/link";
import { useEffect, useState } from "react";

function toDealStatus(
  status: string | null
): "green" | "amber" | "red" | null {
  if (status === "strong") return "green";
  if (status === "borderline") return "amber";
  if (status === "weak") return "red";
  return null;
}

function ReportCard({ report }: { report: SavedPropertyReport }) {
  const status = toDealStatus(report.status_colour);

  return (
    <Link
      href={`/reports/${report.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/45 p-4 transition hover:border-violet-500/45 hover:bg-zinc-900/80"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-white group-hover:text-violet-200 transition line-clamp-1">
          {report.property_name || "Untitled property"}
        </h3>
        {status ? (
          <StatusBadge
            status={status}
            score={
              typeof report.score === "number"
                ? Math.round(report.score)
                : undefined
            }
          />
        ) : null}
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
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/45 p-4">
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
    <div className="flex flex-col gap-1 rounded-xl border border-zinc-700/70 bg-zinc-950/45 p-4">
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

function EmptyCard({
  title,
  body,
  cta,
  ctaHref,
}: {
  title: string;
  body: string;
  cta: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-700/50 bg-zinc-900/30 px-4 py-8 text-center">
      <p className="text-sm font-medium text-zinc-400">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-zinc-600">{body}</p>
      <Link
        href={ctaHref}
        className="mt-4 inline-flex rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-500"
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
  const [portfolio, setPortfolio] = useState<PortfolioProperty[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      // Defer to avoid setState-in-effect lint rule
      const t = setTimeout(() => setDataLoading(false), 0);
      return () => clearTimeout(t);
    }

    async function loadData() {
      setDataLoading(true);
      const [rRes, cRes, wRes, pRes] = await Promise.all([
        listPropertyReports(),
        listComparisons(),
        listWatchlistItems(),
        listPortfolioProperties(),
      ]);
      if (rRes.ok) setReports(rRes.reports);
      if (cRes.ok) setComparisons(cRes.comparisons);
      if (wRes.ok) setWatchlist(wRes.items);
      if (pRes.ok) setPortfolio(pRes.properties);
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

  const totalValue = portfolio.reduce(
    (sum, item) => sum + (item.current_value ?? 0),
    0
  );
  const totalDebt = portfolio.reduce(
    (sum, item) => sum + (item.loan_balance ?? 0),
    0
  );
  const totalEquity = totalValue - totalDebt;
  const annualRent = portfolio.reduce(
    (sum, item) => sum + (item.weekly_rent ?? 0) * 52,
    0
  );
  const annualExpenses = portfolio.reduce(
    (sum, item) => sum + (item.annual_expenses ?? 0),
    0
  );
  const netAnnualCashflow = annualRent - annualExpenses;

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="relative mb-8 overflow-hidden rounded-3xl border border-zinc-700/70 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">
          <div
            className="pointer-events-none absolute right-[-8rem] top-[-10rem] h-[24rem] w-[24rem] rounded-full"
            style={{ background: "radial-gradient(closest-side, rgba(124,58,237,0.24), transparent)" }}
          />
          <p className="relative text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
            Dashboard
          </p>
          <h1 className="relative mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Your investment command centre
          </h1>
          <p className="relative mt-1 text-sm text-zinc-400">{user.email}</p>
          <div className="relative mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Saved reports"
              value={reports.length}
              subtext="Detailed deal files"
              accent="violet"
            />
            <MetricCard
              label="Saved comparisons"
              value={comparisons.length}
              subtext="Head-to-head scenarios"
            />
            <MetricCard
              label="Watchlist items"
              value={watchlist.length}
              subtext="Properties, notes, and suburbs"
            />
            <MetricCard
              label="Portfolio equity"
              value={portfolio.length > 0 ? formatAud(totalEquity) : "—"}
              subtext={portfolio.length > 0 ? `${portfolio.length} holdings tracked` : "Add holdings to track equity"}
              accent={totalEquity >= 0 ? "emerald" : "red"}
            />
          </div>
        </header>

        <SectionCard
          title="Quick actions"
          description="Jump straight into the next analysis task."
          className="mb-8"
        >
          <div className="flex flex-wrap gap-3">
            <CTAButton href="/analyse-property">Analyse a property</CTAButton>
            <CTAButton href="/compare-properties" variant="secondary">
              Compare 2 properties
            </CTAButton>
            <CTAButton href="/watchlist" variant="secondary">
              Watchlist
            </CTAButton>
            <CTAButton href="/portfolio" variant="secondary">
              Portfolio
            </CTAButton>
          </div>
        </SectionCard>

        {dataLoading ? (
          <div className="flex items-center justify-center py-16">
            <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
          </div>
        ) : (
          <div className="space-y-8">
            <SectionCard
              title="Saved property reports"
              actions={
                reports.length > 0 ? (
                  <Link href="/analyse-property" className="text-xs text-violet-300 transition hover:text-violet-200">
                    + New analysis
                  </Link>
                ) : undefined
              }
            >
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
            </SectionCard>

            <SectionCard
              title="Saved comparisons"
              actions={
                comparisons.length > 0 ? (
                  <Link href="/compare-properties" className="text-xs text-violet-300 transition hover:text-violet-200">
                    + New comparison
                  </Link>
                ) : undefined
              }
            >
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
            </SectionCard>

            <SectionCard
              title="Watchlist preview"
              description="Recent properties and suburbs you are tracking."
              actions={
                watchlist.length > 0 ? (
                  <Link href="/watchlist" className="text-xs text-violet-300 transition hover:text-violet-200">
                    View all
                  </Link>
                ) : undefined
              }
            >
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
            </SectionCard>

            <SectionCard
              title="Portfolio snapshot"
              description="Live totals based on your saved portfolio entries."
              actions={
                <Link href="/portfolio" className="text-xs text-violet-300 transition hover:text-violet-200">
                  View portfolio
                </Link>
              }
            >
              {portfolio.length === 0 ? (
                <EmptyCard
                  title="No portfolio holdings yet"
                  body="Add a property to your portfolio to track value, debt, equity, and annual cashflow."
                  cta="Go to portfolio"
                  ctaHref="/portfolio"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Portfolio value" value={formatAud(totalValue)} accent="violet" />
                  <MetricCard label="Loan balance" value={formatAud(totalDebt)} />
                  <MetricCard
                    label="Net equity"
                    value={formatAud(totalEquity)}
                    accent={totalEquity >= 0 ? "emerald" : "red"}
                  />
                  <MetricCard
                    label="Net annual cashflow"
                    value={formatAud(netAnnualCashflow)}
                    subtext={`${formatAud(annualRent)} rent - ${formatAud(annualExpenses)} expenses`}
                    accent={netAnnualCashflow >= 0 ? "emerald" : "amber"}
                  />
                </div>
              )}
            </SectionCard>
          </div>
        )}

        <DisclaimerFooter className="mt-10" />
      </div>
    </div>
  );
}
