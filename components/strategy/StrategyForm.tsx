"use client";

import {
  FormSectionHeading,
  RequiredMark,
} from "@/components/ui/InfoButton";
import { AU_STATES } from "@/lib/constants/au";
import {
  strategyInputSchema,
  type GoalRanking,
  type HandsOnPreference,
  type HousingSituation,
  type RiskTolerance,
  type StrategyInput,
} from "@/lib/strategy/strategyInput";
import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const GOAL_OPTIONS: Array<{ value: GoalRanking; label: string }> = [
  { value: "passive_income", label: "Passive income" },
  { value: "capital_growth", label: "Capital growth" },
  { value: "tax_efficiency", label: "Tax efficiency" },
  { value: "financial_independence", label: "Financial independence" },
  { value: "kids_future", label: "Kids’ future / legacy" },
  { value: "single_security_asset", label: "Single security asset" },
];

function parseAudNumber(value: string): number {
  const n = parseFloat(value.replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : NaN;
}

function parseIntLoose(value: string): number {
  const n = parseInt(value.replace(/,/g, "").trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

type IpRow = { estimatedValue: string; loanBalance: string; weeklyRent: string };

function assembleStrategyInput(args: {
  firstName: string;
  annualGrossIncome: string;
  partnerAnnualGrossIncome: string;
  annualSavingsRate: string;
  liquidDepositAvailable: string;
  housingSituation: HousingSituation;
  pporEstimatedValue: string;
  pporLoanBalance: string;
  ipRows: IpRow[];
  otherDebts: string;
  age: string;
  dependentsCount: string;
  investmentHorizonYears: string;
  intendedPortfolioSize: 1 | 2 | 3 | 4 | 5;
  primaryGoal: GoalRanking;
  secondaryGoal: GoalRanking | "";
  riskTolerance: RiskTolerance;
  handsOnPreference: HandsOnPreference;
  preferredStates: string[];
  exclusions: StrategyInput["exclusions"];
  successVision: string;
  primaryConcern: string;
  additionalContext: string;
}): StrategyInput {
  const existingInvestmentProperties = args.ipRows.map((row) => ({
    estimatedValue: parseAudNumber(row.estimatedValue),
    loanBalance: parseAudNumber(row.loanBalance),
    weeklyRent: parseAudNumber(row.weeklyRent),
  }));

  const base: StrategyInput = {
    annualGrossIncome: parseAudNumber(args.annualGrossIncome),
    annualSavingsRate: parseAudNumber(args.annualSavingsRate),
    liquidDepositAvailable: parseAudNumber(args.liquidDepositAvailable),
    housingSituation: args.housingSituation,
    ppor:
      args.housingSituation === "own_ppor"
        ? {
            estimatedValue: parseAudNumber(args.pporEstimatedValue),
            loanBalance: parseAudNumber(args.pporLoanBalance),
          }
        : null,
    existingInvestmentProperties,
    otherDebts: parseAudNumber(args.otherDebts),
    age: parseIntLoose(args.age),
    dependentsCount: parseIntLoose(args.dependentsCount),
    investmentHorizonYears: parseIntLoose(args.investmentHorizonYears),
    intendedPortfolioSize: args.intendedPortfolioSize,
    primaryGoal: args.primaryGoal,
    secondaryGoal: args.secondaryGoal === "" ? null : args.secondaryGoal,
    riskTolerance: args.riskTolerance,
    handsOnPreference: args.handsOnPreference,
    preferredStates: args.preferredStates,
    exclusions: args.exclusions,
    successVision: args.successVision,
    primaryConcern: args.primaryConcern,
    additionalContext: args.additionalContext,
  };

  if (args.partnerAnnualGrossIncome.trim() !== "") {
    base.partnerAnnualGrossIncome = parseAudNumber(args.partnerAnnualGrossIncome);
  }

  const fn = args.firstName.trim();
  if (fn) {
    return { ...base, firstName: fn };
  }
  return base;
}

const FREE_MAX = 500;
function CharCount({ len }: { len: number }) {
  return (
    <span className="text-[10px] text-zinc-500 tabular-nums">
      {len} / {FREE_MAX}
    </span>
  );
}

export function StrategyForm({
  onSubmit,
  disabled,
}: {
  onSubmit: (input: StrategyInput) => void;
  disabled?: boolean;
}) {
  const [firstName, setFirstName] = useState("");
  const [annualGrossIncome, setAnnualGrossIncome] = useState("120000");
  const [partnerAnnualGrossIncome, setPartnerAnnualGrossIncome] = useState("");
  const [annualSavingsRate, setAnnualSavingsRate] = useState("24000");
  const [liquidDepositAvailable, setLiquidDepositAvailable] = useState("80000");
  const [housingSituation, setHousingSituation] =
    useState<HousingSituation>("renting");
  const [pporEstimatedValue, setPporEstimatedValue] = useState("0");
  const [pporLoanBalance, setPporLoanBalance] = useState("0");
  const [ipRows, setIpRows] = useState<IpRow[]>([]);
  const [otherDebts, setOtherDebts] = useState("0");
  const [age, setAge] = useState("35");
  const [dependentsCount, setDependentsCount] = useState("0");
  const [investmentHorizonYears, setInvestmentHorizonYears] = useState("15");
  const [intendedPortfolioSize, setIntendedPortfolioSize] = useState<
    1 | 2 | 3 | 4 | 5
  >(2);
  const [primaryGoal, setPrimaryGoal] = useState<GoalRanking>("capital_growth");
  const [secondaryGoal, setSecondaryGoal] = useState<GoalRanking | "">("");
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("moderate");
  const [handsOnPreference, setHandsOnPreference] =
    useState<HandsOnPreference>("light_touch");
  const [preferredStates, setPreferredStates] = useState<string[]>(["QLD", "NSW"]);
  const [exclusions, setExclusions] = useState<StrategyInput["exclusions"]>({
    avoidRegional: false,
    avoidMiningTowns: true,
    avoidApartments: false,
    avoidNewBuilds: false,
  });
  const [successVision, setSuccessVision] = useState("");
  const [primaryConcern, setPrimaryConcern] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});

  const assembled = useMemo(
    () =>
      assembleStrategyInput({
        firstName,
        annualGrossIncome,
        partnerAnnualGrossIncome,
        annualSavingsRate,
        liquidDepositAvailable,
        housingSituation,
        pporEstimatedValue,
        pporLoanBalance,
        ipRows,
        otherDebts,
        age,
        dependentsCount,
        investmentHorizonYears,
        intendedPortfolioSize,
        primaryGoal,
        secondaryGoal,
        riskTolerance,
        handsOnPreference,
        preferredStates,
        exclusions,
        successVision,
        primaryConcern,
        additionalContext,
      }),
    [
      firstName,
      annualGrossIncome,
      partnerAnnualGrossIncome,
      annualSavingsRate,
      liquidDepositAvailable,
      housingSituation,
      pporEstimatedValue,
      pporLoanBalance,
      ipRows,
      otherDebts,
      age,
      dependentsCount,
      investmentHorizonYears,
      intendedPortfolioSize,
      primaryGoal,
      secondaryGoal,
      riskTolerance,
      handsOnPreference,
      preferredStates,
      exclusions,
      successVision,
      primaryConcern,
      additionalContext,
    ]
  );

  const validation = useMemo(() => strategyInputSchema.safeParse(assembled), [assembled]);
  const isValid = validation.success;

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-zinc-600/80 bg-zinc-900/60 px-3 py-2.5 text-base text-zinc-100 shadow-inner outline-none ring-violet-500/0 transition placeholder:text-zinc-500 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20";
  const labelClass = "text-sm font-medium text-zinc-200";
  const fieldErrClass =
    "border-amber-500/40 ring-1 ring-amber-500/10 focus:border-amber-500/55 focus:ring-amber-500/20";
  const fieldErrMsgClass =
    "mt-1.5 rounded-md border border-amber-500/20 bg-amber-950/20 px-2.5 py-1.5 text-xs leading-snug text-zinc-200";

  function onNumberBlur(setValue: Dispatch<SetStateAction<string>>) {
    return (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/,/g, "");
      const n = parseFloat(raw);
      if (Number.isFinite(n) && !raw.includes(".")) {
        setValue(n.toLocaleString("en-AU"));
      }
    };
  }

  function toggleState(code: string) {
    setPreferredStates((prev) =>
      prev.includes(code) ? prev.filter((s) => s !== code) : [...prev, code]
    );
  }

  function updatePrimaryGoal(goal: GoalRanking) {
    setPrimaryGoal(goal);
    setSecondaryGoal((current) => (current === goal ? "" : current));
  }

  function addIpRow() {
    setIpRows((r) => [...r, { estimatedValue: "", loanBalance: "", weeklyRent: "" }]);
  }

  function removeIpRow(idx: number) {
    setIpRows((r) => r.filter((_, i) => i !== idx));
  }

  function updateIpRow(idx: number, patch: Partial<IpRow>) {
    setIpRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = strategyInputSchema.safeParse(assembled);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      parsed.error.issues.forEach((iss) => {
        const key = iss.path.length ? iss.path.join(".") : "_form";
        if (!next[key]) next[key] = iss.message;
      });
      setSubmitErrors(next);
      return;
    }
    setSubmitErrors({});
    onSubmit(parsed.data);
  }

  const err = (key: string) => submitErrors[key];

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <section className="space-y-5">
        <FormSectionHeading title="Your situation" infoLabel="Your situation">
          Income, deposit, home ownership, and any investment properties you already hold.
        </FormSectionHeading>

        <label className="block text-left">
          <span className={labelClass}>First name (optional, not sent to the advisor model)</span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
            autoComplete="given-name"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-left">
            <span className={labelClass}>
              Your annual gross income (AUD) <RequiredMark />
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={annualGrossIncome}
              onChange={(e) => setAnnualGrossIncome(e.target.value)}
              onBlur={onNumberBlur(setAnnualGrossIncome)}
              className={`${inputClass} ${err("annualGrossIncome") ? fieldErrClass : ""}`}
            />
            {err("annualGrossIncome") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("annualGrossIncome")}
              </p>
            ) : null}
          </label>
          <label className="block text-left">
            <span className={labelClass}>Partner annual gross income (optional)</span>
            <input
              type="text"
              inputMode="decimal"
              value={partnerAnnualGrossIncome}
              onChange={(e) => setPartnerAnnualGrossIncome(e.target.value)}
              onBlur={onNumberBlur(setPartnerAnnualGrossIncome)}
              className={`${inputClass} ${err("partnerAnnualGrossIncome") ? fieldErrClass : ""}`}
            />
            {err("partnerAnnualGrossIncome") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("partnerAnnualGrossIncome")}
              </p>
            ) : null}
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-left">
            <span className={labelClass}>
              Annual savings rate (AUD) <RequiredMark />
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={annualSavingsRate}
              onChange={(e) => setAnnualSavingsRate(e.target.value)}
              onBlur={onNumberBlur(setAnnualSavingsRate)}
              className={`${inputClass} ${err("annualSavingsRate") ? fieldErrClass : ""}`}
            />
            {err("annualSavingsRate") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("annualSavingsRate")}
              </p>
            ) : null}
          </label>
          <label className="block text-left">
            <span className={labelClass}>
              Liquid deposit available (AUD) <RequiredMark />
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={liquidDepositAvailable}
              onChange={(e) => setLiquidDepositAvailable(e.target.value)}
              onBlur={onNumberBlur(setLiquidDepositAvailable)}
              className={`${inputClass} ${err("liquidDepositAvailable") ? fieldErrClass : ""}`}
            />
            {err("liquidDepositAvailable") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("liquidDepositAvailable")}
              </p>
            ) : null}
          </label>
        </div>

        <div>
          <span className={labelClass}>Housing situation</span>
          <div
            className="mt-2 flex flex-wrap gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/60 p-1"
            role="group"
          >
            {(
              [
                { v: "own_ppor" as const, label: "Own home (PPOR)" },
                { v: "renting" as const, label: "Renting" },
                { v: "with_family" as const, label: "With family / other" },
              ] as const
            ).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setHousingSituation(v)}
                className={`flex-1 min-w-[7rem] rounded-lg py-2.5 text-sm font-medium transition ${
                  housingSituation === v
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {err("ppor") ? (
            <p className={`${fieldErrMsgClass} mt-2`} role="alert">
              {err("ppor")}
            </p>
          ) : null}
        </div>

        {housingSituation === "own_ppor" ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-left">
              <span className={labelClass}>PPOR estimated value (AUD)</span>
              <input
                type="text"
                inputMode="decimal"
                value={pporEstimatedValue}
                onChange={(e) => setPporEstimatedValue(e.target.value)}
                onBlur={onNumberBlur(setPporEstimatedValue)}
                className={`${inputClass} ${err("ppor.estimatedValue") ? fieldErrClass : ""}`}
              />
            </label>
            <label className="block text-left">
              <span className={labelClass}>PPOR loan balance (AUD)</span>
              <input
                type="text"
                inputMode="decimal"
                value={pporLoanBalance}
                onChange={(e) => setPporLoanBalance(e.target.value)}
                onBlur={onNumberBlur(setPporLoanBalance)}
                className={`${inputClass} ${err("ppor.loanBalance") ? fieldErrClass : ""}`}
              />
            </label>
          </div>
        ) : null}

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={labelClass}>Existing investment properties</span>
            <button
              type="button"
              onClick={addIpRow}
              className="text-xs font-medium text-violet-400 hover:text-violet-300"
            >
              + Add property
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Leave empty if none. Values can be zero for a placeholder row.</p>
          <div className="mt-3 space-y-3">
            {ipRows.map((row, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 p-4 space-y-3"
              >
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeIpRow(idx)}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs text-zinc-400">Est. value</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.estimatedValue}
                      onChange={(e) => updateIpRow(idx, { estimatedValue: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Loan balance</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.loanBalance}
                      onChange={(e) => updateIpRow(idx, { loanBalance: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-400">Weekly rent</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.weeklyRent}
                      onChange={(e) => updateIpRow(idx, { weeklyRent: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
          {Object.keys(submitErrors).some((k) => k.startsWith("existingInvestmentProperties")) ? (
            <p className={`${fieldErrMsgClass} mt-2`} role="alert">
              Check investment property values — all must be valid numbers.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block text-left">
            <span className={labelClass}>Other debts (AUD)</span>
            <input
              type="text"
              inputMode="decimal"
              value={otherDebts}
              onChange={(e) => setOtherDebts(e.target.value)}
              onBlur={onNumberBlur(setOtherDebts)}
              className={inputClass}
            />
          </label>
          <label className="block text-left">
            <span className={labelClass}>
              Your age <RequiredMark />
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={`${inputClass} ${err("age") ? fieldErrClass : ""}`}
            />
            {err("age") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("age")}
              </p>
            ) : null}
          </label>
          <label className="block text-left">
            <span className={labelClass}>Dependents</span>
            <input
              type="text"
              inputMode="numeric"
              value={dependentsCount}
              onChange={(e) => setDependentsCount(e.target.value)}
              className={`${inputClass} ${err("dependentsCount") ? fieldErrClass : ""}`}
            />
          </label>
        </div>
      </section>

      <section className="space-y-5 border-t border-zinc-700/60 pt-10">
        <FormSectionHeading title="Your goals" infoLabel="Your goals">
          Horizon, portfolio size, and what you are optimising for.
        </FormSectionHeading>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-left">
            <span className={labelClass}>
              Investment horizon (years) <RequiredMark />
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={investmentHorizonYears}
              onChange={(e) => setInvestmentHorizonYears(e.target.value)}
              className={`${inputClass} ${err("investmentHorizonYears") ? fieldErrClass : ""}`}
            />
            {err("investmentHorizonYears") ? (
              <p className={fieldErrMsgClass} role="alert">
                {err("investmentHorizonYears")}
              </p>
            ) : null}
          </label>
          <label className="block text-left">
            <span className={labelClass}>Intended portfolio size</span>
            <select
              value={intendedPortfolioSize}
              onChange={(e) =>
                setIntendedPortfolioSize(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)
              }
              className={inputClass}
            >
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "property" : "properties"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-left">
          <span className={labelClass}>
            Primary goal <RequiredMark />
          </span>
          <select
            value={primaryGoal}
            onChange={(e) => updatePrimaryGoal(e.target.value as GoalRanking)}
            className={inputClass}
          >
            {GOAL_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-left">
          <span className={labelClass}>Secondary goal (optional)</span>
          <select
            value={secondaryGoal}
            onChange={(e) => setSecondaryGoal(e.target.value as GoalRanking | "")}
            className={inputClass}
          >
            <option value="">None</option>
            {GOAL_OPTIONS.map((g) => (
              <option key={g.value} value={g.value} disabled={g.value === primaryGoal}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="space-y-5 border-t border-zinc-700/60 pt-10">
        <FormSectionHeading title="Your preferences" infoLabel="Your preferences">
          Risk style, involvement, states, and hard exclusions.
        </FormSectionHeading>

        <div>
          <span className={labelClass}>Risk tolerance</span>
          <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/60 p-1">
            {(
              [
                { v: "conservative" as const, label: "Conservative" },
                { v: "moderate" as const, label: "Moderate" },
                { v: "aggressive" as const, label: "Aggressive" },
              ] as const
            ).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setRiskTolerance(v)}
                className={`flex-1 min-w-[6rem] rounded-lg py-2.5 text-sm font-medium transition ${
                  riskTolerance === v
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelClass}>Hands-on preference</span>
          <div className="mt-2 flex flex-wrap gap-2 rounded-xl border border-zinc-600/80 bg-zinc-900/60 p-1">
            {(
              [
                { v: "hands_off" as const, label: "Hands off" },
                { v: "light_touch" as const, label: "Light touch" },
                { v: "hands_on" as const, label: "Hands on" },
              ] as const
            ).map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setHandsOnPreference(v)}
                className={`flex-1 min-w-[6rem] rounded-lg py-2.5 text-sm font-medium transition ${
                  handsOnPreference === v
                    ? "bg-violet-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelClass}>Preferred states / territories</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {AU_STATES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => toggleState(code)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  preferredStates.includes(code)
                    ? "border-violet-500/60 bg-violet-950/40 text-violet-200"
                    : "border-zinc-600/80 bg-zinc-950/40 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {code}
              </button>
            ))}
          </div>
          {err("preferredStates") ? (
            <p className={`${fieldErrMsgClass} mt-2`} role="alert">
              {err("preferredStates")}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-zinc-700/50 bg-zinc-950/30 p-4">
          <p className="text-xs font-medium text-zinc-400">Exclusions</p>
          {(
            [
              ["avoidRegional", "Avoid regional markets"],
              ["avoidMiningTowns", "Avoid mining-dependent towns"],
              ["avoidApartments", "Avoid apartments / strata"],
              ["avoidNewBuilds", "Avoid new builds / off-the-plan"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={exclusions[key]}
                onChange={(e) =>
                  setExclusions((prev) => ({ ...prev, [key]: e.target.checked }))
                }
                className="size-4 rounded border-zinc-600 bg-zinc-900 text-violet-600 focus:ring-violet-500/30"
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-5 border-t border-zinc-700/60 pt-10">
        <FormSectionHeading title="About you" infoLabel="About you">
          Free text — used to personalise tone and priorities. Max {FREE_MAX} characters each.
        </FormSectionHeading>

        <label className="block text-left">
          <div className="flex justify-between gap-2">
            <span className={labelClass}>What does success look like?</span>
            <CharCount len={successVision.length} />
          </div>
          <textarea
            value={successVision}
            maxLength={FREE_MAX}
            onChange={(e) => setSuccessVision(e.target.value)}
            rows={4}
            className={`${inputClass} min-h-[6rem] resize-y ${err("successVision") ? fieldErrClass : ""}`}
          />
          {err("successVision") ? (
            <p className={fieldErrMsgClass} role="alert">
              {err("successVision")}
            </p>
          ) : null}
        </label>

        <label className="block text-left">
          <div className="flex justify-between gap-2">
            <span className={labelClass}>Primary concern</span>
            <CharCount len={primaryConcern.length} />
          </div>
          <textarea
            value={primaryConcern}
            maxLength={FREE_MAX}
            onChange={(e) => setPrimaryConcern(e.target.value)}
            rows={4}
            className={`${inputClass} min-h-[6rem] resize-y ${err("primaryConcern") ? fieldErrClass : ""}`}
          />
          {err("primaryConcern") ? (
            <p className={fieldErrMsgClass} role="alert">
              {err("primaryConcern")}
            </p>
          ) : null}
        </label>

        <label className="block text-left">
          <div className="flex justify-between gap-2">
            <span className={labelClass}>Anything else we should know?</span>
            <CharCount len={additionalContext.length} />
          </div>
          <textarea
            value={additionalContext}
            maxLength={FREE_MAX}
            onChange={(e) => setAdditionalContext(e.target.value)}
            rows={4}
            className={`${inputClass} min-h-[6rem] resize-y ${err("additionalContext") ? fieldErrClass : ""}`}
          />
          {err("additionalContext") ? (
            <p className={fieldErrMsgClass} role="alert">
              {err("additionalContext")}
            </p>
          ) : null}
        </label>
      </section>

      {err("_form") ? (
        <p className={fieldErrMsgClass} role="alert">
          {err("_form")}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={disabled || !isValid}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
      >
        Generate strategy
      </button>
    </form>
  );
}
