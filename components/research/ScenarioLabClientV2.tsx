"use client";

import { useState } from "react";
import {
  calculateAnnualCashflow,
  calculateBreakEvenWeeklyRent,
  calculateGrossYieldPct,
  calculateLoanBalanceAfterMonths,
  calculateLoanPrincipal,
  calculateMonthlyRepayment,
  calculatePriceToIncomeRatio,
  calculateRepaymentToIncomePct,
} from "@/lib/warehouse/affordability";
import { formatAud, formatPercent } from "@/lib/formatCurrency";
import { formatMoneyOrUnavailable, formatPercentOrUnavailable } from "@/lib/warehouse/formatMetric";
import { AboutThisMetric } from "@/components/research/AboutThisMetric";
import { saveScenarioCase } from "@/lib/supabase/scenarioLabCases";
import { useAuth } from "@/components/auth/AuthProvider";
import { ResearchReportExportButtons } from "@/components/research/ResearchReportExportButtons";
import { buildResearchReportBundle } from "@/lib/export/researchReport";
import { trackEvent } from "@/lib/analytics/events";

type ScenarioCase = {
  id: string;
  label: string;
  depositPercent: number;
  termYears: number;
  ratePercent: number;
  vacancyPercent: number;
  annualExpenses: number;
};

const MAX_CASES = 4;
const DEBT_PATH_YEARS = [0, 5, 10];

function defaultCases(baselineRatePercent: number): ScenarioCase[] {
  return [
    { id: "base", label: "Base case", depositPercent: 20, termYears: 30, ratePercent: baselineRatePercent, vacancyPercent: 2, annualExpenses: 0 },
    { id: "conservative", label: "Conservative", depositPercent: 25, termYears: 30, ratePercent: baselineRatePercent + 1, vacancyPercent: 4, annualExpenses: 0 },
    { id: "stress", label: "Stress", depositPercent: 15, termYears: 30, ratePercent: baselineRatePercent + 2, vacancyPercent: 6, annualExpenses: 0 },
  ];
}

/**
 * Scenario Lab v2 (Sprint 13 WS6) — multi-case affordability/cashflow
 * comparison, built on the same proven pure formulas as v1
 * (lib/warehouse/affordability.ts) plus new loan-balance-path and
 * cashflow formulas added for this workstream. Every forward-looking
 * number here is a labelled SCENARIO against a real recorded median sale
 * price, never a forecast, recommendation, score or ranking. Property
 * price is held constant throughout — the "equity path" below reflects
 * debt paydown only, not an assumed capital growth rate.
 */
export function ScenarioLabClientV2({
  geographyId,
  geographyCode,
  geographyLabel,
  medianSalePrice,
  medianWeeklyRentLatest,
  medianWeeklyHouseholdIncome,
  baselineRatePercent,
  baselineRatePeriod,
  salesConfidence = null,
  rentConfidence = null,
  yieldConfidence = null,
  affordabilityConfidence = null,
  dwellingStockTotal = null,
  approvals12m = null,
  totalPopulation = null,
  priceToIncomeRatio = null,
  latestSalesPeriod = null,
  latestRentPeriod = null,
}: {
  geographyId: string;
  geographyCode: string;
  geographyLabel: string;
  medianSalePrice: number;
  medianWeeklyRentLatest: number | null;
  medianWeeklyHouseholdIncome: number | null;
  baselineRatePercent: number | null;
  baselineRatePeriod: string | null;
  salesConfidence?: string | null;
  rentConfidence?: string | null;
  yieldConfidence?: string | null;
  affordabilityConfidence?: string | null;
  dwellingStockTotal?: number | null;
  approvals12m?: number | null;
  totalPopulation?: number | null;
  priceToIncomeRatio?: number | null;
  latestSalesPeriod?: string | null;
  latestRentPeriod?: string | null;
}) {
  const { user } = useAuth();
  const [cases, setCases] = useState<ScenarioCase[]>(() => defaultCases(baselineRatePercent ?? 6.0));
  const [saveStatus, setSaveStatus] = useState<Record<string, "idle" | "saving" | "saved" | "error">>({});

  function updateCase(id: string, patch: Partial<ScenarioCase>) {
    setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function addCase() {
    if (cases.length >= MAX_CASES) return;
    const base = cases[cases.length - 1];
    setCases((prev) => [...prev, { ...base, id: `case-${Date.now()}`, label: `Scenario ${prev.length + 1}` }]);
  }

  function removeCase(id: string) {
    setCases((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  }

  async function handleSave(c: ScenarioCase) {
    setSaveStatus((prev) => ({ ...prev, [c.id]: "saving" }));
    const result = await saveScenarioCase({
      geographyId,
      geographyCode,
      geographyLabel,
      label: c.label,
      depositPercent: c.depositPercent,
      loanTermYears: c.termYears,
      interestRatePercent: c.ratePercent,
      vacancyPercent: c.vacancyPercent,
      annualExpenses: c.annualExpenses,
      scenarioJson: computeOutputs(c),
    });
    setSaveStatus((prev) => ({ ...prev, [c.id]: result.ok ? "saved" : "error" }));
    if (result.ok) trackEvent({ name: "scenario_calculated", geographyCode, caseCount: cases.length });
  }

  function computeOutputs(c: ScenarioCase) {
    const principal = calculateLoanPrincipal(medianSalePrice, c.depositPercent);
    const monthlyRepayment = calculateMonthlyRepayment(principal, c.ratePercent, c.termYears);
    const grossYieldPct = medianWeeklyRentLatest != null ? calculateGrossYieldPct(medianWeeklyRentLatest, medianSalePrice) : null;
    const netAnnualCashflow =
      medianWeeklyRentLatest != null ? calculateAnnualCashflow(medianWeeklyRentLatest, c.vacancyPercent, monthlyRepayment, c.annualExpenses) : null;
    const breakEvenWeeklyRent = calculateBreakEvenWeeklyRent(monthlyRepayment, c.annualExpenses, c.vacancyPercent);
    const priceToIncomeRatio = medianWeeklyHouseholdIncome ? calculatePriceToIncomeRatio(medianSalePrice, medianWeeklyHouseholdIncome) : null;
    const repaymentToIncomePct = medianWeeklyHouseholdIncome ? calculateRepaymentToIncomePct(monthlyRepayment, medianWeeklyHouseholdIncome) : null;
    const debtPath = DEBT_PATH_YEARS.filter((y) => y <= c.termYears).map((years) => {
      const balance = calculateLoanBalanceAfterMonths(principal, c.ratePercent, c.termYears, years * 12);
      return { years, balance, equity: medianSalePrice - balance };
    });
    return {
      principal,
      monthlyRepayment,
      grossYieldPct,
      netAnnualCashflow,
      breakEvenWeeklyRent,
      priceToIncomeRatio,
      repaymentToIncomePct,
      debtPath,
      depositAmount: medianSalePrice * (c.depositPercent / 100),
    };
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 text-xs leading-relaxed text-amber-200">
        Illustrative scenario modelling only, against {geographyLabel}&apos;s real recorded median sale price
        ({formatAud(medianSalePrice, 0)}
        {medianWeeklyRentLatest != null ? ` and median weekly rent ${formatAud(medianWeeklyRentLatest, 0)}` : ""}). Not
        financial, tax or legal advice. Not a forecast, recommendation, or an estimate of what this property will sell
        for in future. Property price is held constant in every case below — the debt/equity path reflects loan
        paydown only, not an assumed growth rate. Excludes stamp duty, LMI, purchase costs and tax/depreciation.
        <AboutThisMetric geographyId={geographyId} geographyType="suburb" metricFamily="sales" />
        {medianWeeklyRentLatest != null ? (
          <AboutThisMetric geographyId={geographyId} geographyType="suburb" metricFamily="rent" />
        ) : null}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Compare up to {MAX_CASES} scenarios side by side. Each is independently adjustable — deposit, term, rate,
          vacancy and expenses are your own assumptions, never sourced data.
        </p>
        {cases.length < MAX_CASES ? (
          <button
            type="button"
            onClick={addCase}
            className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-600/10 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-600/20"
          >
            + Add scenario
          </button>
        ) : null}
      </div>

      <div className={`grid gap-4 ${cases.length >= 3 ? "lg:grid-cols-3" : cases.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {cases.map((c) => {
          const out = computeOutputs(c);
          const status = saveStatus[c.id] ?? "idle";
          return (
            <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={c.label}
                  onChange={(e) => updateCase(c.id, { label: e.target.value })}
                  aria-label="Scenario name"
                  className="w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-100 hover:border-zinc-700 focus:border-violet-500/60 focus:outline-none"
                />
                {cases.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removeCase(c.id)}
                    aria-label={`Remove ${c.label}`}
                    className="shrink-0 text-xs text-zinc-600 hover:text-rose-300"
                  >
                    ✕
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Deposit ({c.depositPercent}%)</span>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={c.depositPercent}
                    onChange={(e) => updateCase(c.id, { depositPercent: Number(e.target.value) })}
                    className="mt-1 w-full accent-violet-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Loan term ({c.termYears}y)</span>
                  <input
                    type="range"
                    min={15}
                    max={30}
                    step={1}
                    value={c.termYears}
                    onChange={(e) => updateCase(c.id, { termYears: Number(e.target.value) })}
                    className="mt-1 w-full accent-violet-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Interest rate ({c.ratePercent.toFixed(2)}%)</span>
                  <input
                    type="range"
                    min={2}
                    max={12}
                    step={0.05}
                    value={c.ratePercent}
                    onChange={(e) => updateCase(c.id, { ratePercent: Number(e.target.value) })}
                    className="mt-1 w-full accent-violet-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Vacancy ({c.vacancyPercent}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={1}
                    value={c.vacancyPercent}
                    onChange={(e) => updateCase(c.id, { vacancyPercent: Number(e.target.value) })}
                    className="mt-1 w-full accent-violet-500"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-500">Annual expenses ({formatAud(c.annualExpenses, 0)})</span>
                  <input
                    type="range"
                    min={0}
                    max={30000}
                    step={500}
                    value={c.annualExpenses}
                    onChange={(e) => updateCase(c.id, { annualExpenses: Number(e.target.value) })}
                    className="mt-1 w-full accent-violet-500"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800 pt-3 text-xs">
                <div>
                  <p className="text-zinc-500">Loan amount</p>
                  <p className="font-semibold text-zinc-100">{formatAud(out.principal, 0)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Repayment</p>
                  <p className="font-semibold text-zinc-100">{formatAud(out.monthlyRepayment, 0)}/mo</p>
                </div>
                <div>
                  <p className="text-zinc-500">Gross yield</p>
                  <p className="font-semibold text-zinc-100">{formatPercentOrUnavailable(out.grossYieldPct, 2)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Net cash flow (pre-tax)</p>
                  <p className={`font-semibold ${out.netAnnualCashflow != null && out.netAnnualCashflow < 0 ? "text-rose-300" : "text-zinc-100"}`}>
                    {out.netAnnualCashflow != null ? `${formatAud(out.netAnnualCashflow, 0)}/yr` : "Unavailable"}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Required cash (deposit)</p>
                  <p className="font-semibold text-zinc-100">{formatAud(out.depositAmount, 0)}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Break-even weekly rent</p>
                  <p className="font-semibold text-zinc-100">{out.breakEvenWeeklyRent != null ? formatAud(out.breakEvenWeeklyRent, 0) : "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Price-to-income</p>
                  <p className="font-semibold text-zinc-100">{out.priceToIncomeRatio != null ? out.priceToIncomeRatio.toFixed(1) : "Unavailable"}</p>
                </div>
                <div>
                  <p className="text-zinc-500">Repayment-to-income</p>
                  <p className="font-semibold text-zinc-100">{formatPercentOrUnavailable(out.repaymentToIncomePct, 1)}</p>
                </div>
              </div>

              <div className="mt-3 border-t border-zinc-800 pt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                  Debt &amp; equity path (price held constant)
                </p>
                <table className="w-full text-[11px]">
                  <thead className="text-zinc-600">
                    <tr>
                      <th className="pr-2 text-left font-normal">Year</th>
                      <th className="pr-2 text-left font-normal">Loan balance</th>
                      <th className="text-left font-normal">Equity (paydown only)</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-300">
                    {out.debtPath.map((row) => (
                      <tr key={row.years}>
                        <td className="pr-2 py-0.5">{row.years}</td>
                        <td className="pr-2 py-0.5">{formatMoneyOrUnavailable(row.balance, 0)}</td>
                        <td className="py-0.5">{formatMoneyOrUnavailable(row.equity, 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {user ? (
                <button
                  type="button"
                  onClick={() => handleSave(c)}
                  disabled={status === "saving"}
                  className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition hover:border-violet-500/50 hover:text-violet-200 disabled:opacity-50"
                >
                  {status === "saving" ? "Saving…" : status === "saved" ? "Saved ✓" : status === "error" ? "Save failed — try again" : "Save this scenario"}
                </button>
              ) : (
                <p className="mt-3 text-center text-[11px] text-zinc-600">Sign in to save this scenario.</p>
              )}
            </div>
          );
        })}
      </div>

      <ResearchReportExportButtons
        filenameBase={`propellect-scenario-${geographyCode}`}
        bundle={buildResearchReportBundle({
          area: {
            geographyLabel,
            geographyCode,
            medianSalePrice12m: medianSalePrice,
            salesConfidence,
            medianWeeklyRent: medianWeeklyRentLatest,
            rentConfidence,
            grossYieldPct: medianWeeklyRentLatest != null ? calculateGrossYieldPct(medianWeeklyRentLatest, medianSalePrice) : null,
            yieldConfidence,
            dwellingStockTotal,
            approvals12m,
            totalPopulation,
            medianWeeklyHouseholdIncome,
            priceToIncomeRatio,
            affordabilityConfidence,
            latestSalesPeriod,
            latestRentPeriod,
          },
          scenarios: cases.map((c) => {
            const out = computeOutputs(c);
            return {
              label: c.label,
              depositPercent: c.depositPercent,
              loanTermYears: c.termYears,
              interestRatePercent: c.ratePercent,
              vacancyPercent: c.vacancyPercent,
              annualExpenses: c.annualExpenses,
              loanAmount: out.principal,
              monthlyRepayment: out.monthlyRepayment,
              netAnnualCashflow: out.netAnnualCashflow,
              breakEvenWeeklyRent: out.breakEvenWeeklyRent,
            };
          }),
        })}
      />

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3 text-[11px] leading-relaxed text-zinc-500">
        <p className="mb-1 font-semibold text-zinc-400">Sourced vs. assumed</p>
        <p>
          Median sale price{medianWeeklyRentLatest != null ? " and median weekly rent" : ""} come from {geographyLabel}
          &apos;s real recorded market snapshot — see &quot;About this metric&quot; above for source and confidence.
          {baselineRatePercent != null ? ` The default interest rate starts from the RBA baseline (${formatPercent(baselineRatePercent, 2)}${baselineRatePeriod ? `, ${baselineRatePeriod}` : ""}).` : ""}{" "}
          Deposit, loan term, interest rate, vacancy and expenses in every case are your own editable assumptions, not
          sourced data.
        </p>
      </div>
    </div>
  );
}
