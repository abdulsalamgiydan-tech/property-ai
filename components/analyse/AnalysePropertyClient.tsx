"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { GatedBlur } from "@/components/auth/GatedBlur";
import { UnlockCard } from "@/components/auth/UnlockCard";
import {
  FormSectionHeading,
  InfoButton,
  RequiredMark,
} from "@/components/ui/InfoButton";
import {
  keyRiskBullets,
  neutralPreTaxDepositPercent,
  neutralPreTaxInterestRatePercent,
  whatDealLooksLikeBullets,
} from "@/lib/advisoryInsights";
import { AU_STATES } from "@/lib/constants/au";
import {
  buildPropertyAnalysisInputFromForm,
  type AnalysePropertyFormFields,
} from "@/lib/analysePropertyForm";
import {
  DEFAULT_INVESTMENT_STRATEGY,
  INVESTMENT_STRATEGIES,
  type InvestmentStrategyId,
} from "@/lib/investmentStrategy";
import {
  analyzeProperty,
  DEAL_ANALYSER_DEFAULT_PURCHASE_DATE,
  DEAL_SCORE_AMBER_MIN,
  DEAL_SCORE_GREEN_MIN,
  PURCHASE_COSTS_ALLOWANCE_AUD,
  type PropertyAnalysisInputs,
  type PropertyAnalysisResult,
} from "@/lib/propertyAnalysis";
import {
  buildAmortisationScheduleYearly,
  buildCashflowProjectionSeriesBudget2026,
  buildPropertyValueVsMortgageSeries,
  formatChartAud,
  formatChartYear,
} from "@/lib/projections";
import {
  classifyTaxScenario,
  taxScenarioLabel,
  type TaxScenarioId,
} from "@/lib/tax/budget2026Scenario";
import {
  formatAud,
  formatInputNumber,
  formatNumberGb,
  formatPercent,
} from "@/lib/formatCurrency";
import {
  formatKeySnapshotAud,
  snapshotPerPeriodPhrase,
  snapshotPeriodToggleLabel,
  type SnapshotPeriod,
} from "@/lib/keySnapshotDisplay";
import {
  getSuggestedAssumptionsForSuburb,
  SUBURB_SUGGESTION_BANNER,
} from "@/lib/suburbAssumptions";
import { loadAnalyseDraft, saveAnalyseDraft } from "@/lib/auth/toolDraftStorage";
import { SaveReportButton } from "@/components/analyse/SaveReportButton";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ANALYSE_MIN_MS = 480;
const PROJECTION_SAMPLE_YEARS = [0, 1, 5, 10, 20, 30] as const;

function localIsoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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

type CashflowView = "annual" | "weekly" | "monthly";

const SNAPSHOT_PERIOD_OPTIONS = ["annual", "weekly", "monthly"] as const satisfies readonly SnapshotPeriod[];

type AnalysisResult = PropertyAnalysisResult;

function parseNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export function AnalysePropertyClient() {
  const [suburb, setSuburb] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [state, setState] = useState("QLD");
  const [suburbGrowthPercent, setSuburbGrowthPercent] = useState("5");
  const [vacancyPercent, setVacancyPercent] = useState("2");
  const [purchasePrice, setPurchasePrice] = useState("550,000");
  const [weeklyRent, setWeeklyRent] = useState("520");
  const [rentalGrowthRate, setRentalGrowthRate] = useState("3");
  const [interestRate, setInterestRate] = useState("6.2");
  const [isInterestOnly, setIsInterestOnly] = useState(false);
  const [investmentStrategy, setInvestmentStrategy] = useState<InvestmentStrategyId>(
    DEFAULT_INVESTMENT_STRATEGY
  );
  const [loanTermYears, setLoanTermYears] = useState("30");
  const [depositPercent, setDepositPercent] = useState("20");
  const [annualExpenses, setAnnualExpenses] = useState("6,500");
  const [expensesGrowthRate, setExpensesGrowthRate] = useState("2.5");
  const [pmFeePercent, setPmFeePercent] = useState("8");
  const [preTaxSalary, setPreTaxSalary] = useState("120,000");
  const [yearBuilt, setYearBuilt] = useState("2010");
  const [buildingValuePercent, setBuildingValuePercent] = useState("80");
  const [fixturesEstimate, setFixturesEstimate] = useState("10,000");
  const [purchaseDateStr, setPurchaseDateStr] = useState(localIsoDate);
  const [propertyType, setPropertyType] = useState<"established" | "new_build">("established");
  const [otherRentalIncome, setOtherRentalIncome] = useState("0");
  const [cpiAssumptionPercent, setCpiAssumptionPercent] = useState("3");
  const [saleDateStr, setSaleDateStr] = useState("");
  const [salePriceStr, setSalePriceStr] = useState("");
  const [holdingCostsStr, setHoldingCostsStr] = useState("");
  const [isPreCGTAsset, setIsPreCGTAsset] = useState(false);
  const [marketValueAt2027Str, setMarketValueAt2027Str] = useState("");
  const [resultsTab, setResultsTab] = useState<"analysis" | "compare">("analysis");

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [resultAnimKey, setResultAnimKey] = useState(0);
  const [cashflowView, setCashflowView] = useState<CashflowView>("annual");
  const [snapshotPeriod, setSnapshotPeriod] = useState<SnapshotPeriod>("annual");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  /** True when growth / vacancy / rental growth were filled from suburb-based suggestions. */
  const [suburbSuggestionActive, setSuburbSuggestionActive] = useState(false);

  const { showFullToolAccess, openEarlyAccessModal } = useAuth();
  const lastSavedInputsRef = useRef<PropertyAnalysisInputs | null>(null);
  // Mirrors lastSavedInputsRef.current for the one place (SaveReportButton's
  // props below) that needs this value during render — refs can't be read
  // during render (react-hooks/refs), only from effects/handlers, so this
  // state is set alongside the ref at every assignment site.
  const [lastSavedInputs, setLastSavedInputs] = useState<PropertyAnalysisInputs | null>(null);
  const draftHydratedRef = useRef(false);

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-zinc-600/80 bg-zinc-900/60 px-3 py-2.5 text-base text-zinc-100 shadow-inner outline-none ring-violet-500/0 transition placeholder:text-zinc-500 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20";
  const labelClass = "text-sm font-medium text-zinc-200";
  const helperClass = "mt-1 block text-xs text-zinc-500";
  const fieldErrClass =
    "border-amber-500/40 ring-1 ring-amber-500/10 focus:border-amber-500/55 focus:ring-amber-500/20";
  const fieldErrMsgClass =
    "mt-1.5 rounded-md border border-amber-500/20 bg-amber-950/20 px-2.5 py-1.5 text-xs leading-snug text-zinc-200";
  const currentYear = new Date().getFullYear();

  const formFieldsRef = useRef<AnalysePropertyFormFields>({} as AnalysePropertyFormFields);
  useLayoutEffect(() => {
    formFieldsRef.current = {
      purchasePrice,
      weeklyRent,
      rentalGrowthRate,
      interestRate,
      depositPercent,
      annualExpenses,
      expensesGrowthRate,
      suburbGrowthPercent,
      vacancyPercent,
      preTaxSalary,
      yearBuilt,
      buildingValuePercent,
      fixturesEstimate,
      pmFeePercent,
      loanTermYears,
      suburb,
      state,
      isInterestOnly,
      purchaseDate: purchaseDateStr,
      propertyType,
      otherRentalIncome,
      cpiAssumptionPercent,
      saleDate: saleDateStr,
      salePrice: salePriceStr,
      holdingCostsCapitalised: holdingCostsStr,
      isPreCGTAsset,
      marketValueAt1July2027: marketValueAt2027Str,
    };
  });

  useEffect(() => {
    setResult((prev) => {
      if (!prev) return prev;
      const built = buildPropertyAnalysisInputFromForm(
        formFieldsRef.current,
        investmentStrategy,
        currentYear
      );
      if (!built.ok) return prev;
      const next = analyzeProperty(built.input);
      lastSavedInputsRef.current = built.input;
      setLastSavedInputs(built.input);
      return next;
    });
  }, [investmentStrategy, currentYear]);

  /* Restore draft from localStorage once on mount (client-only). */
  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    const d = loadAnalyseDraft();
    if (!d) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time hydration from localStorage */
    setSuburb(d.suburb);
    setPropertyAddress(d.propertyAddress);
    setState(d.state);
    setSuburbGrowthPercent(d.suburbGrowthPercent);
    setVacancyPercent(d.vacancyPercent);
    setPurchasePrice(d.purchasePrice);
    setWeeklyRent(d.weeklyRent);
    setRentalGrowthRate(d.rentalGrowthRate);
    setInterestRate(d.interestRate);
    setIsInterestOnly(d.isInterestOnly);
    setInvestmentStrategy(d.investmentStrategy);
    setLoanTermYears(d.loanTermYears);
    setDepositPercent(d.depositPercent);
    setAnnualExpenses(d.annualExpenses);
    setExpensesGrowthRate(d.expensesGrowthRate);
    setPmFeePercent(d.pmFeePercent);
    setPreTaxSalary(d.preTaxSalary);
    setYearBuilt(d.yearBuilt);
    setBuildingValuePercent(d.buildingValuePercent);
    setFixturesEstimate(d.fixturesEstimate);
    setSnapshotPeriod(d.snapshotPeriod);
    setCashflowView(d.cashflowView);
    setSuburbSuggestionActive(d.suburbSuggestionActive);
    if (d.purchaseDate !== undefined) setPurchaseDateStr(d.purchaseDate);
    if (d.propertyType !== undefined) setPropertyType(d.propertyType);
    if (d.otherRentalIncome !== undefined) setOtherRentalIncome(d.otherRentalIncome);
    if (d.cpiAssumptionPercent !== undefined) setCpiAssumptionPercent(d.cpiAssumptionPercent);
    if (d.saleDate !== undefined) setSaleDateStr(d.saleDate);
    if (d.salePrice !== undefined) setSalePriceStr(d.salePrice);
    if (d.holdingCostsCapitalised !== undefined) setHoldingCostsStr(d.holdingCostsCapitalised);
    if (d.isPreCGTAsset !== undefined) setIsPreCGTAsset(d.isPreCGTAsset);
    if (d.marketValueAt1July2027 !== undefined) setMarketValueAt2027Str(d.marketValueAt1July2027);
    if (d.savedInputs) {
      lastSavedInputsRef.current = d.savedInputs;
      setLastSavedInputs(d.savedInputs);
      setResult(analyzeProperty(d.savedInputs));
      setResultAnimKey((k) => k + 1);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      saveAnalyseDraft({
        v: 1,
        suburb,
        propertyAddress,
        state,
        suburbGrowthPercent,
        vacancyPercent,
        purchasePrice,
        weeklyRent,
        rentalGrowthRate,
        interestRate,
        isInterestOnly,
        investmentStrategy,
        loanTermYears,
        depositPercent,
        annualExpenses,
        expensesGrowthRate,
        pmFeePercent,
        preTaxSalary,
        yearBuilt,
        buildingValuePercent,
        fixturesEstimate,
        snapshotPeriod,
        cashflowView,
        suburbSuggestionActive,
        savedInputs: lastSavedInputsRef.current,
        purchaseDate: purchaseDateStr,
        propertyType,
        otherRentalIncome,
        cpiAssumptionPercent,
        saleDate: saleDateStr,
        salePrice: salePriceStr,
        holdingCostsCapitalised: holdingCostsStr,
        isPreCGTAsset,
        marketValueAt1July2027: marketValueAt2027Str,
      });
    }, 450);
    return () => window.clearTimeout(t);
  }, [
    suburb,
    propertyAddress,
    state,
    suburbGrowthPercent,
    vacancyPercent,
    purchasePrice,
    weeklyRent,
    rentalGrowthRate,
    interestRate,
    isInterestOnly,
    investmentStrategy,
    loanTermYears,
    depositPercent,
    annualExpenses,
    expensesGrowthRate,
    pmFeePercent,
    preTaxSalary,
    yearBuilt,
    buildingValuePercent,
    fixturesEstimate,
    snapshotPeriod,
    cashflowView,
    suburbSuggestionActive,
    purchaseDateStr,
    propertyType,
    otherRentalIncome,
    cpiAssumptionPercent,
    saleDateStr,
    salePriceStr,
    holdingCostsStr,
    isPreCGTAsset,
    marketValueAt2027Str,
  ]);

  function onNumberBlur(setValue: Dispatch<SetStateAction<string>>) {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      setValue(formatInputNumber(e.target.value));
    };
  }

  function clearFieldError(key: string) {
    setFormErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function clearSuburbSuggestion() {
    setSuburbSuggestionActive(false);
  }

  function applySuburbSuggestedAssumptions() {
    const t = suburb.trim();
    if (!t) {
      setSuburbSuggestionActive(false);
      return;
    }
    const s = getSuggestedAssumptionsForSuburb(t);
    if (!s) {
      setSuburbSuggestionActive(false);
      return;
    }
    setSuburbGrowthPercent(formatInputNumber(String(s.suburbGrowthPercent)));
    setVacancyPercent(formatInputNumber(String(s.vacancyPercent)));
    setRentalGrowthRate(formatInputNumber(String(s.rentalGrowthPercent)));
    setSuburbSuggestionActive(true);
  }

  function cashflowDisplay(annual: number): string {
    const divisor =
      cashflowView === "weekly" ? 52 : cashflowView === "monthly" ? 12 : 1;
    const suffix =
      cashflowView === "weekly" ? "/wk" : cashflowView === "monthly" ? "/mo" : "/yr";
    return `${formatAud(annual / divisor)}${suffix}`;
  }

  function analyseDeal() {
    const built = buildPropertyAnalysisInputFromForm(
      formFieldsRef.current,
      investmentStrategy,
      currentYear
    );
    if (!built.ok) {
      setFormErrors(built.errors);
      setResult(null);
      return;
    }

    setFormErrors({});
    setIsAnalysing(true);
    setResult(null);
    const builtInput = built.input;
    lastSavedInputsRef.current = builtInput;
    setLastSavedInputs(builtInput);
    const started = performance.now();
    const waitThen = (next: AnalysisResult | null) => {
      const elapsed = performance.now() - started;
      const wait = Math.max(0, ANALYSE_MIN_MS - elapsed);
      window.setTimeout(() => {
        setResult(next);
        if (next) setResultAnimKey((k) => k + 1);
        setIsAnalysing(false);
      }, wait);
    };

    waitThen(analyzeProperty(builtInput));
  }

  const statusStyles: Record<
    AnalysisResult["status"],
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

  const projectionSeries = useMemo(() => {
    if (!result) return null;
    const rawEg = parseNumber(expensesGrowthRate);
    const expensesGrowthRatePercent = Number.isFinite(rawEg) ? rawEg : 2.5;
    const schedule = buildAmortisationScheduleYearly(
      result.loan,
      result.interestRatePercent,
      30,
      result.isInterestOnly,
      result.loanTermYears
    );
    const otherRent = parseNumber(otherRentalIncome);
    const { cashflow, ledger } = buildCashflowProjectionSeriesBudget2026({
      weeklyRent: result.weeklyRent,
      rentalGrowthRatePercent: result.rentalGrowthRatePercent,
      annualExpenses: result.annualExpenses,
      expensesGrowthRatePercent,
      amortisation: schedule,
      buildingDepreciation: result.depreciation.buildingDepreciation,
      fixturesEstimate: result.fixturesEstimate,
      marginalTaxRate: result.marginalRate,
      vacancyPercent: result.vacancyPercent,
      pmFeePercent: result.pmFeePercent,
      purchaseDate: result.purchaseDate,
      propertyType: result.propertyType,
      otherRentalIncome: Number.isFinite(otherRent) ? otherRent : 0,
    });
    return {
      valueVsDebt: buildPropertyValueVsMortgageSeries({
        purchasePrice: result.purchasePrice,
        suburbGrowthRatePercent: result.suburbGrowthPercent,
        amortisation: schedule,
      }),
      cashflow,
      ledger,
    };
  }, [expensesGrowthRate, otherRentalIncome, result]);

  const scenarioComparison = useMemo(() => {
    if (!result || !projectionSeries) return null;
    const rawEg = parseNumber(expensesGrowthRate);
    const expensesGrowthRatePercent = Number.isFinite(rawEg) ? rawEg : 2.5;
    const schedule = buildAmortisationScheduleYearly(
      result.loan,
      result.interestRatePercent,
      30,
      result.isInterestOnly,
      result.loanTermYears
    );
    const otherRent = parseNumber(otherRentalIncome);
    const other = Number.isFinite(otherRent) ? otherRent : 0;
    const scenarios: TaxScenarioId[] = [
      "GRANDFATHERED",
      "POST_BUDGET_ESTABLISHED",
      "POST_BUDGET_NEW_BUILD",
    ];
    return scenarios.map((scenarioOverride) => {
      const { cashflow, ledger } = buildCashflowProjectionSeriesBudget2026({
        weeklyRent: result.weeklyRent,
        rentalGrowthRatePercent: result.rentalGrowthRatePercent,
        annualExpenses: result.annualExpenses,
        expensesGrowthRatePercent,
        amortisation: schedule,
        buildingDepreciation: result.depreciation.buildingDepreciation,
        fixturesEstimate: result.fixturesEstimate,
        marginalTaxRate: result.marginalRate,
        vacancyPercent: result.vacancyPercent,
        pmFeePercent: result.pmFeePercent,
        purchaseDate: result.purchaseDate,
        propertyType: result.propertyType,
        otherRentalIncome: other,
        scenarioOverride,
      });
      const cumulativeAfterTax = cashflow.reduce((s, p) => s + p.afterTaxCashflow, 0);
      const cumulativeTaxCash = cashflow.reduce((s, p) => s + p.taxEffect, 0);
      const cfEnd = ledger[ledger.length - 1]?.carryForwardBalanceEnd ?? 0;
      return {
        scenarioOverride,
        label: taxScenarioLabel(scenarioOverride),
        cumulativeAfterTax,
        cumulativeTaxCash,
        carryForwardEnd: cfEnd,
      };
    });
  }, [expensesGrowthRate, otherRentalIncome, projectionSeries, result]);

  const liveDetectedScenarioLabel = useMemo(() => {
    const pd = purchaseDateStr.trim()
      ? new Date(`${purchaseDateStr}T12:00:00`)
      : new Date(DEAL_ANALYSER_DEFAULT_PURCHASE_DATE);
    const id = classifyTaxScenario({ purchaseDate: pd, propertyType });
    return taxScenarioLabel(id);
  }, [purchaseDateStr, propertyType]);

  const projectionTableRows = useMemo(() => {
    if (!projectionSeries) return [];
    return PROJECTION_SAMPLE_YEARS.map((y) => {
      const vd = projectionSeries.valueVsDebt.find((p) => p.year === y);
      const cf = projectionSeries.cashflow.find((p) => p.year === y);
      if (!vd || !cf) return null;
      return {
        year: y,
        financialYearLabel: cf.financialYearLabel,
        propertyValue: vd.propertyValue,
        mortgageBalance: vd.mortgageBalance,
        preTaxCashflow: cf.preTaxCashflow,
        afterTaxCashflow: cf.afterTaxCashflow,
        rentalLossTaxTreatmentLabel: cf.rentalLossTaxTreatmentLabel,
        carryForwardBalanceEnd: cf.carryForwardBalanceEnd,
      };
    }).filter((row): row is NonNullable<typeof row> => row !== null);
  }, [projectionSeries]);

  const showCarryForwardLedger =
    result?.taxScenarioId === "POST_BUDGET_ESTABLISHED" &&
    Boolean(projectionSeries?.ledger.some((r) => r.fyEndingJuneYear >= 2028));

  const lvrHigh = result && result.lvr > 80;
  const neutralDep = result ? neutralPreTaxDepositPercent(result) : null;
  const neutralRate = result ? neutralPreTaxInterestRatePercent(result) : null;
  const dealBullets = result ? whatDealLooksLikeBullets(result) : [];
  const riskBullets = result ? keyRiskBullets(result) : [];

  function renderAnalyseProjections() {
    if (!projectionSeries) return null;
    return (
      <>
        <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Projections — property value vs mortgage
          </h3>
          <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
            Nominal dollars over 30 years based on your editable growth and repayment assumptions.
          </p>
          <div className="mt-4 h-[17rem] w-full sm:h-[20rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={projectionSeries.valueVsDebt} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{
                    value: "Year",
                    fill: "#a1a1aa",
                    position: "insideBottom",
                    offset: -4,
                  }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{
                    value: "AUD",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#a1a1aa",
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="propertyValue"
                  stroke="#c4b5fd"
                  strokeWidth={2.8}
                  dot={false}
                  name="Property value"
                />
                <Line
                  type="monotone"
                  dataKey="mortgageBalance"
                  stroke="#fb7185"
                  strokeWidth={2.4}
                  dot={false}
                  name="Mortgage balance"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Projected annual cashflow
            </h3>
            <div className="flex gap-1 rounded-lg border border-zinc-600/60 bg-zinc-800/60 p-0.5">
              {(
                [
                  { label: "Annual", value: "annual" },
                  { label: "Weekly", value: "weekly" },
                  { label: "Monthly", value: "monthly" },
                ] as const
              ).map(({ label, value }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCashflowView(value)}
                  className={`rounded-md px-2 py-1 text-[10px] font-medium transition ${
                    cashflowView === value
                      ? "bg-violet-600 text-white"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[17rem] w-full sm:h-[20rem]">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={projectionSeries.cashflow} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{
                    value: "Year",
                    fill: "#a1a1aa",
                    position: "insideBottom",
                    offset: -4,
                  }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => cashflowDisplay(Number(v))}
                  width={88}
                  label={{
                    value:
                      cashflowView === "weekly"
                        ? "AUD / week"
                        : cashflowView === "monthly"
                          ? "AUD / month"
                          : "AUD / year",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#a1a1aa",
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [cashflowDisplay(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="preTaxCashflow"
                  stroke="#fbbf24"
                  strokeWidth={3}
                  dot={false}
                  name="Pre-tax cashflow"
                />
                <Line
                  type="monotone"
                  dataKey="afterTaxCashflow"
                  stroke="#818cf8"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                  dot={false}
                  name="After-tax cashflow"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {cashflowView === "annual"
              ? "Annual cashflow shown, not cumulative cashflow."
              : cashflowView === "weekly"
                ? "Weekly equivalent per year shown, not cumulative cashflow."
                : "Monthly equivalent per year shown, not cumulative cashflow."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Projections are nominal and not adjusted for inflation.
          </p>
        </section>

        {projectionTableRows.length > 0 ? (
          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Projection snapshot (selected years)
            </h3>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              Years {PROJECTION_SAMPLE_YEARS.join(", ")} — annual figures, same basis as the charts.
            </p>

            <div className="mt-3 space-y-3 md:hidden">
              {projectionTableRows.map((row) => (
                <div
                  key={row.year}
                  className="rounded-lg border border-zinc-700/40 bg-zinc-900/40 px-3 py-3"
                >
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">
                    Year {formatNumberGb(row.year)}
                  </h4>
                  <dl className="mt-3 space-y-2 text-xs text-zinc-300">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">Property value</dt>
                      <dd className="min-w-0 text-right tabular-nums text-zinc-200">
                        {formatAud(row.propertyValue)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">Mortgage balance</dt>
                      <dd className="min-w-0 text-right tabular-nums text-zinc-200">
                        {formatAud(row.mortgageBalance)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">Pre-tax cashflow</dt>
                      <dd className="min-w-0 text-right tabular-nums text-zinc-200">
                        {formatAud(row.preTaxCashflow)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">After-tax cashflow</dt>
                      <dd className="min-w-0 text-right tabular-nums text-zinc-200">
                        {formatAud(row.afterTaxCashflow)}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">Rental loss treatment</dt>
                      <dd className="min-w-0 text-right text-[11px] text-zinc-200">{row.rentalLossTaxTreatmentLabel}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-zinc-500">CF losses (end yr)</dt>
                      <dd className="min-w-0 text-right tabular-nums text-zinc-200">
                        {formatAud(row.carryForwardBalanceEnd)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            <div className="mt-3 hidden md:block">
              <div className="overflow-x-auto rounded-lg border border-zinc-700/40">
                <table className="w-full min-w-[44rem] border-collapse text-xs text-zinc-300">
                  <thead className="whitespace-nowrap">
                    <tr className="border-b border-zinc-600/80 bg-zinc-900/80 text-[10px] font-semibold uppercase leading-tight tracking-wide text-zinc-400">
                      <th className="px-2 py-2 text-left">Year</th>
                      <th className="px-2 py-2 text-left">FY</th>
                      <th className="px-2 py-2 text-right">Property value</th>
                      <th className="px-2 py-2 text-right">Mortgage</th>
                      <th className="px-2 py-2 text-right">Pre-tax CF</th>
                      <th className="px-2 py-2 text-right">After-tax CF</th>
                      <th className="px-2 py-2 text-right max-w-[10rem] whitespace-normal text-left">
                        Rental loss treatment
                      </th>
                      <th className="px-2 py-2 text-right">CF loss balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionTableRows.map((row, idx) => (
                      <tr
                        key={row.year}
                        className={`border-b border-zinc-800/80 last:border-0 ${
                          idx % 2 === 1 ? "bg-zinc-900/35" : "bg-transparent"
                        }`}
                      >
                        <td className="px-2 py-2 tabular-nums font-medium text-zinc-200">
                          {formatNumberGb(row.year)}
                        </td>
                        <td className="px-2 py-2 tabular-nums text-zinc-400">{row.financialYearLabel}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatAud(row.propertyValue)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatAud(row.mortgageBalance)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatAud(row.preTaxCashflow)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatAud(row.afterTaxCashflow)}</td>
                        <td className="px-2 py-2 text-[10px] leading-snug text-zinc-300">
                          {row.rentalLossTaxTreatmentLabel}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatAud(row.carryForwardBalanceEnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : null}

        {showCarryForwardLedger && projectionSeries ? (
          <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Carry-forward losses ledger
            </h3>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
              Under the new rules, rental losses on this property from 1 July 2027 onward cannot reduce your salary tax.
              They accumulate as carry-forward losses and reduce your taxable capital gain when you sell, recovering the
              tax benefit at that point rather than year by year.
            </p>
            <div className="mt-4 h-44 w-full sm:h-52">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart
                  data={projectionSeries.ledger.map((r) => ({
                    year: r.year,
                    balance: r.carryForwardBalanceEnd,
                  }))}
                  margin={chartMargin}
                >
                  <XAxis dataKey="year" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 11 }}
                    tickFormatter={(v) => formatChartAud(Number(v))}
                    width={72}
                  />
                  <Tooltip
                    formatter={(value) => formatAud(Number(value))}
                    contentStyle={chartTooltipContentStyle}
                    labelStyle={chartTooltipLabelStyle}
                  />
                  <Line
                    type="monotone"
                    dataKey="balance"
                    stroke="#34d399"
                    strokeWidth={2}
                    dot={false}
                    name="Carry-forward balance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-zinc-500 border-t border-zinc-700/50 pt-3">
              The tax treatment modelled here reflects the measures announced in the 2026-27 Federal Budget on 12 May
              2026. These measures have not yet been enacted as legislation, and final design details (including the
              precise definition of &quot;new build&quot;, the indexation method, and treatment of edge cases) will be
              confirmed when the Explanatory Memorandum is published and the legislation passes Parliament. This tool
              provides general illustrative modelling only and does not constitute personal tax, financial, or
              investment advice. Before making decisions based on these projections, consult a qualified tax
              professional or financial adviser.
            </p>
          </section>
        ) : null}
      </>
    );
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
            Deal Analyser
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Analyse a Property
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Model a single residential purchase: year-one cashflow, rough tax and depreciation effects,
            and long-range projections from your assumptions — before you commit.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            Built for Australian residential investors; outputs are illustrative, not advice.
          </p>
        </header>

        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-2 lg:gap-12 lg:items-start">
          {/* ── FORM ── */}
          <div
            className={`min-w-0 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8 ${
              isAnalysing ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <div className="space-y-10">
              <section className="space-y-5">
                <FormSectionHeading title="Property Basics" infoLabel="Property basics">
                  Price, rent, and location — the starting point for loan size, duty, and yield.
                </FormSectionHeading>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-purchase">
                      Purchase Price
                      <RequiredMark />
                    </span>
                    <InfoButton label="Purchase price">
                      Contract or expected price. Drives loan, stamp duty, LMI, and yield — use a figure
                      you are actually prepared to pay.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-purchase"
                    aria-invalid={!!formErrors.purchasePrice}
                    aria-describedby={
                      formErrors.purchasePrice ? "err-purchase" : undefined
                    }
                    type="text"
                    inputMode="decimal"
                    value={purchasePrice}
                    onChange={(e) => {
                      clearFieldError("purchasePrice");
                      setPurchasePrice(e.target.value);
                    }}
                    onBlur={onNumberBlur(setPurchasePrice)}
                    className={`${inputClass} ${formErrors.purchasePrice ? fieldErrClass : ""}`}
                    placeholder="e.g. 550,000"
                  />
                  <span className={helperClass}>Digits only; commas optional — we tidy the display when you leave the field.</span>
                  {formErrors.purchasePrice ? (
                    <p id="err-purchase" className={fieldErrMsgClass} role="alert">
                      {formErrors.purchasePrice}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-weekly">
                      Weekly Rent
                      <RequiredMark />
                    </span>
                    <InfoButton label="Weekly rent">
                      Rent you expect before agency fees and other costs. If the property is vacant, you
                      can still enter a market rent to test the deal.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-weekly"
                    aria-invalid={!!formErrors.weeklyRent}
                    aria-describedby={formErrors.weeklyRent ? "err-weekly" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={weeklyRent}
                    onChange={(e) => {
                      clearFieldError("weeklyRent");
                      setWeeklyRent(e.target.value);
                    }}
                    onBlur={onNumberBlur(setWeeklyRent)}
                    className={`${inputClass} ${formErrors.weeklyRent ? fieldErrClass : ""}`}
                    placeholder="e.g. 520"
                  />
                  {formErrors.weeklyRent ? (
                    <p id="err-weekly" className={fieldErrMsgClass} role="alert">
                      {formErrors.weeklyRent}
                    </p>
                  ) : null}
                </div>

                <label className="block text-left" htmlFor="fld-suburb">
                  <span className={labelClass}>Suburb</span>
                  <input
                    id="fld-suburb"
                    type="text"
                    value={suburb}
                    onChange={(e) => {
                      setSuburb(e.target.value);
                      setSuburbSuggestionActive(false);
                    }}
                    onBlur={() => applySuburbSuggestedAssumptions()}
                    className={inputClass}
                    placeholder="Calderwood"
                    autoComplete="address-level2"
                  />
                  <span className={helperClass}>
                    Used for labels and context. Optional suburb-based hints may appear under Advanced
                    Assumptions when available — you can always override them.
                  </span>
                </label>

                <label className="block text-left" htmlFor="fld-address">
                  <span className="mb-1.5 block text-xs font-medium text-zinc-500">
                    Property address <span className="font-normal text-zinc-600">(optional)</span>
                  </span>
                  <input
                    id="fld-address"
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    className={inputClass}
                    placeholder="Street and number — for your notes only"
                    autoComplete="street-address"
                  />
                  <span className={helperClass}>
                    Not used in calculations; suburb and state drive duty and modelling.
                  </span>
                </label>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-state">
                      State / Territory
                    </span>
                    <InfoButton label="State / territory">
                      Sets indicative stamp duty for this model. Choose the state or territory where the
                      property sits.
                    </InfoButton>
                  </div>
                  <select
                    aria-labelledby="lbl-state"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={inputClass}
                  >
                    {AU_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="space-y-5 border-t border-zinc-700/60 pt-10">
                <FormSectionHeading title="Finance" infoLabel="Finance">
                  Deposit, rate, loan structure, and term — what you pay to hold the asset and how debt
                  pays down over time.
                </FormSectionHeading>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-deposit">
                      Deposit (%)
                      <RequiredMark />
                    </span>
                    <InfoButton label="Deposit">
                      Your equity as a percentage of the purchase price (e.g. 20 means 20%). A smaller
                      deposit means a larger loan and usually higher LMI if LVR is above 80%.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-deposit"
                    aria-invalid={!!formErrors.depositPercent}
                    aria-describedby={formErrors.depositPercent ? "err-deposit" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={depositPercent}
                    onChange={(e) => {
                      clearFieldError("depositPercent");
                      setDepositPercent(e.target.value);
                    }}
                    onBlur={onNumberBlur(setDepositPercent)}
                    className={`${inputClass} ${formErrors.depositPercent ? fieldErrClass : ""}`}
                    placeholder="e.g. 20"
                  />
                  <span className={helperClass}>% of purchase price, not a dollar amount.</span>
                  {formErrors.depositPercent ? (
                    <p id="err-deposit" className={fieldErrMsgClass} role="alert">
                      {formErrors.depositPercent}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-rate">
                      Interest Rate (%)
                      <RequiredMark />
                    </span>
                    <InfoButton label="Interest rate">
                      Annual interest on the loan (e.g. 6.2 for 6.2% p.a.). Match it to your bank&apos;s
                      offer or a stress-test rate you want to explore.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-rate"
                    aria-invalid={!!formErrors.interestRate}
                    aria-describedby={formErrors.interestRate ? "err-rate" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={interestRate}
                    onChange={(e) => {
                      clearFieldError("interestRate");
                      setInterestRate(e.target.value);
                    }}
                    onBlur={onNumberBlur(setInterestRate)}
                    className={`${inputClass} ${formErrors.interestRate ? fieldErrClass : ""}`}
                    placeholder="e.g. 6.2"
                  />
                  <span className={helperClass}>Enter as a percentage per annum.</span>
                  {formErrors.interestRate ? (
                    <p id="err-rate" className={fieldErrMsgClass} role="alert">
                      {formErrors.interestRate}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass}>
                      Loan Type
                      <RequiredMark />
                    </span>
                    <InfoButton label="Loan type">
                      P&amp;I repays principal over the term; IO pays interest only for the period you
                      model — balance stays flat until you refinance or switch.
                    </InfoButton>
                  </div>
                  <div
                    className="flex overflow-hidden rounded-xl border border-zinc-600/80 bg-zinc-900/60"
                    role="group"
                    aria-label="Loan type"
                  >
                    {(
                      [
                        { label: "Principal & Interest (P&I)", value: false },
                        { label: "Interest Only (IO)", value: true },
                      ] as const
                    ).map(({ label, value }) => (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setIsInterestOnly(value)}
                        className={`flex-1 py-2.5 text-sm font-medium transition ${
                          isInterestOnly === value
                            ? "bg-violet-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-term">
                      Loan Term (years)
                      <RequiredMark />
                    </span>
                    <InfoButton label="Loan term">
                      How long the loan runs in whole years. Shorter terms mean higher repayments but
                      faster equity build on P&amp;I.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-term"
                    aria-invalid={!!formErrors.loanTermYears}
                    aria-describedby={formErrors.loanTermYears ? "err-term" : undefined}
                    type="text"
                    inputMode="numeric"
                    value={loanTermYears}
                    onChange={(e) => {
                      clearFieldError("loanTermYears");
                      setLoanTermYears(e.target.value);
                    }}
                    onBlur={onNumberBlur(setLoanTermYears)}
                    className={`${inputClass} ${formErrors.loanTermYears ? fieldErrClass : ""}`}
                    placeholder="30"
                  />
                  {formErrors.loanTermYears ? (
                    <p id="err-term" className={fieldErrMsgClass} role="alert">
                      {formErrors.loanTermYears}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass}>
                      Investment Strategy
                      <RequiredMark />
                    </span>
                    <InfoButton label="Investment strategy">
                      Growth emphasises capital growth in the score; Yield emphasises rent and after-tax
                      cashflow; Balanced blends both. Your inputs stay the same — only the weighting of
                      the score changes.
                    </InfoButton>
                  </div>
                  <div
                    className="flex overflow-hidden rounded-xl border border-zinc-600/80 bg-zinc-900/60"
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
                          investmentStrategy === value
                            ? "bg-violet-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    The selected strategy changes how the deal is rated, not the underlying financial
                    calculations.
                  </p>
                </div>
              </section>

              <section className="space-y-5 border-t border-zinc-700/60 pt-10">
                <FormSectionHeading title="Holding Costs" infoLabel="Holding costs">
                  Ongoing costs outside the mortgage — rates, insurance, maintenance, and letting fees.
                </FormSectionHeading>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-exp">
                      Annual Expenses
                      <RequiredMark />
                    </span>
                    <InfoButton label="Annual expenses">
                      A single annual figure for everything except the loan: council rates, insurance,
                      repairs, strata if applicable, and similar. Excludes principal and interest.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-exp"
                    aria-invalid={!!formErrors.annualExpenses}
                    aria-describedby={formErrors.annualExpenses ? "err-exp" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={annualExpenses}
                    onChange={(e) => {
                      clearFieldError("annualExpenses");
                      setAnnualExpenses(e.target.value);
                    }}
                    onBlur={onNumberBlur(setAnnualExpenses)}
                    className={`${inputClass} ${formErrors.annualExpenses ? fieldErrClass : ""}`}
                    placeholder="6,500"
                  />
                  {formErrors.annualExpenses ? (
                    <p id="err-exp" className={fieldErrMsgClass} role="alert">
                      {formErrors.annualExpenses}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-pm">
                      Property Management / Real Estate Fee (% of rent)
                    </span>
                    <InfoButton label="Property management and real estate fee">
                      What the agent keeps as a percentage of rent collected (before other costs). Many
                      Australian investors use roughly 7–10%; enter 0 if self-managed.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-pm"
                    aria-invalid={!!formErrors.pmFeePercent}
                    aria-describedby={formErrors.pmFeePercent ? "err-pm" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={pmFeePercent}
                    onChange={(e) => {
                      clearFieldError("pmFeePercent");
                      setPmFeePercent(e.target.value);
                    }}
                    onBlur={onNumberBlur(setPmFeePercent)}
                    className={`${inputClass} ${formErrors.pmFeePercent ? fieldErrClass : ""}`}
                    placeholder="8"
                  />
                  {formErrors.pmFeePercent ? (
                    <p id="err-pm" className={fieldErrMsgClass} role="alert">
                      {formErrors.pmFeePercent}
                    </p>
                  ) : null}
                  <span className={helperClass}>
                    Percentage of rent collected — 0 if you manage the property yourself.
                  </span>
                </div>
              </section>

              <section className="space-y-5 border-t border-zinc-700/60 pt-10">
                <FormSectionHeading title="Tax scenario (Budget 2026)" infoLabel="Budget 2026 tax scenario">
                  Purchase date and property type determine negative gearing and CGT regime classification.
                </FormSectionHeading>

                <div className="block text-left">
                  <span className={labelClass}>Purchase / settlement date</span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <input
                      id="fld-purchase-date"
                      type="date"
                      value={purchaseDateStr}
                      onChange={(e) => setPurchaseDateStr(e.target.value)}
                      className={`${inputClass} max-w-[11rem]`}
                    />
                    <button
                      type="button"
                      className="text-xs font-medium text-violet-400 underline-offset-2 hover:underline"
                      onClick={() => setPurchaseDateStr("")}
                    >
                      Clear (legacy default)
                    </button>
                  </div>
                  <span className={helperClass}>
                    When cleared, the model uses the built-in legacy purchase date (grandfathered classification).
                  </span>
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass}>Property type</span>
                    <InfoButton label="What qualifies as new build">
                      Off-the-plan apartments, new builds on previously vacant land, duplexes from knock-down rebuilds
                      (where net dwellings increase), and new builds occupied less than 12 months before first sale.
                      Established properties that have been extended, granny flats, and like-for-like knock-down
                      rebuilds do NOT qualify.
                    </InfoButton>
                  </div>
                  <div
                    className="flex overflow-hidden rounded-xl border border-zinc-600/80 bg-zinc-900/60"
                    role="group"
                    aria-label="Property type"
                  >
                    {(
                      [
                        {
                          label: "Established property",
                          value: "established" as const,
                        },
                        {
                          label: "New build (qualifying)",
                          value: "new_build" as const,
                        },
                      ] as const
                    ).map(({ label, value }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setPropertyType(value)}
                        className={`flex-1 px-2 py-2.5 text-xs font-medium transition sm:text-sm ${
                          propertyType === value
                            ? "bg-violet-600 text-white"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/25 px-3 py-2 text-[11px] leading-snug text-emerald-100">
                  <span className="font-semibold text-emerald-300">Detected scenario: </span>
                  {liveDetectedScenarioLabel}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-other-rent">
                      Other rental income (optional)
                    </span>
                    <InfoButton label="Other rental income">
                      If you own other rental properties with positive net rental income, ring-fenced losses from
                      this property can offset that income before being carried forward.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-other-rent"
                    aria-invalid={!!formErrors.otherRentalIncome}
                    aria-describedby={formErrors.otherRentalIncome ? "err-other-rent" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={otherRentalIncome}
                    onChange={(e) => {
                      clearFieldError("otherRentalIncome");
                      setOtherRentalIncome(e.target.value);
                    }}
                    onBlur={onNumberBlur(setOtherRentalIncome)}
                    className={`${inputClass} ${formErrors.otherRentalIncome ? fieldErrClass : ""}`}
                    placeholder="0"
                  />
                  {formErrors.otherRentalIncome ? (
                    <p id="err-other-rent" className={fieldErrMsgClass} role="alert">
                      {formErrors.otherRentalIncome}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-cpi">
                      CPI assumption (% p.a.)
                    </span>
                    <InfoButton label="CPI assumption">
                      Used for CGT indexation and expense growth in projections — a simplifying assumption vs ATO CPI
                      tables.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-cpi"
                    aria-invalid={!!formErrors.cpiAssumptionPercent}
                    aria-describedby={formErrors.cpiAssumptionPercent ? "err-cpi" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={cpiAssumptionPercent}
                    onChange={(e) => {
                      clearFieldError("cpiAssumptionPercent");
                      setCpiAssumptionPercent(e.target.value);
                    }}
                    onBlur={onNumberBlur(setCpiAssumptionPercent)}
                    className={`${inputClass} ${formErrors.cpiAssumptionPercent ? fieldErrClass : ""}`}
                    placeholder="3"
                  />
                  {formErrors.cpiAssumptionPercent ? (
                    <p id="err-cpi" className={fieldErrMsgClass} role="alert">
                      {formErrors.cpiAssumptionPercent}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-300">
                    <input
                      type="checkbox"
                      checked={isPreCGTAsset}
                      onChange={(e) => setIsPreCGTAsset(e.target.checked)}
                      className="mt-1"
                    />
                    <span>Pre-CGT asset (optional) — cost base resets at 1 July 2027 for sales after that date</span>
                  </label>
                </div>

                {isPreCGTAsset ? (
                  <div className="block text-left">
                    <span className={labelClass}>Market value at 1 July 2027</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-invalid={!!formErrors.marketValueAt1July2027}
                      value={marketValueAt2027Str}
                      onChange={(e) => {
                        clearFieldError("marketValueAt1July2027");
                        setMarketValueAt2027Str(e.target.value);
                      }}
                      onBlur={onNumberBlur(setMarketValueAt2027Str)}
                      className={`${inputClass} ${formErrors.marketValueAt1July2027 ? fieldErrClass : ""}`}
                      placeholder="e.g. 1,500,000"
                    />
                    {formErrors.marketValueAt1July2027 ? (
                      <p className={fieldErrMsgClass} role="alert">
                        {formErrors.marketValueAt1July2027}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <FormSectionHeading title="Sale assumptions (CGT)" infoLabel="Sale assumptions">
                  Optional — include to show illustrative capital gains tax using your hold period.
                </FormSectionHeading>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block text-left">
                    <span className={labelClass}>Sale date</span>
                    <input
                      type="date"
                      value={saleDateStr}
                      onChange={(e) => setSaleDateStr(e.target.value)}
                      className={inputClass}
                    />
                  </label>
                  <div className="block text-left">
                    <span className={labelClass}>Sale price</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-invalid={!!formErrors.salePrice}
                      value={salePriceStr}
                      onChange={(e) => {
                        clearFieldError("salePrice");
                        setSalePriceStr(e.target.value);
                      }}
                      onBlur={onNumberBlur(setSalePriceStr)}
                      className={`${inputClass} ${formErrors.salePrice ? fieldErrClass : ""}`}
                      placeholder="e.g. 900,000"
                    />
                    {formErrors.salePrice ? (
                      <p className={fieldErrMsgClass} role="alert">
                        {formErrors.salePrice}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="block text-left">
                  <span className={labelClass}>Holding costs capitalised (optional)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={holdingCostsStr}
                    onChange={(e) => setHoldingCostsStr(e.target.value)}
                    onBlur={onNumberBlur(setHoldingCostsStr)}
                    className={inputClass}
                    placeholder="0"
                  />
                </div>
              </section>

              <section className="space-y-5 border-t border-zinc-700/60 pt-10">
                <FormSectionHeading title="Tax & Depreciation" infoLabel="Tax and depreciation">
                  Rough inputs for marginal tax and simplified depreciation — illustrative only, not
                  lodgement advice.
                </FormSectionHeading>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-salary">
                      Pre-tax Salary (AUD / year)
                      <RequiredMark />
                    </span>
                    <InfoButton label="Pre-tax salary">
                      Used only to pick an approximate marginal tax rate for this model. Use your ordinary
                      income before tax; it is not comprehensive tax advice.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-salary"
                    aria-invalid={!!formErrors.preTaxSalary}
                    aria-describedby={formErrors.preTaxSalary ? "err-salary" : undefined}
                    type="text"
                    inputMode="decimal"
                    value={preTaxSalary}
                    onChange={(e) => {
                      clearFieldError("preTaxSalary");
                      setPreTaxSalary(e.target.value);
                    }}
                    onBlur={onNumberBlur(setPreTaxSalary)}
                    className={`${inputClass} ${formErrors.preTaxSalary ? fieldErrClass : ""}`}
                    placeholder="120,000"
                  />
                  {formErrors.preTaxSalary ? (
                    <p id="err-salary" className={fieldErrMsgClass} role="alert">
                      {formErrors.preTaxSalary}
                    </p>
                  ) : null}
                </div>

                <div className="block text-left">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={labelClass} id="lbl-yb">
                      Year Built
                      <RequiredMark />
                    </span>
                    <InfoButton label="Year built">
                      Drives a simple building-depreciation rule in this model (e.g. post-1987 builds).
                      Confirm actual deductions with a quantity surveyor.
                    </InfoButton>
                  </div>
                  <input
                    aria-labelledby="lbl-yb"
                    aria-invalid={!!formErrors.yearBuilt}
                    aria-describedby={formErrors.yearBuilt ? "err-yb" : undefined}
                    type="text"
                    inputMode="numeric"
                    value={yearBuilt}
                    onChange={(e) => {
                      clearFieldError("yearBuilt");
                      setYearBuilt(e.target.value);
                    }}
                    onBlur={onNumberBlur(setYearBuilt)}
                    className={`${inputClass} ${formErrors.yearBuilt ? fieldErrClass : ""}`}
                    placeholder="2010"
                  />
                  {formErrors.yearBuilt ? (
                    <p id="err-yb" className={fieldErrMsgClass} role="alert">
                      {formErrors.yearBuilt}
                    </p>
                  ) : null}
                </div>

                <p className="text-xs leading-relaxed text-zinc-500">
                  Tax and depreciation here are estimates for discussion only — always confirm with a
                  registered tax agent and quantity surveyor.
                </p>
              </section>

              <details className="group/advanced rounded-xl border border-zinc-700/60 bg-zinc-950/30">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Advanced Assumptions
                  </span>
                  <span
                    className="shrink-0"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InfoButton label="Advanced assumptions">
                      Optional growth, vacancy, and depreciation inputs. Defaults are fine to start;
                      adjust when you want to stress-test or match your own view.
                    </InfoButton>
                  </span>
                  <span className="shrink-0 text-zinc-500 transition group-open/advanced:rotate-180">
                    ▼
                  </span>
                </summary>
                <div className="space-y-4 border-t border-zinc-700/50 px-4 pb-4 pt-4">
                  <p className="text-xs leading-relaxed text-zinc-500">
                    Sensible defaults apply. If suburb-based suggestions appear, they are starting points
                    only — edit freely. Nothing here is a forecast of future returns.
                  </p>
                  {suburbSuggestionActive ? (
                    <p className="rounded-lg border border-violet-500/30 bg-violet-950/30 px-3 py-2 text-xs leading-relaxed text-violet-100/90">
                      {SUBURB_SUGGESTION_BANNER}
                    </p>
                  ) : null}
                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-suburb-g">
                        Suburb Growth Rate (% / year)
                      </span>
                      <InfoButton label="Suburb growth rate">
                        Annual rate applied to property value in long-term charts. It is an assumption you
                        control — not a prediction.
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-suburb-g"
                      aria-invalid={!!formErrors.suburbGrowthPercent}
                      aria-describedby={
                        formErrors.suburbGrowthPercent ? "err-suburb-g" : undefined
                      }
                      type="text"
                      inputMode="decimal"
                      value={suburbGrowthPercent}
                      onChange={(e) => {
                        clearFieldError("suburbGrowthPercent");
                        clearSuburbSuggestion();
                        setSuburbGrowthPercent(e.target.value);
                      }}
                      onBlur={onNumberBlur(setSuburbGrowthPercent)}
                      className={`${inputClass} ${formErrors.suburbGrowthPercent ? fieldErrClass : ""}`}
                      placeholder="5"
                    />
                    {formErrors.suburbGrowthPercent ? (
                      <p id="err-suburb-g" className={fieldErrMsgClass} role="alert">
                        {formErrors.suburbGrowthPercent}
                      </p>
                    ) : null}
                  </div>

                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-vac">
                        Vacancy Rate (%)
                      </span>
                      <InfoButton label="Vacancy rate">
                        Expected average time without rent, expressed as a percentage (e.g. 2 means ~2%
                        of the year vacant). Higher values reduce effective rent in the model.
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-vac"
                      aria-invalid={!!formErrors.vacancyPercent}
                      aria-describedby={formErrors.vacancyPercent ? "err-vac" : undefined}
                      type="text"
                      inputMode="decimal"
                      value={vacancyPercent}
                      onChange={(e) => {
                        clearFieldError("vacancyPercent");
                        clearSuburbSuggestion();
                        setVacancyPercent(e.target.value);
                      }}
                      onBlur={onNumberBlur(setVacancyPercent)}
                      className={`${inputClass} ${formErrors.vacancyPercent ? fieldErrClass : ""}`}
                      placeholder="2"
                    />
                    {formErrors.vacancyPercent ? (
                      <p id="err-vac" className={fieldErrMsgClass} role="alert">
                        {formErrors.vacancyPercent}
                      </p>
                    ) : null}
                  </div>

                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-rg">
                        Rental Growth Rate (% p.a.)
                      </span>
                      <InfoButton label="Rental growth rate">
                        How fast rent compounds each year in projection charts. Adjust to reflect your
                        own rent review assumptions.
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-rg"
                      aria-invalid={!!formErrors.rentalGrowthRate}
                      aria-describedby={formErrors.rentalGrowthRate ? "err-rg" : undefined}
                      type="text"
                      inputMode="decimal"
                      value={rentalGrowthRate}
                      onChange={(e) => {
                        clearFieldError("rentalGrowthRate");
                        clearSuburbSuggestion();
                        setRentalGrowthRate(e.target.value);
                      }}
                      onBlur={onNumberBlur(setRentalGrowthRate)}
                      className={`${inputClass} ${formErrors.rentalGrowthRate ? fieldErrClass : ""}`}
                      placeholder="3"
                    />
                    {formErrors.rentalGrowthRate ? (
                      <p id="err-rg" className={fieldErrMsgClass} role="alert">
                        {formErrors.rentalGrowthRate}
                      </p>
                    ) : null}
                  </div>

                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-eg">
                        Annual Expenses Growth Rate (% p.a.)
                      </span>
                      <InfoButton label="Expenses growth rate">
                        How fast you expect non-loan costs to rise each year in projections (e.g. rates and
                        insurance).
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-eg"
                      id="fld-eg"
                      type="text"
                      inputMode="decimal"
                      aria-invalid={!!formErrors.expensesGrowthRate}
                      aria-describedby={formErrors.expensesGrowthRate ? "err-eg" : undefined}
                      value={expensesGrowthRate}
                      onChange={(e) => {
                        clearFieldError("expensesGrowthRate");
                        setExpensesGrowthRate(e.target.value);
                      }}
                      onBlur={onNumberBlur(setExpensesGrowthRate)}
                      className={`${inputClass} ${formErrors.expensesGrowthRate ? fieldErrClass : ""}`}
                      placeholder="2.5"
                    />
                    {formErrors.expensesGrowthRate ? (
                      <p id="err-eg" className={fieldErrMsgClass} role="alert">
                        {formErrors.expensesGrowthRate}
                      </p>
                    ) : null}
                  </div>

                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-bvp">
                        Building Value % of Purchase Price
                      </span>
                      <InfoButton label="Building value percentage">
                        Rough split between building and land as a percentage of price. Used only for a
                        simplified depreciation estimate — not a valuation.
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-bvp"
                      aria-invalid={!!formErrors.buildingValuePercent}
                      aria-describedby={formErrors.buildingValuePercent ? "err-bvp" : undefined}
                      type="text"
                      inputMode="decimal"
                      value={buildingValuePercent}
                      onChange={(e) => {
                        clearFieldError("buildingValuePercent");
                        setBuildingValuePercent(e.target.value);
                      }}
                      onBlur={onNumberBlur(setBuildingValuePercent)}
                      className={`${inputClass} ${formErrors.buildingValuePercent ? fieldErrClass : ""}`}
                      placeholder="80"
                    />
                    {formErrors.buildingValuePercent ? (
                      <p id="err-bvp" className={fieldErrMsgClass} role="alert">
                        {formErrors.buildingValuePercent}
                      </p>
                    ) : null}
                  </div>

                  <div className="block text-left">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={labelClass} id="lbl-fix">
                        Fixtures / Plant Estimate (AUD)
                      </span>
                      <InfoButton label="Fixtures and plant">
                        A rough dollar figure for depreciable chattels (carpets, appliances, etc.). The
                        model applies a simple rule — confirm real deductions with a quantity surveyor.
                      </InfoButton>
                    </div>
                    <input
                      aria-labelledby="lbl-fix"
                      aria-invalid={!!formErrors.fixturesEstimate}
                      aria-describedby={formErrors.fixturesEstimate ? "err-fix" : undefined}
                      type="text"
                      inputMode="decimal"
                      value={fixturesEstimate}
                      onChange={(e) => {
                        clearFieldError("fixturesEstimate");
                        setFixturesEstimate(e.target.value);
                      }}
                      onBlur={onNumberBlur(setFixturesEstimate)}
                      className={`${inputClass} ${formErrors.fixturesEstimate ? fieldErrClass : ""}`}
                      placeholder="10,000"
                    />
                    {formErrors.fixturesEstimate ? (
                      <p id="err-fix" className={fieldErrMsgClass} role="alert">
                        {formErrors.fixturesEstimate}
                      </p>
                    ) : null}
                  </div>
                </div>
              </details>
            </div>

            <button
              type="button"
              onClick={analyseDeal}
              disabled={isAnalysing}
              aria-busy={isAnalysing}
              className="mt-10 flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 enabled:active:scale-[0.99] disabled:cursor-wait disabled:opacity-75"
            >
              {isAnalysing ? (
                <>
                  <span
                    className="size-5 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                    aria-hidden
                  />
                  Analysing…
                </>
              ) : (
                "Analyse Deal"
              )}
            </button>
          </div>

          {/* ── RESULTS ── */}
          <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
            {isAnalysing && !result && (
              <output
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-violet-500/40 bg-violet-950/20 px-6 py-16 text-center"
                aria-live="polite"
              >
                <span
                  className="size-8 animate-spin rounded-full border-2 border-violet-800 border-t-violet-400"
                  aria-hidden
                />
                <span className="text-sm font-medium text-violet-200">
                  Crunching the numbers…
                </span>
              </output>
            )}

            {!isAnalysing && !result && (
              <div className="rounded-2xl border border-dashed border-zinc-600/45 bg-zinc-900/35 px-6 py-16 text-center">
                <p className="text-sm font-medium text-zinc-300">Results will appear here</p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-zinc-500">
                  Complete the form, then tap <span className="font-medium text-zinc-300">Analyse Deal</span>{" "}
                  for year-one cashflow, tax and depreciation estimates, and long-range charts.
                </p>
              </div>
            )}

            {result && (
              <div
                key={resultAnimKey}
                className={`space-y-6 rounded-2xl border p-5 backdrop-blur-sm sm:p-7 ${statusStyles[result.status].card} ${statusStyles[result.status].ring} ${statusStyles[result.status].shadow}`}
              >
                <section className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-xs leading-relaxed text-zinc-200">
                  The tax treatment modelled here reflects the measures announced in the 2026-27 Federal Budget on
                  12 May 2026. These measures have not yet been enacted as legislation, and final design details
                  (including the precise definition of &quot;new build&quot;, the indexation method, and treatment of
                  edge cases) will be confirmed when the Explanatory Memorandum is published and the legislation passes
                  Parliament. This tool provides general illustrative modelling only and does not constitute personal
                  tax, financial, or investment advice. Before making decisions based on these projections, consult a
                  qualified tax professional or financial adviser.
                </section>

                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-950/40 px-4 py-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                    Detected scenario (from form)
                  </span>
                  <span className="rounded-full border border-emerald-500/35 bg-emerald-950/40 px-3 py-1 text-[11px] leading-snug text-emerald-100">
                    {liveDetectedScenarioLabel}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    Model run uses{" "}
                    <span className="font-medium text-zinc-400">{result.taxScenarioDescription}</span>
                  </span>
                </div>

                {/* Score + colour (no recommendation language) */}
                <section className="rounded-xl border border-zinc-600/40 bg-zinc-950/35 px-5 py-5 text-center">
                  <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      Strategy
                    </span>
                    <span className="rounded-full border border-violet-500/35 bg-violet-950/40 px-3 py-0.5 text-xs font-semibold text-violet-200">
                      {INVESTMENT_STRATEGIES[result.strategy].label}
                    </span>
                  </div>
                  <p className="mt-5 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    Deal score
                  </p>
                  <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-white">
                    {formatNumberGb(result.score)}
                  </p>
                  <div className="mt-4 flex justify-center">
                    <span
                      aria-label={`Colour status: ${result.status}`}
                      className={`inline-block h-4 w-32 rounded-full shadow-lg ${statusStyles[result.status].pill}`}
                    />
                  </div>
                  <p className="mx-auto mt-3 max-w-sm text-[11px] leading-relaxed text-zinc-500">
                    Illustrative score and colour band only — not advice. Green from{" "}
                    {formatNumberGb(DEAL_SCORE_GREEN_MIN)}, amber {formatNumberGb(DEAL_SCORE_AMBER_MIN)}–
                    {formatNumberGb(DEAL_SCORE_GREEN_MIN - 1)}, red below {formatNumberGb(DEAL_SCORE_AMBER_MIN)}.
                  </p>
                  <p className="mx-auto mt-2 max-w-sm text-[10px] leading-relaxed text-zinc-600">
                    Switching strategy changes how the score is weighted, not the dollar figures below.
                  </p>
                </section>

                <section className="rounded-xl border border-zinc-600/40 bg-zinc-950/30 px-4 py-3.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Score breakdown
                  </h3>
                  <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
                    Each row is a normalised 0–100 sub-index before your strategy weights are applied.
                  </p>
                  <ul className="mt-2.5 space-y-1.5 text-[11px] leading-relaxed text-zinc-400">
                    <li className="flex justify-between gap-4">
                      <span>
                        Capital growth (
                        {INVESTMENT_STRATEGIES[result.strategy].weights.capitalGrowth}%)
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-300">
                        {formatNumberGb(Math.round(result.normGrowth))}
                      </span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span>
                        After-tax cashflow (
                        {INVESTMENT_STRATEGIES[result.strategy].weights.afterTaxCashflow}%)
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-300">
                        {formatNumberGb(Math.round(result.normCashflow))}
                      </span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span>Risk ({INVESTMENT_STRATEGIES[result.strategy].weights.risk}%)</span>
                      <span className="shrink-0 tabular-nums text-zinc-300">
                        {formatNumberGb(Math.round(result.normRisk))}
                      </span>
                    </li>
                    <li className="flex justify-between gap-4">
                      <span>
                        Rental yield ({INVESTMENT_STRATEGIES[result.strategy].weights.rentalYield}%)
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-300">
                        {formatNumberGb(Math.round(result.normYield))}
                      </span>
                    </li>
                  </ul>
                  <p className="mt-3 border-t border-zinc-700/50 pt-3 text-[10px] leading-relaxed text-zinc-500">
                    {INVESTMENT_STRATEGIES[result.strategy].scoreBreakdownNote}
                  </p>
                </section>

                <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Upfront costs
                  </h3>
                  <dl className="mt-3">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-sm text-zinc-400">Stamp duty</dt>
                      <dd className="m-0 text-right text-sm tabular-nums text-zinc-100">
                        {formatAud(result.stampDuty)}
                        <span className="block text-xs font-normal text-zinc-600 text-right mt-0.5">
                          Tiered bracket estimate · verify at your state revenue office
                        </span>
                      </dd>
                    </div>
                  </dl>
                </section>

                {result.cgt ? (
                  <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Capital gains (illustrative — sale assumptions)
                    </h3>
                    <dl className="mt-3 space-y-2 text-sm text-zinc-300">
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Regime applied</dt>
                        <dd className="m-0 text-right font-medium text-zinc-100">{result.cgt.regimeApplied}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Nominal gain</dt>
                        <dd className="m-0 text-right tabular-nums">{formatAud(result.cgt.nominalGain)}</dd>
                      </div>
                      {result.cgt.preCommencementGain != null ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Pre-commencement gain</dt>
                          <dd className="m-0 text-right tabular-nums">
                            {formatAud(result.cgt.preCommencementGain)}
                          </dd>
                        </div>
                      ) : null}
                      {result.cgt.postCommencementRealGain != null ? (
                        <div className="flex justify-between gap-4">
                          <dt className="text-zinc-500">Real post-commencement gain</dt>
                          <dd className="m-0 text-right tabular-nums">
                            {formatAud(result.cgt.postCommencementRealGain)}
                          </dd>
                        </div>
                      ) : null}
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Carry-forward losses applied</dt>
                        <dd className="m-0 text-right tabular-nums">
                          {formatAud(result.cgt.carryForwardLossesApplied)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Indexation (nominal)</dt>
                        <dd className="m-0 text-right tabular-nums">
                          {formatAud(result.cgt.indexationAmountApplied)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Effective rate on residual real gain</dt>
                        <dd className="m-0 text-right tabular-nums">
                          {formatPercent(result.cgt.effectiveMarginalRateUsed * 100, 2)}
                          {result.cgt.minimumTaxRateBinding ? (
                            <span className="ml-1 text-[10px] text-amber-400">(30% floor binding)</span>
                          ) : null}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 border-t border-zinc-700/60 pt-2">
                        <dt className="text-zinc-400">CGT payable (est.)</dt>
                        <dd className="m-0 text-right text-lg font-semibold tabular-nums text-white">
                          {formatAud(result.cgt.cgtPayable)}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-zinc-500">Net sale proceeds after CGT</dt>
                        <dd className="m-0 text-right tabular-nums text-emerald-300">
                          {formatAud(result.cgt.netSaleProceedsAfterCGT)}
                        </dd>
                      </div>
                    </dl>
                    {result.cgt.newBuildComparison ? (
                      <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                        New build election compared old-style 50% discount ({formatAud(result.cgt.newBuildComparison.oldRegimeTax)} tax) vs new
                        rules ({formatAud(result.cgt.newBuildComparison.newRegimeTax)} tax); the lower outcome was selected.
                      </p>
                    ) : null}
                  </section>
                ) : null}

                {/* 1. Key snapshot cards */}
                <section>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Key snapshot
                    </h3>
                    <div
                      className="flex overflow-hidden rounded-xl border border-zinc-600/80 bg-zinc-900/60 shadow-inner shadow-black/20"
                      role="group"
                      aria-label="Key snapshot period"
                    >
                      {SNAPSHOT_PERIOD_OPTIONS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setSnapshotPeriod(p)}
                          className={`px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition sm:px-3 sm:text-[11px] ${
                            snapshotPeriod === p
                              ? "bg-violet-600 text-white shadow-sm"
                              : "text-zinc-400 hover:text-zinc-200"
                          }`}
                        >
                          {snapshotPeriodToggleLabel(p)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mb-3 text-[10px] leading-relaxed text-zinc-600">
                    Period applies to pre-tax and after-tax cashflow, estimated tax cashflow effect, and
                    depreciation. Gross yield and upfront cash stay annual.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Gross yield
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {formatPercent(result.grossYieldPercent, 2)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">before finance</p>
                    </div>

                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Pre-tax cashflow
                      </p>
                      <p
                        className={`mt-1 text-lg font-semibold tabular-nums ${
                          result.preTaxCashflow >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatKeySnapshotAud(result.preTaxCashflow, snapshotPeriod)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        {snapshotPerPeriodPhrase(snapshotPeriod)}
                      </p>
                    </div>

                    {!result.isInterestOnly && (
                      <>
                        <dl className="m-0 sm:col-span-2">
                          <div className="animate-result-section flex flex-col gap-1 border-b border-zinc-700/60 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <dt className="text-sm text-zinc-400">
                              Principal repayment (yr 1, not tax deductible)
                            </dt>
                            <dd className="m-0 text-right text-sm tabular-nums text-zinc-400">
                              −{cashflowDisplay(result.annualPrincipalRepayment)}
                            </dd>
                          </div>
                        </dl>
                        <dl className="m-0 sm:col-span-2">
                          <div className="animate-result-section flex flex-col gap-1 border-b border-zinc-700/60 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <dt className="text-sm text-zinc-400">Actual cash position (P&amp;I, yr 1)</dt>
                            <dd
                              className={`m-0 text-right text-sm font-semibold tabular-nums ${
                                result.actualCashPosition >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {cashflowDisplay(result.actualCashPosition)}
                              <span className="block text-xs font-normal text-zinc-600">
                                real bank account impact including principal
                              </span>
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}

                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Est. net tax effect
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-violet-300">
                        {formatKeySnapshotAud(result.taxBenefit, snapshotPeriod)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        at {formatPercent(result.marginalRate * 100, 0)} marginal ·{" "}
                        {snapshotPerPeriodPhrase(snapshotPeriod)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        After-tax cashflow
                      </p>
                      <p
                        className={`mt-1 text-lg font-semibold tabular-nums ${
                          result.afterTaxCashflow >= 0 ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {formatKeySnapshotAud(result.afterTaxCashflow, snapshotPeriod)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        {snapshotPerPeriodPhrase(snapshotPeriod)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                          Est. depreciation
                        </p>
                        <InfoButton label="Depreciation display">
                          Shown in the same weekly/monthly/annual view as cashflow for easy comparison.
                          The underlying estimate is still illustrative — confirm deductions with a
                          quantity surveyor.
                        </InfoButton>
                      </div>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {formatKeySnapshotAud(result.depreciation.totalDepreciation, snapshotPeriod)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        Illustrative · {snapshotPerPeriodPhrase(snapshotPeriod)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-zinc-600/50 bg-zinc-950/50 px-4 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                        Upfront cash required
                      </p>
                      <p className="mt-1 text-lg font-semibold tabular-nums text-white">
                        {formatAud(result.totalCashRequired)}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">
                        incl. deposit {formatAud(result.depositAmount)}, duty,{" "}
                        {lvrHigh ? `LMI ${formatAud(result.lmiAmount)}, ` : ""}
                        {formatAud(PURCHASE_COSTS_ALLOWANCE_AUD)} costs
                      </p>
                      {result.lmiAmount > 0 && (
                        <dl className="mt-3 border-t border-zinc-700/50 pt-0">
                          <div className="animate-result-section flex flex-col gap-1 border-b border-zinc-700/60 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            <dt className="text-sm text-zinc-400">
                              LMI tax deduction (est. over 5 yrs)
                            </dt>
                            <dd className="text-right text-sm tabular-nums text-violet-300">
                              {formatAud(result.lmiAnnualTaxDeduction)}/yr
                              <span className="block text-xs font-normal text-zinc-600">
                                borrowing expense — deductible per ATO
                              </span>
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                  </div>
                </section>

                <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-700/60 bg-zinc-950/40 p-1">
                  <button
                    type="button"
                    onClick={() => setResultsTab("analysis")}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:flex-none sm:px-4 ${
                      resultsTab === "analysis"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Analysis
                  </button>
                  <button
                    type="button"
                    onClick={() => setResultsTab("compare")}
                    className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition sm:flex-none sm:px-4 ${
                      resultsTab === "compare"
                        ? "bg-violet-600 text-white"
                        : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Compare scenarios
                  </button>
                </div>

                {resultsTab === "analysis" ? renderAnalyseProjections() : null}

                {resultsTab === "compare" && scenarioComparison ? (
                  <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Same economics — three tax regimes
                    </h3>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      This comparison illustrates how the same property economics would perform under each tax regime.
                      Your actual regime is determined by your purchase date and property type.
                    </p>
                    <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-700/40">
                      <table className="w-full min-w-[28rem] border-collapse text-xs text-zinc-300">
                        <thead>
                          <tr className="border-b border-zinc-600/80 bg-zinc-900/80 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                            <th className="whitespace-nowrap px-3 py-2 text-left">Regime</th>
                            <th className="whitespace-nowrap px-3 py-2 text-right">30-yr after-tax CF</th>
                            <th className="whitespace-nowrap px-3 py-2 text-right">30-yr cumulative tax cash</th>
                            <th className="whitespace-nowrap px-3 py-2 text-right">CF losses end Y30</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenarioComparison.map((row) => (
                            <tr key={row.scenarioOverride} className="border-b border-zinc-800/80 last:border-0">
                              <td className="px-3 py-2 text-[11px] leading-snug text-zinc-200">{row.label}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatAud(row.cumulativeAfterTax)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatAud(row.cumulativeTaxCash)}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatAud(row.carryForwardEnd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                {/* ── Actions ── */}
                <section className="rounded-xl border border-zinc-700/50 bg-zinc-950/30 p-4">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Actions
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    <SaveReportButton
                      inputs={lastSavedInputs!}
                      results={result}
                      propertyName={propertyAddress || suburb || undefined}
                      address={propertyAddress || undefined}
                    />
                    <a
                      href="/compare-properties"
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-600/80 bg-zinc-950/50 px-4 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800/60"
                    >
                      Compare with another property
                    </a>
                  </div>
                </section>

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
                      accountHint="Create a free account — your inputs and results stay as they are."
                      onCtaClick={openEarlyAccessModal}
                    />
                  }
                >
                  <div className="space-y-6">
                <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    What this deal looks like
                  </h3>
                  <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                    {dealBullets.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </section>

                {/* 3. What needs to improve? */}
                <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    What needs to improve?
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                    Rough figures for where year-one pre-tax cashflow would sit near neutral on these
                    assumptions — handy for negotiation, not a price or rent target.
                  </p>
                  <dl className="mt-4 divide-y divide-zinc-700/50 text-sm">
                    <div className="flex flex-col gap-0.5 py-3 first:pt-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-zinc-400 sm:max-w-[58%]">Break-even weekly rent (pre-tax)</dt>
                      <dd className="shrink-0 font-medium tabular-nums text-zinc-100">
                        ~{formatAud(result.diagnostics.breakEvenWeeklyPreTax)}/wk
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-zinc-400 sm:max-w-[58%]">
                        Break-even weekly rent (after-tax, model)
                      </dt>
                      <dd className="shrink-0 font-medium tabular-nums text-zinc-100">
                        ~{formatAud(result.diagnostics.breakEvenWeeklyAfterTax)}/wk
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      <dt className="text-zinc-400 sm:max-w-[58%]">Break-even purchase price (pre-tax)</dt>
                      <dd className="shrink-0 font-medium tabular-nums text-zinc-100 sm:text-right">
                        {result.diagnostics.priceForZeroNote ? (
                          <span className="text-zinc-400">{result.diagnostics.priceForZeroNote}</span>
                        ) : result.diagnostics.priceForZeroPreTaxCashflow !== null ? (
                          <>~{formatAud(result.diagnostics.priceForZeroPreTaxCashflow)}</>
                        ) : (
                          "—"
                        )}
                      </dd>
                    </div>
                    {neutralDep !== null ? (
                      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <dt className="text-zinc-400 sm:max-w-[58%]">
                          Illustrative deposit for ~neutral pre-tax cashflow
                        </dt>
                        <dd className="shrink-0 font-medium tabular-nums text-zinc-100">
                          ~{formatPercent(neutralDep, 1)}{" "}
                          <span className="text-zinc-500">(same rent, rate, expenses)</span>
                        </dd>
                      </div>
                    ) : null}
                    {neutralRate !== null && neutralRate > 0 && neutralRate < 20 ? (
                      <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                        <dt className="text-zinc-400 sm:max-w-[58%]">
                          Illustrative interest rate for ~neutral pre-tax cashflow
                        </dt>
                        <dd className="shrink-0 font-medium tabular-nums text-zinc-100">
                          ~{formatPercent(neutralRate, 2)}{" "}
                          <span className="text-zinc-500">(same loan, rent, expenses)</span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
                    Illustrative sensitivities only — not lending, valuation, or tax advice.
                  </p>
                </section>

                {/* 4. Key risks */}
                <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Key risks
                  </h3>
                  <ul className="mt-3 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
                    {riskBullets.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </section>
                  </div>
                </GatedBlur>
              </div>
            )}
          </div>
        </div>

        <p className="mx-auto mt-12 max-w-3xl text-center text-[11px] leading-relaxed text-zinc-500">
          Illustrative model only. Not financial, tax, or legal advice. Depreciation and tax effects are
          rough estimates only and should be confirmed with a qualified quantity surveyor and tax
          adviser.
        </p>
      </div>
    </div>
  );
}
