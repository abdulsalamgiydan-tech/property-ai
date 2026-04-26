"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import {
  listPortfolioProperties,
  addPortfolioProperty,
  removePortfolioProperty,
  type PortfolioProperty,
} from "@/lib/supabase/portfolio";
import { listPropertyReports, type SavedPropertyReport } from "@/lib/supabase/reports";
import { formatAud, formatPercent } from "@/lib/formatCurrency";
import Link from "next/link";
import { useEffect, useState } from "react";

function parseNumber(v: string) {
  const n = parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function PortfolioPropertyRow({
  prop,
  onRemove,
}: {
  prop: PortfolioProperty;
  onRemove: (id: string) => void;
}) {
  const [removing, setRemoving] = useState(false);
  const equity = (prop.current_value ?? 0) - (prop.loan_balance ?? 0);
  const annualRent = (prop.weekly_rent ?? 0) * 52;
  const annualCashflow = annualRent - (prop.annual_expenses ?? 0);

  async function handleRemove() {
    if (!confirm("Remove this property from your portfolio?")) return;
    setRemoving(true);
    const res = await removePortfolioProperty(prop.id);
    if (res.ok) onRemove(prop.id);
    else { setRemoving(false); alert(res.message); }
  }

  return (
    <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white line-clamp-1">{prop.label || "Property"}</h3>
          {prop.property_report_id && (
            <Link
              href={`/reports/${prop.property_report_id}`}
              className="mt-0.5 block text-[10px] text-violet-400 transition hover:text-violet-300"
            >
              View saved report →
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="shrink-0 rounded-lg border border-red-500/25 bg-red-950/20 px-2.5 py-1.5 text-xs font-medium text-red-300 transition hover:border-red-500/40 hover:bg-red-950/30 disabled:opacity-50"
        >
          {removing ? "…" : "Remove"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Value</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{formatAud(prop.current_value ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Loan balance</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-300">{formatAud(prop.loan_balance ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Equity</p>
          <p className={`mt-0.5 text-sm font-semibold tabular-nums ${equity >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatAud(equity)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Annual cashflow</p>
          <p className={`mt-0.5 text-sm font-semibold tabular-nums ${annualCashflow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {formatAud(annualCashflow)}/yr
          </p>
        </div>
      </div>
      {prop.ownership_percentage != null && prop.ownership_percentage !== 100 && (
        <p className="mt-2 text-[10px] text-zinc-600">Ownership: {prop.ownership_percentage}%</p>
      )}
    </div>
  );
}

export function PortfolioClient() {
  const { user, loading, openEarlyAccessModal } = useAuth();
  const [properties, setProperties] = useState<PortfolioProperty[]>([]);
  const [savedReports, setSavedReports] = useState<SavedPropertyReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Add form
  const [label, setLabel] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [loanBalance, setLoanBalance] = useState("");
  const [weeklyRent, setWeeklyRent] = useState("");
  const [annualExpenses, setAnnualExpenses] = useState("");
  const [ownershipPct, setOwnershipPct] = useState("100");
  const [linkedReportId, setLinkedReportId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user) {
      const t = setTimeout(() => setDataLoading(false), 0);
      return () => clearTimeout(t);
    }
    async function load() {
      const [pRes, rRes] = await Promise.all([
        listPortfolioProperties(),
        listPropertyReports(),
      ]);
      if (pRes.ok) setProperties(pRes.properties);
      if (rRes.ok) setSavedReports(rRes.reports);
      setDataLoading(false);
    }
    void load();
  }, [user]);

  // Auto-fill form when a saved report is selected
  function handleReportSelect(reportId: string) {
    setLinkedReportId(reportId);
    const report = savedReports.find((r) => r.id === reportId);
    if (!report) return;
    if (report.property_name) setLabel(report.property_name);
    if (report.purchase_price != null) setCurrentValue(String(report.purchase_price));
    if (report.weekly_rent != null) setWeeklyRent(String(report.weekly_rent));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user) { openEarlyAccessModal(); return; }
    const errors: Record<string, string> = {};
    const cv = parseNumber(currentValue);
    const lb = parseNumber(loanBalance);
    const wr = parseNumber(weeklyRent);
    const ae = parseNumber(annualExpenses);
    const op = parseNumber(ownershipPct);
    if (!label.trim()) errors.label = "Please enter a label.";
    if (!Number.isFinite(cv) || cv < 0) errors.currentValue = "Enter a valid current value.";
    if (!Number.isFinite(lb) || lb < 0) errors.loanBalance = "Enter a valid loan balance (0 if no loan).";
    if (!Number.isFinite(wr) || wr < 0) errors.weeklyRent = "Enter a valid weekly rent (0 if vacant).";
    if (!Number.isFinite(ae) || ae < 0) errors.annualExpenses = "Enter a valid annual expenses figure.";
    if (!Number.isFinite(op) || op <= 0 || op > 100) errors.ownershipPct = "Ownership must be between 1 and 100.";
    if (Object.keys(errors).length > 0) { setAddErrors(errors); return; }
    setAddErrors({});
    setAdding(true);
    const res = await addPortfolioProperty({
      propertyReportId: linkedReportId || null,
      label: label.trim(),
      currentValue: cv,
      loanBalance: lb,
      weeklyRent: wr,
      annualExpenses: ae,
      ownershipPercentage: op,
    });
    setAdding(false);
    if (!res.ok) { setAddErrors({ form: res.message }); return; }
    const listRes = await listPortfolioProperties();
    if (listRes.ok) setProperties(listRes.properties);
    setLabel(""); setCurrentValue(""); setLoanBalance(""); setWeeklyRent(""); setAnnualExpenses(""); setOwnershipPct("100"); setLinkedReportId("");
  }

  function handleRemove(id: string) {
    setProperties((prev) => prev.filter((p) => p.id !== id));
  }

  // Portfolio totals
  const totalValue = properties.reduce((s, p) => s + (p.current_value ?? 0), 0);
  const totalLoan = properties.reduce((s, p) => s + (p.loan_balance ?? 0), 0);
  const totalEquity = totalValue - totalLoan;
  const totalAnnualRent = properties.reduce((s, p) => s + (p.weekly_rent ?? 0) * 52, 0);
  const totalAnnualExpenses = properties.reduce((s, p) => s + (p.annual_expenses ?? 0), 0);
  const totalCashflow = totalAnnualRent - totalAnnualExpenses;
  const overallLvr = totalValue > 0 ? (totalLoan / totalValue) * 100 : 0;

  const inputClass = "w-full rounded-xl border border-zinc-700/80 bg-zinc-950/60 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500/60 focus:outline-none focus:ring-4 focus:ring-violet-500/15";
  const labelClass = "mb-1 block text-xs font-medium text-zinc-400";
  const errClass = "mt-1 text-xs text-red-300";

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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Portfolio</p>
          <h1 className="mt-3 text-2xl font-semibold text-white">Sign in to track your portfolio</h1>
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
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-xs font-medium text-violet-400/90 transition hover:text-violet-300">
            ← Dashboard
          </Link>
        </div>

        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">Portfolio</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Your portfolio
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track total value, debt, equity, and cashflow across your properties.
          </p>
        </header>

        {/* Portfolio summary */}
        {properties.length > 0 && (
          <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Total value</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-white">{formatAud(totalValue)}</p>
            </div>
            <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Total equity</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${totalEquity >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatAud(totalEquity)}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Total debt</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-300">{formatAud(totalLoan)}</p>
              <p className="mt-0.5 text-[10px] text-zinc-600">LVR {formatPercent(overallLvr, 1)}</p>
            </div>
            <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Annual cashflow</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums ${totalCashflow >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {formatAud(totalCashflow)}/yr
              </p>
            </div>
          </section>
        )}

        {/* Properties list */}
        {dataLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400" aria-hidden />
          </div>
        ) : properties.length > 0 ? (
          <section className="mb-8 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Properties</h2>
            {properties.map((p) => (
              <PortfolioPropertyRow key={p.id} prop={p} onRemove={handleRemove} />
            ))}
          </section>
        ) : null}

        {/* Add property form */}
        <section className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 p-5">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Add a property
          </h2>
          <form onSubmit={handleAdd} className="space-y-4">
            {savedReports.length > 0 && (
              <div>
                <label className={labelClass} htmlFor="pf-report">
                  Link to a saved report (optional — auto-fills fields)
                </label>
                <select
                  id="pf-report"
                  value={linkedReportId}
                  onChange={(e) => handleReportSelect(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Select a saved report —</option>
                  {savedReports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.property_name || "Untitled"}{r.suburb ? ` — ${r.suburb}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={labelClass} htmlFor="pf-label">Label</label>
              <input
                id="pf-label"
                type="text"
                value={label}
                onChange={(e) => { setAddErrors((e2) => ({ ...e2, label: "" })); setLabel(e.target.value); }}
                placeholder="e.g. 12 Smith St, Fitzroy"
                className={inputClass}
              />
              {addErrors.label && <p className={errClass}>{addErrors.label}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="pf-cv">Current value (AUD)</label>
                <input
                  id="pf-cv"
                  type="text"
                  inputMode="decimal"
                  value={currentValue}
                  onChange={(e) => { setAddErrors((e2) => ({ ...e2, currentValue: "" })); setCurrentValue(e.target.value); }}
                  placeholder="750,000"
                  className={inputClass}
                />
                {addErrors.currentValue && <p className={errClass}>{addErrors.currentValue}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-lb">Loan balance (AUD)</label>
                <input
                  id="pf-lb"
                  type="text"
                  inputMode="decimal"
                  value={loanBalance}
                  onChange={(e) => { setAddErrors((e2) => ({ ...e2, loanBalance: "" })); setLoanBalance(e.target.value); }}
                  placeholder="500,000"
                  className={inputClass}
                />
                {addErrors.loanBalance && <p className={errClass}>{addErrors.loanBalance}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-wr">Weekly rent (AUD)</label>
                <input
                  id="pf-wr"
                  type="text"
                  inputMode="decimal"
                  value={weeklyRent}
                  onChange={(e) => { setAddErrors((e2) => ({ ...e2, weeklyRent: "" })); setWeeklyRent(e.target.value); }}
                  placeholder="550"
                  className={inputClass}
                />
                {addErrors.weeklyRent && <p className={errClass}>{addErrors.weeklyRent}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-ae">Annual expenses (AUD)</label>
                <input
                  id="pf-ae"
                  type="text"
                  inputMode="decimal"
                  value={annualExpenses}
                  onChange={(e) => { setAddErrors((e2) => ({ ...e2, annualExpenses: "" })); setAnnualExpenses(e.target.value); }}
                  placeholder="6,500"
                  className={inputClass}
                />
                {addErrors.annualExpenses && <p className={errClass}>{addErrors.annualExpenses}</p>}
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-op">Ownership % (default 100)</label>
                <input
                  id="pf-op"
                  type="text"
                  inputMode="decimal"
                  value={ownershipPct}
                  onChange={(e) => { setAddErrors((e2) => ({ ...e2, ownershipPct: "" })); setOwnershipPct(e.target.value); }}
                  placeholder="100"
                  className={inputClass}
                />
                {addErrors.ownershipPct && <p className={errClass}>{addErrors.ownershipPct}</p>}
              </div>
            </div>

            {addErrors.form && <p className={errClass} role="alert">{addErrors.form}</p>}

            <button
              type="submit"
              disabled={adding}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500 disabled:opacity-70"
            >
              {adding ? "Adding…" : "Add to portfolio"}
            </button>
          </form>
        </section>

        <p className="mt-10 text-center text-[11px] leading-relaxed text-zinc-600">
          Illustrative only. Not financial advice. Values are manually entered and not verified.
        </p>
      </div>
    </div>
  );
}
