"use client";

import {
  FormSectionHeading,
  InfoButton,
  RequiredMark,
} from "@/components/ui/InfoButton";
import { AU_STATES } from "@/lib/constants/au";
import { formatInputNumber } from "@/lib/formatCurrency";
import { SUBURB_SUGGESTION_BANNER } from "@/lib/suburbAssumptions";
import type { Dispatch, FocusEvent, SetStateAction } from "react";
import type { ComparePropertyFormSlice } from "./useComparePropertyFormSlice";

type Props = {
  idPrefix: string;
  panelTitle: string;
  form: ComparePropertyFormSlice;
  formErrors: Record<string, string>;
  onClearField: (key: string) => void;
  disabled?: boolean;
  /** Shown only on Property B */
  onCopyFromA?: () => void;
};

export function ComparePropertyFormPanel({
  idPrefix,
  panelTitle,
  form,
  formErrors,
  onClearField,
  disabled = false,
  onCopyFromA,
}: Props) {
  const p = idPrefix;
  const fe = formErrors;
  const inputClass =
    "mt-1.5 w-full rounded-xl border border-zinc-600/80 bg-zinc-900/60 px-3 py-2.5 text-base text-zinc-100 shadow-inner outline-none ring-violet-500/0 transition placeholder:text-zinc-500 focus:border-violet-500 focus:ring-4 focus:ring-violet-500/20";
  const labelClass = "text-sm font-medium text-zinc-200";
  const helperClass = "mt-1 block text-xs text-zinc-500";
  const fieldErrClass =
    "border-amber-500/40 ring-1 ring-amber-500/10 focus:border-amber-500/55 focus:ring-amber-500/20";
  const fieldErrMsgClass =
    "mt-1.5 rounded-md border border-amber-500/20 bg-amber-950/20 px-2.5 py-1.5 text-xs leading-snug text-zinc-200";

  function onNumberBlur(setValue: Dispatch<SetStateAction<string>>) {
    return (e: FocusEvent<HTMLInputElement>) => {
      setValue(formatInputNumber(e.target.value));
    };
  }

  return (
    <div
      className={`min-w-0 rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8 ${
        disabled ? "pointer-events-none opacity-50" : ""
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold text-white">{panelTitle}</h2>
        {onCopyFromA ? (
          <button
            type="button"
            onClick={onCopyFromA}
            className="shrink-0 rounded-lg border border-violet-500/40 bg-violet-950/40 px-3 py-2 text-xs font-semibold text-violet-200 transition hover:border-violet-400/60 hover:bg-violet-900/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/45"
          >
            Copy from Property A
          </button>
        ) : null}
      </div>

      <div className="mt-8 space-y-10">
        <section className="space-y-5">
          <FormSectionHeading title="Property Basics" infoLabel="Property basics">
            Price, rent, and location — the starting point for loan size, duty, and yield.
          </FormSectionHeading>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-purchase`}>
                Purchase Price
                <RequiredMark />
              </span>
              <InfoButton label="Purchase price">
                Contract or expected price. Drives loan, stamp duty, LMI, and yield — use a figure you are
                actually prepared to pay.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-purchase`}
              aria-invalid={!!fe.purchasePrice}
              aria-describedby={fe.purchasePrice ? `${p}-err-purchase` : undefined}
              type="text"
              inputMode="decimal"
              value={form.purchasePrice}
              onChange={(e) => {
                onClearField("purchasePrice");
                form.setPurchasePrice(e.target.value);
              }}
              onBlur={onNumberBlur(form.setPurchasePrice)}
              className={`${inputClass} ${fe.purchasePrice ? fieldErrClass : ""}`}
              placeholder="e.g. 550,000"
            />
            <span className={helperClass}>
              Digits only; commas optional — we tidy the display when you leave the field.
            </span>
            {fe.purchasePrice ? (
              <p id={`${p}-err-purchase`} className={fieldErrMsgClass} role="alert">
                {fe.purchasePrice}
              </p>
            ) : null}
          </div>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-weekly`}>
                Weekly Rent
                <RequiredMark />
              </span>
              <InfoButton label="Weekly rent">
                Rent you expect before agency fees and other costs. If the property is vacant, you can still
                enter a market rent to test the deal.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-weekly`}
              aria-invalid={!!fe.weeklyRent}
              aria-describedby={fe.weeklyRent ? `${p}-err-weekly` : undefined}
              type="text"
              inputMode="decimal"
              value={form.weeklyRent}
              onChange={(e) => {
                onClearField("weeklyRent");
                form.setWeeklyRent(e.target.value);
              }}
              onBlur={onNumberBlur(form.setWeeklyRent)}
              className={`${inputClass} ${fe.weeklyRent ? fieldErrClass : ""}`}
              placeholder="e.g. 520"
            />
            {fe.weeklyRent ? (
              <p id={`${p}-err-weekly`} className={fieldErrMsgClass} role="alert">
                {fe.weeklyRent}
              </p>
            ) : null}
          </div>

          <label className="block text-left" htmlFor={`${p}-fld-suburb`}>
            <span className={labelClass}>Suburb</span>
            <input
              id={`${p}-fld-suburb`}
              type="text"
              value={form.suburb}
              onChange={(e) => {
                form.setSuburb(e.target.value);
                form.clearSuburbSuggestion();
              }}
              onBlur={() => form.applySuburbSuggestedAssumptions()}
              className={inputClass}
              placeholder="Calderwood"
              autoComplete="address-level2"
            />
            <span className={helperClass}>
              Used for labels and context. Optional suburb-based hints may appear under Advanced Assumptions
              when available — you can always override them.
            </span>
          </label>

          <label className="block text-left" htmlFor={`${p}-fld-address`}>
            <span className="mb-1.5 block text-xs font-medium text-zinc-500">
              Property address <span className="font-normal text-zinc-600">(optional)</span>
            </span>
            <input
              id={`${p}-fld-address`}
              type="text"
              value={form.propertyAddress}
              onChange={(e) => form.setPropertyAddress(e.target.value)}
              className={inputClass}
              placeholder="Street and number — for your notes only"
              autoComplete="street-address"
            />
            <span className={helperClass}>Not used in calculations; suburb and state drive duty and modelling.</span>
          </label>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-state`}>
                State / Territory
              </span>
              <InfoButton label="State / territory">
                Sets indicative stamp duty for this model. Choose the state or territory where the property
                sits.
              </InfoButton>
            </div>
            <select
              aria-labelledby={`${p}-lbl-state`}
              value={form.state}
              onChange={(e) => form.setState(e.target.value)}
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
            Deposit, rate, loan structure, and term — what you pay to hold the asset and how debt pays down
            over time.
          </FormSectionHeading>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-deposit`}>
                Deposit (%)
                <RequiredMark />
              </span>
              <InfoButton label="Deposit">
                Your equity as a percentage of the purchase price (e.g. 20 means 20%). A smaller deposit
                means a larger loan and usually higher LMI if LVR is above 80%.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-deposit`}
              aria-invalid={!!fe.depositPercent}
              aria-describedby={fe.depositPercent ? `${p}-err-deposit` : undefined}
              type="text"
              inputMode="decimal"
              value={form.depositPercent}
              onChange={(e) => {
                onClearField("depositPercent");
                form.setDepositPercent(e.target.value);
              }}
              onBlur={onNumberBlur(form.setDepositPercent)}
              className={`${inputClass} ${fe.depositPercent ? fieldErrClass : ""}`}
              placeholder="e.g. 20"
            />
            <span className={helperClass}>% of purchase price, not a dollar amount.</span>
            {fe.depositPercent ? (
              <p id={`${p}-err-deposit`} className={fieldErrMsgClass} role="alert">
                {fe.depositPercent}
              </p>
            ) : null}
          </div>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-rate`}>
                Interest Rate (%)
                <RequiredMark />
              </span>
              <InfoButton label="Interest rate">
                Annual interest on the loan (e.g. 6.2 for 6.2% p.a.). Match it to your bank&apos;s offer or
                a stress-test rate you want to explore.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-rate`}
              aria-invalid={!!fe.interestRate}
              aria-describedby={fe.interestRate ? `${p}-err-rate` : undefined}
              type="text"
              inputMode="decimal"
              value={form.interestRate}
              onChange={(e) => {
                onClearField("interestRate");
                form.setInterestRate(e.target.value);
              }}
              onBlur={onNumberBlur(form.setInterestRate)}
              className={`${inputClass} ${fe.interestRate ? fieldErrClass : ""}`}
              placeholder="e.g. 6.2"
            />
            <span className={helperClass}>Enter as a percentage per annum.</span>
            {fe.interestRate ? (
              <p id={`${p}-err-rate`} className={fieldErrMsgClass} role="alert">
                {fe.interestRate}
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
                P&amp;I repays principal over the term; IO pays interest only for the period you model —
                balance stays flat until you refinance or switch.
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
                  onClick={() => form.setIsInterestOnly(value)}
                  className={`flex-1 py-2.5 text-sm font-medium transition ${
                    form.isInterestOnly === value ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-term`}>
                Loan Term (years)
                <RequiredMark />
              </span>
              <InfoButton label="Loan term">
                How long the loan runs in whole years. Shorter terms mean higher repayments but faster equity
                build on P&amp;I.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-term`}
              aria-invalid={!!fe.loanTermYears}
              aria-describedby={fe.loanTermYears ? `${p}-err-term` : undefined}
              type="text"
              inputMode="numeric"
              value={form.loanTermYears}
              onChange={(e) => {
                onClearField("loanTermYears");
                form.setLoanTermYears(e.target.value);
              }}
              onBlur={onNumberBlur(form.setLoanTermYears)}
              className={`${inputClass} ${fe.loanTermYears ? fieldErrClass : ""}`}
              placeholder="30"
            />
            {fe.loanTermYears ? (
              <p id={`${p}-err-term`} className={fieldErrMsgClass} role="alert">
                {fe.loanTermYears}
              </p>
            ) : null}
          </div>
        </section>

        <section className="space-y-5 border-t border-zinc-700/60 pt-10">
          <FormSectionHeading title="Holding Costs" infoLabel="Holding costs">
            Ongoing costs outside the mortgage — rates, insurance, maintenance, and letting fees.
          </FormSectionHeading>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-exp`}>
                Annual Expenses
                <RequiredMark />
              </span>
              <InfoButton label="Annual expenses">
                A single annual figure for everything except the loan: council rates, insurance, repairs, strata
                if applicable, and similar. Excludes principal and interest.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-exp`}
              aria-invalid={!!fe.annualExpenses}
              aria-describedby={fe.annualExpenses ? `${p}-err-exp` : undefined}
              type="text"
              inputMode="decimal"
              value={form.annualExpenses}
              onChange={(e) => {
                onClearField("annualExpenses");
                form.setAnnualExpenses(e.target.value);
              }}
              onBlur={onNumberBlur(form.setAnnualExpenses)}
              className={`${inputClass} ${fe.annualExpenses ? fieldErrClass : ""}`}
              placeholder="6,500"
            />
            {fe.annualExpenses ? (
              <p id={`${p}-err-exp`} className={fieldErrMsgClass} role="alert">
                {fe.annualExpenses}
              </p>
            ) : null}
          </div>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-pm`}>
                Property Management / Real Estate Fee (% of rent)
              </span>
              <InfoButton label="Property management and real estate fee">
                What the agent keeps as a percentage of rent collected (before other costs). Many Australian
                investors use roughly 7–10%; enter 0 if self-managed.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-pm`}
              aria-invalid={!!fe.pmFeePercent}
              aria-describedby={fe.pmFeePercent ? `${p}-err-pm` : undefined}
              type="text"
              inputMode="decimal"
              value={form.pmFeePercent}
              onChange={(e) => {
                onClearField("pmFeePercent");
                form.setPmFeePercent(e.target.value);
              }}
              onBlur={onNumberBlur(form.setPmFeePercent)}
              className={`${inputClass} ${fe.pmFeePercent ? fieldErrClass : ""}`}
              placeholder="8"
            />
            {fe.pmFeePercent ? (
              <p id={`${p}-err-pm`} className={fieldErrMsgClass} role="alert">
                {fe.pmFeePercent}
              </p>
            ) : null}
            <span className={helperClass}>
              Percentage of rent collected — 0 if you manage the property yourself.
            </span>
          </div>
        </section>

        <section className="space-y-5 border-t border-zinc-700/60 pt-10">
          <FormSectionHeading title="Tax & Depreciation" infoLabel="Tax and depreciation">
            Rough inputs for marginal tax and simplified depreciation — illustrative only, not lodgement
            advice.
          </FormSectionHeading>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-salary`}>
                Pre-tax Salary (AUD / year)
                <RequiredMark />
              </span>
              <InfoButton label="Pre-tax salary">
                Used only to pick an approximate marginal tax rate for this model. Use your ordinary income
                before tax; it is not comprehensive tax advice.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-salary`}
              aria-invalid={!!fe.preTaxSalary}
              aria-describedby={fe.preTaxSalary ? `${p}-err-salary` : undefined}
              type="text"
              inputMode="decimal"
              value={form.preTaxSalary}
              onChange={(e) => {
                onClearField("preTaxSalary");
                form.setPreTaxSalary(e.target.value);
              }}
              onBlur={onNumberBlur(form.setPreTaxSalary)}
              className={`${inputClass} ${fe.preTaxSalary ? fieldErrClass : ""}`}
              placeholder="120,000"
            />
            {fe.preTaxSalary ? (
              <p id={`${p}-err-salary`} className={fieldErrMsgClass} role="alert">
                {fe.preTaxSalary}
              </p>
            ) : null}
          </div>

          <div className="block text-left">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={labelClass} id={`${p}-lbl-yb`}>
                Year Built
                <RequiredMark />
              </span>
              <InfoButton label="Year built">
                Drives a simple building-depreciation rule in this model (e.g. post-1987 builds). Confirm
                actual deductions with a quantity surveyor.
              </InfoButton>
            </div>
            <input
              aria-labelledby={`${p}-lbl-yb`}
              aria-invalid={!!fe.yearBuilt}
              aria-describedby={fe.yearBuilt ? `${p}-err-yb` : undefined}
              type="text"
              inputMode="numeric"
              value={form.yearBuilt}
              onChange={(e) => {
                onClearField("yearBuilt");
                form.setYearBuilt(e.target.value);
              }}
              onBlur={onNumberBlur(form.setYearBuilt)}
              className={`${inputClass} ${fe.yearBuilt ? fieldErrClass : ""}`}
              placeholder="2010"
            />
            {fe.yearBuilt ? (
              <p id={`${p}-err-yb`} className={fieldErrMsgClass} role="alert">
                {fe.yearBuilt}
              </p>
            ) : null}
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            Tax and depreciation here are estimates for discussion only — always confirm with a registered tax
            agent and quantity surveyor.
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
                Optional growth, vacancy, and depreciation inputs. Defaults are fine to start; adjust when you
                want to stress-test or match your own view.
              </InfoButton>
            </span>
            <span className="shrink-0 text-zinc-500 transition group-open/advanced:rotate-180">▼</span>
          </summary>
          <div className="space-y-4 border-t border-zinc-700/50 px-4 pb-4 pt-4">
            <p className="text-xs leading-relaxed text-zinc-500">
              Sensible defaults apply. If suburb-based suggestions appear, they are starting points only —
              edit freely. Nothing here is a forecast of future returns.
            </p>
            {form.suburbSuggestionActive ? (
              <p className="rounded-lg border border-violet-500/30 bg-violet-950/30 px-3 py-2 text-xs leading-relaxed text-violet-100/90">
                {SUBURB_SUGGESTION_BANNER}
              </p>
            ) : null}
            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-suburb-g`}>
                  Suburb Growth Rate (% / year)
                </span>
                <InfoButton label="Suburb growth rate">
                  Annual rate applied to property value in long-term charts. It is an assumption you control —
                  not a prediction.
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-suburb-g`}
                aria-invalid={!!fe.suburbGrowthPercent}
                aria-describedby={fe.suburbGrowthPercent ? `${p}-err-suburb-g` : undefined}
                type="text"
                inputMode="decimal"
                value={form.suburbGrowthPercent}
                onChange={(e) => {
                  onClearField("suburbGrowthPercent");
                  form.clearSuburbSuggestion();
                  form.setSuburbGrowthPercent(e.target.value);
                }}
                onBlur={onNumberBlur(form.setSuburbGrowthPercent)}
                className={`${inputClass} ${fe.suburbGrowthPercent ? fieldErrClass : ""}`}
                placeholder="5"
              />
              {fe.suburbGrowthPercent ? (
                <p id={`${p}-err-suburb-g`} className={fieldErrMsgClass} role="alert">
                  {fe.suburbGrowthPercent}
                </p>
              ) : null}
            </div>

            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-vac`}>
                  Vacancy Rate (%)
                </span>
                <InfoButton label="Vacancy rate">
                  Expected average time without rent, expressed as a percentage (e.g. 2 means ~2% of the year
                  vacant). Higher values reduce effective rent in the model.
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-vac`}
                aria-invalid={!!fe.vacancyPercent}
                aria-describedby={fe.vacancyPercent ? `${p}-err-vac` : undefined}
                type="text"
                inputMode="decimal"
                value={form.vacancyPercent}
                onChange={(e) => {
                  onClearField("vacancyPercent");
                  form.clearSuburbSuggestion();
                  form.setVacancyPercent(e.target.value);
                }}
                onBlur={onNumberBlur(form.setVacancyPercent)}
                className={`${inputClass} ${fe.vacancyPercent ? fieldErrClass : ""}`}
                placeholder="2"
              />
              {fe.vacancyPercent ? (
                <p id={`${p}-err-vac`} className={fieldErrMsgClass} role="alert">
                  {fe.vacancyPercent}
                </p>
              ) : null}
            </div>

            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-rg`}>
                  Rental Growth Rate (% p.a.)
                </span>
                <InfoButton label="Rental growth rate">
                  How fast rent compounds each year in projection charts. Adjust to reflect your own rent
                  review assumptions.
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-rg`}
                aria-invalid={!!fe.rentalGrowthRate}
                aria-describedby={fe.rentalGrowthRate ? `${p}-err-rg` : undefined}
                type="text"
                inputMode="decimal"
                value={form.rentalGrowthRate}
                onChange={(e) => {
                  onClearField("rentalGrowthRate");
                  form.clearSuburbSuggestion();
                  form.setRentalGrowthRate(e.target.value);
                }}
                onBlur={onNumberBlur(form.setRentalGrowthRate)}
                className={`${inputClass} ${fe.rentalGrowthRate ? fieldErrClass : ""}`}
                placeholder="3"
              />
              {fe.rentalGrowthRate ? (
                <p id={`${p}-err-rg`} className={fieldErrMsgClass} role="alert">
                  {fe.rentalGrowthRate}
                </p>
              ) : null}
            </div>

            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-eg`}>
                  Annual Expenses Growth Rate (% p.a.)
                </span>
                <InfoButton label="Expenses growth rate">
                  How fast you expect non-loan costs to rise each year in projections (e.g. rates and
                  insurance).
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-eg`}
                id={`${p}-fld-eg`}
                type="text"
                inputMode="decimal"
                aria-invalid={!!fe.expensesGrowthRate}
                aria-describedby={fe.expensesGrowthRate ? `${p}-err-eg` : undefined}
                value={form.expensesGrowthRate}
                onChange={(e) => {
                  onClearField("expensesGrowthRate");
                  form.setExpensesGrowthRate(e.target.value);
                }}
                onBlur={onNumberBlur(form.setExpensesGrowthRate)}
                className={`${inputClass} ${fe.expensesGrowthRate ? fieldErrClass : ""}`}
                placeholder="2.5"
              />
              {fe.expensesGrowthRate ? (
                <p id={`${p}-err-eg`} className={fieldErrMsgClass} role="alert">
                  {fe.expensesGrowthRate}
                </p>
              ) : null}
            </div>

            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-bvp`}>
                  Building Value % of Purchase Price
                </span>
                <InfoButton label="Building value percentage">
                  Rough split between building and land as a percentage of price. Used only for a simplified
                  depreciation estimate — not a valuation.
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-bvp`}
                aria-invalid={!!fe.buildingValuePercent}
                aria-describedby={fe.buildingValuePercent ? `${p}-err-bvp` : undefined}
                type="text"
                inputMode="decimal"
                value={form.buildingValuePercent}
                onChange={(e) => {
                  onClearField("buildingValuePercent");
                  form.setBuildingValuePercent(e.target.value);
                }}
                onBlur={onNumberBlur(form.setBuildingValuePercent)}
                className={`${inputClass} ${fe.buildingValuePercent ? fieldErrClass : ""}`}
                placeholder="80"
              />
              {fe.buildingValuePercent ? (
                <p id={`${p}-err-bvp`} className={fieldErrMsgClass} role="alert">
                  {fe.buildingValuePercent}
                </p>
              ) : null}
            </div>

            <div className="block text-left">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className={labelClass} id={`${p}-lbl-fix`}>
                  Fixtures / Plant Estimate (AUD)
                </span>
                <InfoButton label="Fixtures and plant">
                  A rough dollar figure for depreciable chattels (carpets, appliances, etc.). The model applies
                  a simple rule — confirm real deductions with a quantity surveyor.
                </InfoButton>
              </div>
              <input
                aria-labelledby={`${p}-lbl-fix`}
                aria-invalid={!!fe.fixturesEstimate}
                aria-describedby={fe.fixturesEstimate ? `${p}-err-fix` : undefined}
                type="text"
                inputMode="decimal"
                value={form.fixturesEstimate}
                onChange={(e) => {
                  onClearField("fixturesEstimate");
                  form.setFixturesEstimate(e.target.value);
                }}
                onBlur={onNumberBlur(form.setFixturesEstimate)}
                className={`${inputClass} ${fe.fixturesEstimate ? fieldErrClass : ""}`}
                placeholder="10,000"
              />
              {fe.fixturesEstimate ? (
                <p id={`${p}-err-fix`} className={fieldErrMsgClass} role="alert">
                  {fe.fixturesEstimate}
                </p>
              ) : null}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
