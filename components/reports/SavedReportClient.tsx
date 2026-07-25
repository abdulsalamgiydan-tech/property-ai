"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { GatedBlur } from "@/components/auth/GatedBlur";
import { UnlockCard } from "@/components/auth/UnlockCard";
import { getPropertyReport, deletePropertyReport, type SavedPropertyReport } from "@/lib/supabase/reports";
import { addToWatchlist } from "@/lib/supabase/watchlist";
import { addPortfolioProperty } from "@/lib/supabase/portfolio";
import { formatAud, formatPercent, formatNumberGb } from "@/lib/formatCurrency";
import { keyRiskBullets, whatDealLooksLikeBullets, neutralPreTaxDepositPercent, neutralPreTaxInterestRatePercent } from "@/lib/advisoryInsights";
import { DEAL_SCORE_GREEN_MIN, DEAL_SCORE_AMBER_MIN } from "@/lib/propertyAnalysis";
import { INVESTMENT_STRATEGIES } from "@/lib/investmentStrategy";
import {
  buildAmortisationScheduleYearly,
  buildCashflowProjectionSeries,
  buildPropertyValueVsMortgageSeries,
  formatChartAud,
  formatChartYear,
} from "@/lib/projections";
import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Props = { reportId: string };
const PROJECTION_SAMPLE_YEARS = [1, 5, 10, 20, 30] as const;
const chartMargin = { top: 8, right: 12, left: 4, bottom: 32 };
const legendProps = {
  wrapperStyle: { paddingTop: 10, color: "#e4e4e7", fontSize: 12 },
  iconType: "line" as const,
  verticalAlign: "bottom" as const,
};
const chartTooltipContentStyle: CSSProperties = {
  background: "#09090b",
  border: "1px solid #3f3f46",
  color: "#f4f4f5",
  borderRadius: 8,
  fontSize: 12,
};
const chartTooltipLabelStyle: CSSProperties = { color: "#a1a1aa", marginBottom: 4 };
const chartTooltipItemStyle: CSSProperties = { color: "#f4f4f5" };

function StatusPill({ status }: { status: string | null }) {
  if (!status) return null;
  const styles: Record<string, string> = {
    strong: "border-emerald-500/40 bg-emerald-950/30 text-emerald-300",
    borderline: "border-amber-500/40 bg-amber-950/30 text-amber-300",
    weak: "border-red-500/40 bg-red-950/30 text-red-300",
  };
  const labels: Record<string, string> = {
    strong: "Green status — the numbers are strong",
    borderline: "Amber status — the holding risk is elevated",
    weak: "Red status — the deal needs improvement",
  };
  const cls = styles[status] ?? "border-zinc-600/40 bg-zinc-900/30 text-zinc-400";
  return (
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      {labels[status] ?? status}
    </span>
  );
}

export function SavedReportClient({ reportId }: Props) {
  const { user, loading, showFullToolAccess, openEarlyAccessModal } = useAuth();
  const router = useRouter();
  const [report, setReport] = useState<SavedPropertyReport | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [watchlisted, setWatchlisted] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [portfolioAdded, setPortfolioAdded] = useState(false);
  const [portfolioBusy, setPortfolioBusy] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const t = setTimeout(() => setDataLoading(false), 0);
      return () => clearTimeout(t);
    }

    async function load() {
      const res = await getPropertyReport(reportId);
      if (!res.ok) {
        setError(res.message);
      } else {
        setReport(res.report);
      }
      setDataLoading(false);
    }

    void load();
  }, [reportId, user, loading]);

  // Derived from state (not props), and the two useMemo calls below must run
  // unconditionally on every render — Rules of Hooks forbids calling them
  // after any of this component's several early returns (loading/!user/
  // error/!report/!result), so both the derivation and the memoization live
  // here, before any return statement, with null-safe fallbacks inside.
  const result = report?.results_json ?? null;
  const inputs = report?.inputs_json ?? null;

  const projectionSeries = useMemo(() => {
    if (!result) return { valueVsDebt: [], cashflow: [] };
    const schedule = buildAmortisationScheduleYearly(
      result.loan,
      result.interestRatePercent,
      30,
      result.isInterestOnly,
      result.loanTermYears
    );
    return {
      valueVsDebt: buildPropertyValueVsMortgageSeries({
        purchasePrice: result.purchasePrice,
        suburbGrowthRatePercent: result.suburbGrowthPercent,
        amortisation: schedule,
      }),
      cashflow: buildCashflowProjectionSeries({
        weeklyRent: result.weeklyRent,
        rentalGrowthRatePercent: result.rentalGrowthRatePercent,
        annualExpenses: result.annualExpenses,
        expensesGrowthRatePercent: 2.5,
        amortisation: schedule,
        buildingDepreciation: result.depreciation.buildingDepreciation,
        fixturesEstimate: result.fixturesEstimate,
        marginalTaxRate: result.marginalRate,
        vacancyPercent: result.vacancyPercent,
        pmFeePercent: result.pmFeePercent,
      }),
    };
  }, [result]);
  const projectionTableRows = useMemo(() => {
    return PROJECTION_SAMPLE_YEARS.map((y) => {
      const vd = projectionSeries.valueVsDebt.find((p) => p.year === y);
      const cf = projectionSeries.cashflow.find((p) => p.year === y);
      if (!vd || !cf) return null;
      return {
        year: y,
        propertyValue: vd.propertyValue,
        mortgageBalance: vd.mortgageBalance,
        preTaxCashflow: cf.preTaxCashflow,
        afterTaxCashflow: cf.afterTaxCashflow,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
  }, [projectionSeries.cashflow, projectionSeries.valueVsDebt]);

  async function handleDelete() {
    if (!confirm("Delete this saved report? This cannot be undone.")) return;
    setDeleting(true);
    const res = await deletePropertyReport(reportId);
    if (res.ok) {
      router.push("/dashboard");
    } else {
      setDeleting(false);
      alert(res.message);
    }
  }

  async function handleAddToWatchlist() {
    if (!user) { openEarlyAccessModal(); return; }
    setWatchlistBusy(true);
    const res = await addToWatchlist({
      type: "property",
      propertyReportId: reportId,
      suburb: report?.suburb || null,
      state: report?.state || null,
      notes: report?.property_name || null,
    });
    setWatchlistBusy(false);
    if (res.ok) setWatchlisted(true);
  }

  async function handleAddToPortfolio() {
    if (!report?.results_json) return;
    const result = report.results_json;
    setPortfolioBusy(true);
    const res = await addPortfolioProperty({
      propertyReportId: report.id,
      label: report.property_name || report.suburb || "Property",
      currentValue: result.purchasePrice,
      loanBalance: result.loan,
      weeklyRent: result.weeklyRent,
      annualExpenses: result.effectiveAnnualExpenses,
      ownershipPercentage: 100,
    });
    setPortfolioBusy(false);
    if (res.ok) setPortfolioAdded(true);
  }

  if (loading || dataLoading) {
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
          <h1 className="text-2xl font-semibold text-white">Sign in to view this report</h1>
          <button
            type="button"
            onClick={openEarlyAccessModal}
            className="mt-6 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
          >
            Sign in / Get free early access
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
        <div className="mx-auto flex max-w-lg flex-col items-center justify-center px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold text-white">Report not found</h1>
          <p className="mt-3 text-sm text-zinc-400">{error}</p>
          <Link href="/dashboard" className="mt-6 text-sm text-violet-400 hover:text-violet-300">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!report) return null;

  if (!result || !inputs) {
    return (
      <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-lg px-4 py-24 text-center">
          <h1 className="text-2xl font-semibold text-white">Report data unavailable</h1>
          <Link href="/dashboard" className="mt-6 block text-sm text-violet-400 hover:text-violet-300">
            ← Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const dealBullets = whatDealLooksLikeBullets(result);
  const riskBullets = keyRiskBullets(result);
  const neutralDep = neutralPreTaxDepositPercent(result);
  const neutralRate = neutralPreTaxInterestRatePercent(result);
  const lvrHigh = result.lvr > 80;

  const statusStyles: Record<string, { card: string; ring: string; pill: string; shadow: string }> = {
    strong: {
      card: "border-2 border-emerald-500/80 bg-emerald-950/40",
      ring: "ring-2 ring-emerald-500/30",
      pill: "bg-emerald-500 shadow-emerald-900/40",
      shadow: "shadow-2xl shadow-emerald-950/40",
    },
    borderline: {
      card: "border-2 border-amber-500/70 bg-amber-950/30",
      ring: "ring-2 ring-amber-400/30",
      pill: "bg-amber-400 shadow-amber-900/30",
      shadow: "shadow-2xl shadow-amber-950/30",
    },
    weak: {
      card: "border-2 border-red-500/80 bg-red-950/40",
      ring: "ring-2 ring-red-500/35",
      pill: "bg-red-500 shadow-red-950/50",
      shadow: "shadow-2xl shadow-red-950/50",
    },
  };
  const s = statusStyles[result.status] ?? statusStyles.weak;

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-violet-400/90 transition hover:text-violet-300"
          >
            ← Dashboard
          </Link>
          <span className="text-zinc-700">/</span>
          <span className="text-xs text-zinc-500">Saved report</span>
        </div>

        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
            Saved report
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {report.property_name || "Untitled property"}
          </h1>
          {(report.suburb || report.state) && (
            <p className="mt-1 text-sm text-zinc-400">
              {[report.suburb, report.state].filter(Boolean).join(", ")}
            </p>
          )}
          <p className="mt-1 text-xs text-zinc-600">
            Saved {new Date(report.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-zinc-400 sm:text-sm">
            A structured investor report view of your saved analysis, including cashflow, tax assumptions,
            long-range projections, and decision guidance.
          </p>
        </header>

        <div className={`space-y-5 rounded-2xl border p-4 backdrop-blur-sm sm:space-y-6 sm:p-7 ${s.card} ${s.ring} ${s.shadow}`}>
          {/* Score + status */}
          <section className="rounded-xl border border-zinc-600/40 bg-zinc-950/35 px-5 py-5 text-center">
            <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Strategy</span>
              <span className="rounded-full border border-violet-500/35 bg-violet-950/40 px-3 py-0.5 text-xs font-semibold text-violet-200">
                {INVESTMENT_STRATEGIES[result.strategy]?.label ?? result.strategy}
              </span>
            </div>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Deal score</p>
            <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-white">
              {formatNumberGb(result.score)}
            </p>
            <div className="mt-4 flex justify-center">
              <span
                aria-label={`Colour status: ${result.status}`}
                className={`inline-block h-4 w-32 rounded-full shadow-lg ${s.pill}`}
              />
            </div>
            <div className="mt-3 flex justify-center">
              <StatusPill status={result.status} />
            </div>
            <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-zinc-500">
              Illustrative score and colour band only — not advice. Green from{" "}
              {formatNumberGb(DEAL_SCORE_GREEN_MIN)}, amber {formatNumberGb(DEAL_SCORE_AMBER_MIN)}–
              {formatNumberGb(DEAL_SCORE_GREEN_MIN - 1)}, red below {formatNumberGb(DEAL_SCORE_AMBER_MIN)}.
            </p>
          </section>

          {/* Executive snapshot */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Executive snapshot</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Gross yield</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatPercent(result.grossYieldPercent, 2)}</p>
              </div>
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Pre-tax cashflow</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${result.preTaxCashflow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatAud(result.preTaxCashflow)}/yr
                </p>
              </div>
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">After-tax cashflow</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${result.afterTaxCashflow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {formatAud(result.afterTaxCashflow)}/yr
                </p>
              </div>
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Est. net tax effect</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-violet-300">{formatAud(result.taxBenefit)}/yr</p>
              </div>
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Est. depreciation</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatAud(result.depreciation.totalDepreciation)}/yr</p>
              </div>
              <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Upfront cash</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatAud(result.totalCashRequired)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Why this score?</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Yield strength</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{formatNumberGb(result.normYield)}</p>
              </div>
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Cashflow strength</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{formatNumberGb(result.normCashflow)}</p>
              </div>
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Growth strength</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{formatNumberGb(result.normGrowth)}</p>
              </div>
              <div className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500">Risk buffer strength</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{formatNumberGb(result.normRisk)}</p>
              </div>
            </div>
          </section>

          {/* Deal breakdown */}
          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Deal breakdown</h3>
            <dl className="divide-y divide-zinc-700/50 text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Purchase price</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.purchasePrice)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Deposit</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.depositAmount)} ({inputs.depositPercent}%)</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Loan</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.loan)} (LVR {formatPercent(result.lvr, 1)})</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Stamp duty</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.stampDuty)}</dd>
              </div>
              {lvrHigh && (
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-zinc-400">LMI (est.)</dt>
                  <dd className="tabular-nums text-zinc-100">{formatAud(result.lmiAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Interest rate</dt>
                <dd className="tabular-nums text-zinc-100">{formatPercent(result.interestRatePercent, 2)} p.a.</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Annual interest</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.interestAnnual)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Weekly rent</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.weeklyRent)}/wk</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Annual expenses (incl. PM fee)</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.effectiveAnnualExpenses)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Marginal tax rate</dt>
                <dd className="tabular-nums text-zinc-100">{formatPercent(result.marginalRate * 100, 0)}</dd>
              </div>
            </dl>
          </section>

          {/* Tax & depreciation */}
          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Tax &amp; depreciation</h3>
            <dl className="divide-y divide-zinc-700/50 text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Building depreciation (est.)</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.depreciation.buildingDepreciation)}/yr</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Plant &amp; fixtures depreciation (est.)</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.depreciation.plantDepreciation)}/yr</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Total depreciation (est.)</dt>
                <dd className="tabular-nums text-zinc-100">{formatAud(result.depreciation.totalDepreciation)}/yr</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Taxable property result</dt>
                <dd className={`tabular-nums ${result.taxablePropertyResult < 0 ? "text-violet-300" : "text-zinc-100"}`}>
                  {formatAud(result.taxablePropertyResult)}/yr
                  {result.taxablePropertyResult < 0 && <span className="ml-1 text-xs text-zinc-500">(negatively geared)</span>}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Est. net tax effect</dt>
                <dd className="tabular-nums text-violet-300">{formatAud(result.taxBenefit)}/yr</dd>
              </div>
            </dl>
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
              Illustrative estimates only. Confirm deductions with a registered tax agent and quantity surveyor.
            </p>
          </section>

          {/* Saved assumptions */}
          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Saved assumptions</h3>
            <dl className="divide-y divide-zinc-700/50 text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Suburb growth rate</dt>
                <dd className="tabular-nums text-zinc-100">{formatPercent(inputs.suburbGrowthPercent, 1)} p.a.</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Rental growth rate</dt>
                <dd className="tabular-nums text-zinc-100">{formatPercent(inputs.rentalGrowthRatePercent, 1)} p.a.</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Vacancy rate</dt>
                <dd className="tabular-nums text-zinc-100">{formatPercent(inputs.vacancyPercent, 1)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Loan type</dt>
                <dd className="text-zinc-100">{inputs.isInterestOnly ? "Interest only" : "Principal & interest"}</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Loan term</dt>
                <dd className="tabular-nums text-zinc-100">{inputs.loanTermYears} years</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Sensitivity testing
            </h3>
            <dl className="divide-y divide-zinc-700/50 text-sm">
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Break-even weekly rent (pre-tax)</dt>
                <dd className="tabular-nums text-zinc-100">~{formatAud(result.diagnostics.breakEvenWeeklyPreTax)}/wk</dd>
              </div>
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-zinc-400">Break-even weekly rent (after-tax)</dt>
                <dd className="tabular-nums text-zinc-100">~{formatAud(result.diagnostics.breakEvenWeeklyAfterTax)}/wk</dd>
              </div>
              {result.diagnostics.targetWeeklyForBuy ? (
                <div className="flex justify-between gap-4 py-2">
                  <dt className="text-zinc-400">Indicative weekly rent for Green status</dt>
                  <dd className="tabular-nums text-zinc-100">~{formatAud(result.diagnostics.targetWeeklyForBuy)}/wk</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                30-year projections - property value vs mortgage
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Nominal values from your saved growth and loan assumptions.
              </p>
            </div>
            <div className="mt-4 h-[17rem] w-full sm:h-[20rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={projectionSeries.valueVsDebt} margin={chartMargin}>
                  <XAxis dataKey="year" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v) => formatNumberGb(Number(v))} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v) => formatChartAud(Number(v))} width={88} />
                  <Tooltip
                    formatter={(value, name) => [formatChartAud(Number(value)), name]}
                    labelFormatter={(label) => formatChartYear(Number(label))}
                    contentStyle={chartTooltipContentStyle}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                  />
                  <Legend {...legendProps} />
                  <Line type="monotone" dataKey="propertyValue" stroke="#c4b5fd" strokeWidth={2.8} dot={false} name="Property value" />
                  <Line type="monotone" dataKey="mortgageBalance" stroke="#fb7185" strokeWidth={2.4} dot={false} name="Mortgage balance" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                30-year projections - annual cashflow
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Year-by-year pre-tax and after-tax cashflow, not cumulative totals.
              </p>
            </div>
            <div className="mt-4 h-[17rem] w-full sm:h-[20rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart data={projectionSeries.cashflow} margin={chartMargin}>
                  <XAxis dataKey="year" tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v) => formatNumberGb(Number(v))} />
                  <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v) => formatChartAud(Number(v))} width={88} />
                  <Tooltip
                    formatter={(value, name) => [formatChartAud(Number(value)), name]}
                    labelFormatter={(label) => formatChartYear(Number(label))}
                    contentStyle={chartTooltipContentStyle}
                    labelStyle={chartTooltipLabelStyle}
                    itemStyle={chartTooltipItemStyle}
                  />
                  <Legend {...legendProps} />
                  <Line type="monotone" dataKey="preTaxCashflow" stroke="#fbbf24" strokeWidth={2.6} dot={false} name="Pre-tax cashflow" />
                  <Line type="monotone" dataKey="afterTaxCashflow" stroke="#818cf8" strokeWidth={2.5} strokeDasharray="7 5" dot={false} name="After-tax cashflow" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Projection snapshot table
            </h3>
            <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">
              Snapshot years: {PROJECTION_SAMPLE_YEARS.join(", ")}.
            </p>
            <div className="overflow-x-auto rounded-lg border border-zinc-700/40">
              <table className="w-full min-w-[40rem] border-collapse text-left text-xs text-zinc-300">
                <thead>
                  <tr className="border-b border-zinc-600/80 bg-zinc-900/80 text-[10px] uppercase tracking-wide text-zinc-400">
                    <th className="px-3 py-2.5 font-semibold">Year</th>
                    <th className="px-3 py-2.5 font-semibold">Property value</th>
                    <th className="px-3 py-2.5 font-semibold">Mortgage balance</th>
                    <th className="px-3 py-2.5 font-semibold">Pre-tax cashflow</th>
                    <th className="px-3 py-2.5 font-semibold">After-tax cashflow</th>
                  </tr>
                </thead>
                <tbody>
                  {projectionTableRows.map((row) => (
                    <tr key={row.year} className="border-b border-zinc-800/80 last:border-0">
                      <td className="px-3 py-2.5 tabular-nums font-medium text-zinc-200">{formatNumberGb(row.year)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAud(row.propertyValue)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAud(row.mortgageBalance)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAud(row.preTaxCashflow)}</td>
                      <td className="px-3 py-2.5 tabular-nums">{formatAud(row.afterTaxCashflow)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Actions */}
          <section className="rounded-xl border border-zinc-700/50 bg-zinc-950/30 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Actions</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                href="/analyse-property"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/50 bg-violet-950/30 px-4 py-2.5 text-sm font-semibold text-violet-200 transition hover:border-violet-400/70 hover:bg-violet-900/40"
              >
                Re-run analysis
              </Link>
              <Link
                href="/compare-properties"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
              >
                Compare with another property
              </Link>
              <button
                type="button"
                onClick={handleAddToWatchlist}
                disabled={watchlistBusy || watchlisted}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 disabled:opacity-60"
              >
                {watchlisted ? "Added to watchlist ✓" : watchlistBusy ? "Adding…" : "Add to watchlist"}
              </button>
              <button
                type="button"
                onClick={handleAddToPortfolio}
                disabled={portfolioBusy || portfolioAdded}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60 disabled:opacity-60"
              >
                {portfolioAdded ? "Added to portfolio ✓" : portfolioBusy ? "Adding…" : "Add to portfolio"}
              </button>
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/40 px-4 py-2.5 text-sm font-medium text-zinc-500"
              >
                Export report (coming soon)
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-950/20 px-4 py-2.5 text-sm font-medium text-red-300 transition hover:border-red-500/50 hover:bg-red-950/30 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete report"}
              </button>
            </div>
          </section>

          {/* Gated advisory */}
          <GatedBlur
            locked={!showFullToolAccess}
            overlay={
              <UnlockCard
                title="Unlock the full decision view"
                body={
                  <>
                    <p className="text-sm text-zinc-300">Sign in to unlock:</p>
                    <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-zinc-300 marker:text-zinc-600">
                      <li>key risks</li>
                      <li>what needs to improve</li>
                      <li>deeper decision guidance</li>
                    </ul>
                  </>
                }
                accountHint="Create a free account to access advisory sections."
                onCtaClick={openEarlyAccessModal}
              />
            }
          >
            <div className="space-y-6">
              <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">What this deal looks like</h3>
                <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                  {dealBullets.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </section>

              <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">What needs to improve?</h3>
                <dl className="mt-4 divide-y divide-zinc-700/50 text-sm">
                  <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <dt className="text-zinc-400">Break-even weekly rent (pre-tax)</dt>
                    <dd className="font-medium tabular-nums text-zinc-100">~{formatAud(result.diagnostics.breakEvenWeeklyPreTax)}/wk</dd>
                  </div>
                  <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <dt className="text-zinc-400">Break-even weekly rent (after-tax)</dt>
                    <dd className="font-medium tabular-nums text-zinc-100">~{formatAud(result.diagnostics.breakEvenWeeklyAfterTax)}/wk</dd>
                  </div>
                  {neutralDep !== null && (
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-zinc-400">Deposit for ~neutral pre-tax cashflow</dt>
                      <dd className="font-medium tabular-nums text-zinc-100">~{formatPercent(neutralDep, 1)}</dd>
                    </div>
                  )}
                  {neutralRate !== null && neutralRate > 0 && neutralRate < 20 && (
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-zinc-400">Interest rate for ~neutral pre-tax cashflow</dt>
                      <dd className="font-medium tabular-nums text-zinc-100">~{formatPercent(neutralRate, 2)}</dd>
                    </div>
                  )}
                </dl>
              </section>

              <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Key risks</h3>
                <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                  {riskBullets.map((line, i) => <li key={i}>{line}</li>)}
                </ul>
              </section>
            </div>
          </GatedBlur>
        </div>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-500">
          Illustrative model only. Not financial, tax, or legal advice. Depreciation and tax effects are rough estimates only.
        </p>
      </div>
    </div>
  );
}
