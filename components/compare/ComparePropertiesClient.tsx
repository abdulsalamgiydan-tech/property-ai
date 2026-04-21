"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { GatedBlur } from "@/components/auth/GatedBlur";
import { UnlockCard } from "@/components/auth/UnlockCard";
import {
  CompareProjectionCharts,
  type ChartCompareTab,
} from "@/components/compare/CompareProjectionCharts";
import { ComparePropertyFormPanel } from "@/components/compare/ComparePropertyFormPanel";
import { useComparePropertyFormSlice } from "@/components/compare/useComparePropertyFormSlice";
import { InfoButton, RequiredMark } from "@/components/ui/InfoButton";
import { buildPropertyAnalysisInputFromForm } from "@/lib/analysePropertyForm";
import {
  buildComparisonCategories,
  buildComparisonInsightBullets,
  buildWhatWouldChangeBullets,
  categoryWinnerLabel,
  type CategoryWinner,
} from "@/lib/comparePropertyInsights";
import { formatAud, formatNumberGb, formatPercent } from "@/lib/formatCurrency";
import {
  DEFAULT_INVESTMENT_STRATEGY,
  INVESTMENT_STRATEGIES,
  type InvestmentStrategyId,
} from "@/lib/investmentStrategy";
import { loadCompareDraft, saveCompareDraft } from "@/lib/auth/toolDraftStorage";
import {
  analyzeProperty,
  DEAL_SCORE_AMBER_MIN,
  DEAL_SCORE_GREEN_MIN,
  type PropertyAnalysisInputs,
  type PropertyAnalysisResult,
} from "@/lib/propertyAnalysis";
import {
  buildAmortisationScheduleYearly,
  buildCashflowProjectionSeries,
  buildPropertyValueVsMortgageSeries,
} from "@/lib/projections";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

const COMPARE_MIN_MS = 480;

function parseNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function ComparePropertiesClient() {
  const formA = useComparePropertyFormSlice();
  const formB = useComparePropertyFormSlice();
  const [investmentStrategy, setInvestmentStrategy] = useState<InvestmentStrategyId>(
    DEFAULT_INVESTMENT_STRATEGY
  );
  const [formErrorsA, setFormErrorsA] = useState<Record<string, string>>({});
  const [formErrorsB, setFormErrorsB] = useState<Record<string, string>>({});
  const [comparedInputsA, setComparedInputsA] = useState<PropertyAnalysisInputs | null>(null);
  const [comparedInputsB, setComparedInputsB] = useState<PropertyAnalysisInputs | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [resultsKey, setResultsKey] = useState(0);
  const [valueChartTab, setValueChartTab] = useState<ChartCompareTab>("overlay");
  const [cashflowChartTab, setCashflowChartTab] = useState<ChartCompareTab>("overlay");

  const { showFullToolAccess, openEarlyAccessModal } = useAuth();
  const lastComparedRef = useRef<{
    a: PropertyAnalysisInputs;
    b: PropertyAnalysisInputs;
  } | null>(null);
  const compareDraftHydratedRef = useRef(false);

  const currentYear = new Date().getFullYear();

  const resultA = useMemo(
    () =>
      comparedInputsA
        ? analyzeProperty({ ...comparedInputsA, strategy: investmentStrategy })
        : null,
    [comparedInputsA, investmentStrategy]
  );
  const resultB = useMemo(
    () =>
      comparedInputsB
        ? analyzeProperty({ ...comparedInputsB, strategy: investmentStrategy })
        : null,
    [comparedInputsB, investmentStrategy]
  );

  const statusStyles: Record<
    PropertyAnalysisResult["status"],
    { card: string; ring: string; pill: string; shadow: string }
  > = {
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

  function clearFieldErrorA(key: string) {
    setFormErrorsA((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function clearFieldErrorB(key: string) {
    setFormErrorsB((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function runCompare() {
    const builtA = buildPropertyAnalysisInputFromForm(
      formA.fieldsRef.current,
      investmentStrategy,
      currentYear
    );
    const builtB = buildPropertyAnalysisInputFromForm(
      formB.fieldsRef.current,
      investmentStrategy,
      currentYear
    );

    let hasErr = false;
    if (!builtA.ok) {
      setFormErrorsA(builtA.errors);
      hasErr = true;
    } else {
      setFormErrorsA({});
    }
    if (!builtB.ok) {
      setFormErrorsB(builtB.errors);
      hasErr = true;
    } else {
      setFormErrorsB({});
    }

    if (hasErr || !builtA.ok || !builtB.ok) {
      setComparedInputsA(null);
      setComparedInputsB(null);
      return;
    }

    setIsComparing(true);
    setComparedInputsA(null);
    setComparedInputsB(null);
    const started = performance.now();
    const inputA = builtA.input;
    const inputB = builtB.input;
    lastComparedRef.current = { a: inputA, b: inputB };
    const elapsed = performance.now() - started;
    const wait = Math.max(0, COMPARE_MIN_MS - elapsed);
    window.setTimeout(() => {
      setComparedInputsA(inputA);
      setComparedInputsB(inputB);
      setResultsKey((k) => k + 1);
      setIsComparing(false);
    }, wait);
  }

  const projectionBundle = useMemo(() => {
    if (!resultA || !resultB) return null;
    const egA = parseNumber(formA.expensesGrowthRate);
    const egB = parseNumber(formB.expensesGrowthRate);
    const expensesGrowthA = Number.isFinite(egA) ? egA : 2.5;
    const expensesGrowthB = Number.isFinite(egB) ? egB : 2.5;

    const scheduleA = buildAmortisationScheduleYearly(
      resultA.loan,
      resultA.interestRatePercent,
      30,
      resultA.isInterestOnly,
      resultA.loanTermYears
    );
    const scheduleB = buildAmortisationScheduleYearly(
      resultB.loan,
      resultB.interestRatePercent,
      30,
      resultB.isInterestOnly,
      resultB.loanTermYears
    );

    const valueA = buildPropertyValueVsMortgageSeries({
      purchasePrice: resultA.purchasePrice,
      suburbGrowthRatePercent: resultA.suburbGrowthPercent,
      amortisation: scheduleA,
    });
    const valueB = buildPropertyValueVsMortgageSeries({
      purchasePrice: resultB.purchasePrice,
      suburbGrowthRatePercent: resultB.suburbGrowthPercent,
      amortisation: scheduleB,
    });

    const cashA = buildCashflowProjectionSeries({
      weeklyRent: resultA.weeklyRent,
      rentalGrowthRatePercent: resultA.rentalGrowthRatePercent,
      annualExpenses: resultA.annualExpenses,
      expensesGrowthRatePercent: expensesGrowthA,
      amortisation: scheduleA,
      buildingDepreciation: resultA.depreciation.buildingDepreciation,
      fixturesEstimate: resultA.fixturesEstimate,
      marginalTaxRate: resultA.marginalRate,
      vacancyPercent: resultA.vacancyPercent,
      pmFeePercent: resultA.pmFeePercent,
    });
    const cashB = buildCashflowProjectionSeries({
      weeklyRent: resultB.weeklyRent,
      rentalGrowthRatePercent: resultB.rentalGrowthRatePercent,
      annualExpenses: resultB.annualExpenses,
      expensesGrowthRatePercent: expensesGrowthB,
      amortisation: scheduleB,
      buildingDepreciation: resultB.depreciation.buildingDepreciation,
      fixturesEstimate: resultB.fixturesEstimate,
      marginalTaxRate: resultB.marginalRate,
      vacancyPercent: resultB.vacancyPercent,
      pmFeePercent: resultB.pmFeePercent,
    });

    const valueOverlay = valueA.map((row, i) => {
      const vb = valueB[i];
      return {
        year: row.year,
        propertyValueA: row.propertyValue,
        mortgageBalanceA: row.mortgageBalance,
        propertyValueB: vb?.propertyValue ?? 0,
        mortgageBalanceB: vb?.mortgageBalance ?? 0,
      };
    });

    const cashflowOverlay = cashA.map((row, i) => {
      const cb = cashB[i];
      return {
        year: row.year,
        afterTaxCashflowA: row.afterTaxCashflow,
        afterTaxCashflowB: cb?.afterTaxCashflow ?? 0,
      };
    });

    return {
      valueA,
      valueB,
      cashA,
      cashB,
      valueOverlay,
      cashflowOverlay,
    };
  }, [formA.expensesGrowthRate, formB.expensesGrowthRate, resultA, resultB]);

  const categories = useMemo(() => {
    if (!resultA || !resultB) return [];
    return buildComparisonCategories(resultA, resultB);
  }, [resultA, resultB]);

  const insightBullets = useMemo(() => {
    if (!resultA || !resultB) return [];
    return buildComparisonInsightBullets(resultA, resultB, investmentStrategy);
  }, [investmentStrategy, resultA, resultB]);

  const whatWouldChange = useMemo(() => {
    if (!resultA || !resultB) return [];
    return buildWhatWouldChangeBullets(resultA, resultB, investmentStrategy);
  }, [investmentStrategy, resultA, resultB]);

  const compareFormFingerprint = JSON.stringify({
    a: formA.snapshot(),
    b: formB.snapshot(),
  });

  useEffect(() => {
    if (compareDraftHydratedRef.current) return;
    compareDraftHydratedRef.current = true;
    const d = loadCompareDraft();
    if (!d) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time localStorage hydrate */
    setInvestmentStrategy(d.investmentStrategy);
    formA.hydrate(d.propertyA);
    formB.hydrate(d.propertyB);
    setValueChartTab(d.valueChartTab);
    setCashflowChartTab(d.cashflowChartTab);
    if (d.savedInputA && d.savedInputB) {
      lastComparedRef.current = { a: d.savedInputA, b: d.savedInputB };
      setComparedInputsA(d.savedInputA);
      setComparedInputsB(d.savedInputB);
      setResultsKey((k) => k + 1);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [formA, formB]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      saveCompareDraft({
        v: 1,
        investmentStrategy,
        propertyA: formA.snapshot(),
        propertyB: formB.snapshot(),
        savedInputA: lastComparedRef.current?.a ?? null,
        savedInputB: lastComparedRef.current?.b ?? null,
        valueChartTab,
        cashflowChartTab,
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [
    investmentStrategy,
    valueChartTab,
    cashflowChartTab,
    compareFormFingerprint,
    comparedInputsA,
    comparedInputsB,
    formA,
    formB,
  ]);

  function renderCompareProjectionBlocks() {
    if (!projectionBundle) return null;
    return (
      <CompareProjectionCharts
        bundle={projectionBundle}
        valueChartTab={valueChartTab}
        onValueChartTab={setValueChartTab}
        cashflowChartTab={cashflowChartTab}
        onCashflowChartTab={setCashflowChartTab}
      />
    );
  }

  function winnerPillClass(w: CategoryWinner): string {
    if (w === "draw") return "border-zinc-600/60 bg-zinc-800/50 text-zinc-300";
    if (w === "a") return "border-violet-500/35 bg-violet-950/40 text-violet-100";
    return "border-cyan-500/30 bg-cyan-950/35 text-cyan-100";
  }

  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-violet-400/90 transition hover:text-violet-300"
        >
          ← Back to tools
        </Link>

        <header className="mt-6 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-400">
            SIDE-BY-SIDE COMPARISON
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Compare 2 Properties
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Compare two Australian investment properties side by side using cashflow, tax, depreciation and
            long-term projections.
          </p>
          <p className="mt-2 text-xs text-zinc-500">Built for Australian residential property investors.</p>
        </header>

        <section
          className="mt-10 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-xl shadow-black/30 backdrop-blur-md sm:p-8"
          aria-label="Investment strategy for comparison"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium text-zinc-200">
                  Investment Strategy
                  <RequiredMark />
                </span>
                <InfoButton label="Investment strategy">
                  Growth emphasises capital growth in the score; Yield emphasises rent and after-tax cashflow;
                  Balanced blends both. Inputs stay the same — only the weighting of the score changes, for
                  both properties.
                </InfoButton>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Applies equally to Property A and Property B. Does not change modelled dollar amounts — only
                how the deal score is blended.
              </p>
            </div>
          </div>
          <div
            className="mt-4 flex overflow-hidden rounded-xl border border-zinc-600/80 bg-zinc-900/60"
            role="group"
            aria-label="Investment strategy"
          >
            {(
              [
                { label: "Growth", value: "growth" },
                { label: "Balanced", value: "balanced" },
                { label: "Yield", value: "yield" },
              ] as const
            ).map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setInvestmentStrategy(value)}
                className={`flex-1 py-2.5 text-sm font-medium transition ${
                  investmentStrategy === value ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-10 lg:items-start">
          <ComparePropertyFormPanel
            idPrefix="cmp-a"
            panelTitle="Property A"
            form={formA}
            formErrors={formErrorsA}
            onClearField={clearFieldErrorA}
            disabled={isComparing}
          />
          <ComparePropertyFormPanel
            idPrefix="cmp-b"
            panelTitle="Property B"
            form={formB}
            formErrors={formErrorsB}
            onClearField={clearFieldErrorB}
            disabled={isComparing}
            onCopyFromA={() => formB.hydrate(formA.snapshot())}
          />
        </div>

        <div className="mt-10 flex justify-center">
          <button
            type="button"
            onClick={runCompare}
            disabled={isComparing}
            aria-busy={isComparing}
            className="flex w-full max-w-xl items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 enabled:active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
          >
            {isComparing ? (
              <>
                <span
                  className="size-5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                  aria-hidden
                />
                Comparing…
              </>
            ) : (
              "Compare Properties"
            )}
          </button>
        </div>

        {isComparing && !resultA && !resultB ? (
          <output
            className="mx-auto mt-10 flex max-w-2xl flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20 px-6 py-14 text-center"
            aria-live="polite"
          >
            <span
              className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400"
              aria-hidden
            />
            <span className="text-sm font-medium text-violet-200">Crunching both properties…</span>
          </output>
        ) : null}

        {!isComparing && !resultA && !resultB ? (
          <p className="mx-auto mt-10 max-w-xl text-center text-sm text-zinc-500">
            Enter details for both properties, then run <span className="font-medium text-zinc-300">Compare Properties</span>{" "}
            to see scores, key metrics and charts.
          </p>
        ) : null}

        {resultA && resultB ? (
          <div
            key={resultsKey}
            className="mt-14 space-y-10 border-t border-zinc-800/80 pt-14"
            aria-live="polite"
          >
            <section aria-label="Quick comparison summary">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Quick comparison
              </h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(
                  [
                    { label: "Property A", r: resultA },
                    { label: "Property B", r: resultB },
                  ] as const
                ).map(({ label, r }) => (
                  <div
                    key={label}
                    className={`rounded-2xl border p-5 backdrop-blur-sm ${statusStyles[r.status].card} ${statusStyles[r.status].ring} ${statusStyles[r.status].shadow}`}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      {label}
                    </p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-white">
                      {formatNumberGb(r.score)}
                    </p>
                    <div className="mt-3 flex justify-start">
                      <span
                        aria-label={`Colour status for ${label}`}
                        className={`inline-block h-3.5 w-28 rounded-full shadow-lg ${statusStyles[r.status].pill}`}
                      />
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                      Green from {formatNumberGb(DEAL_SCORE_GREEN_MIN)}, amber{" "}
                      {formatNumberGb(DEAL_SCORE_AMBER_MIN)}–{formatNumberGb(DEAL_SCORE_GREEN_MIN - 1)}, red below{" "}
                      {formatNumberGb(DEAL_SCORE_AMBER_MIN)}. Illustrative only.
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 shadow-xl shadow-black/25 backdrop-blur-md sm:p-7">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Key metrics
              </h2>
              <p className="mt-1 text-[11px] text-zinc-500">
                Year-one figures unless noted. Same strategy weighting:{" "}
                <span className="font-medium text-zinc-400">
                  {INVESTMENT_STRATEGIES[investmentStrategy].label}
                </span>
                .
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-700/50">
                <table className="w-full min-w-[40rem] border-collapse text-left text-sm text-zinc-300">
                  <thead>
                    <tr className="border-b border-zinc-600/80 bg-zinc-950/60 text-[10px] uppercase tracking-wide text-zinc-400">
                      <th className="px-4 py-3 font-semibold">Metric</th>
                      <th className="px-4 py-3 font-semibold">Property A</th>
                      <th className="px-4 py-3 font-semibold">Property B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["Gross yield", formatPercent(resultA.grossYieldPercent, 2), formatPercent(resultB.grossYieldPercent, 2)],
                        ["Pre-tax cashflow", formatAud(resultA.preTaxCashflow), formatAud(resultB.preTaxCashflow)],
                        ["Estimated tax benefit", formatAud(resultA.taxBenefit), formatAud(resultB.taxBenefit)],
                        ["After-tax cashflow", formatAud(resultA.afterTaxCashflow), formatAud(resultB.afterTaxCashflow)],
                        [
                          "Estimated depreciation",
                          formatAud(resultA.depreciation.totalDepreciation),
                          formatAud(resultB.depreciation.totalDepreciation),
                        ],
                        ["Upfront cash required", formatAud(resultA.totalCashRequired), formatAud(resultB.totalCashRequired)],
                        ["Score", formatNumberGb(resultA.score), formatNumberGb(resultB.score)],
                      ] as const
                    ).map(([metric, a, b]) => (
                      <tr key={metric} className="border-b border-zinc-800/80 last:border-0">
                        <td className="px-4 py-3 text-zinc-400">{metric}</td>
                        <td className="px-4 py-3 tabular-nums font-medium text-zinc-100">{a}</td>
                        <td className="px-4 py-3 tabular-nums font-medium text-zinc-100">{b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {renderCompareProjectionBlocks()}

            <GatedBlur
              locked={!showFullToolAccess}
              overlay={
                <UnlockCard
                  title="Unlock the full decision view"
                  body={
                    <>
                      <p className="text-sm text-zinc-300">
                        You&apos;ve seen the numbers. Get free early access to unlock:
                      </p>
                      <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-zinc-300 marker:text-zinc-600">
                        <li>key risks</li>
                        <li>what needs to improve</li>
                        <li>deeper decision guidance</li>
                      </ul>
                    </>
                  }
                  accountHint="Create a free account — both properties stay in your forms."
                  onCtaClick={openEarlyAccessModal}
                />
              }
            >
              <div className="space-y-10">
            <section className="rounded-2xl border border-zinc-600/50 bg-zinc-950/40 p-5 sm:p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Which one looks stronger?
              </h2>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                {insightBullets.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-zinc-600/50 bg-zinc-950/40 p-5 sm:p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Winner by category
              </h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-700/50 bg-zinc-900/50 px-4 py-3"
                  >
                    <span className="text-sm text-zinc-400">{c.label}</span>
                    <span
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${winnerPillClass(c.winner)}`}
                    >
                      {categoryWinnerLabel(c.winner)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-600/50 bg-zinc-950/40 p-5 sm:p-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                What would change the result?
              </h2>
              <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                {whatWouldChange.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </section>


              </div>
            </GatedBlur>
          </div>
        ) : null}

        <p className="mx-auto mt-12 max-w-3xl text-center text-[11px] leading-relaxed text-zinc-500">
          Illustrative model only. Not financial, tax, or legal advice. Depreciation and tax benefits are rough
          estimates only and should be confirmed with a qualified quantity surveyor and tax adviser.
        </p>
      </div>
    </div>
  );
}
