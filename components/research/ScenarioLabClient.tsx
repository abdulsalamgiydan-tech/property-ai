"use client";

import { useState } from "react";
import { calculateMonthlyRepayment, calculateLoanPrincipal, calculateRepaymentToIncomePct, calculatePriceToIncomeRatio } from "@/lib/warehouse/affordability";
import { formatAud, formatPercent } from "@/lib/formatCurrency";

// Sprint 12 WS7 — Scenario Lab. Reuses the EXACT same pure formulas as
// mart.suburb_market_snapshot's own affordability columns
// (lib/warehouse/affordability.ts, already unit-tested and proven to
// match the SQL in load_market_intelligence_to_branch.mjs) so the
// baseline scenario the user starts from matches the published snapshot
// figure exactly, then lets them adjust assumptions and see the same
// formula recompute live, client-side. Descriptive "what if" modelling
// against a REAL recorded sale price -- never a price forecast, never a
// recommendation, never a score or ranking.
export function ScenarioLabClient({
  geographyLabel,
  medianSalePrice,
  medianWeeklyHouseholdIncome,
  baselineRatePercent,
  baselineRatePeriod,
}: {
  geographyLabel: string;
  medianSalePrice: number;
  medianWeeklyHouseholdIncome: number | null;
  baselineRatePercent: number | null;
  baselineRatePeriod: string | null;
}) {
  const [depositPercent, setDepositPercent] = useState(20);
  const [termYears, setTermYears] = useState(30);
  const [ratePercent, setRatePercent] = useState(baselineRatePercent ?? 6.0);

  const principal = calculateLoanPrincipal(medianSalePrice, depositPercent);
  const monthlyRepayment = calculateMonthlyRepayment(principal, ratePercent, termYears);
  const priceToIncomeRatio = medianWeeklyHouseholdIncome ? calculatePriceToIncomeRatio(medianSalePrice, medianWeeklyHouseholdIncome) : null;
  const repaymentToIncomePct = medianWeeklyHouseholdIncome ? calculateRepaymentToIncomePct(monthlyRepayment, medianWeeklyHouseholdIncome) : null;
  const depositAmount = medianSalePrice * (depositPercent / 100);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-3 text-xs leading-relaxed text-amber-200">
        Illustrative modelling only, against {geographyLabel}&apos;s real recorded median sale price
        ({formatAud(medianSalePrice, 0)}). Not financial, tax or legal advice. Not a forecast,
        recommendation, or an estimate of what this property will sell for in future — excludes stamp
        duty, LMI and loan fees.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Deposit ({depositPercent}%)</span>
          <input
            type="range"
            min={5}
            max={50}
            step={1}
            value={depositPercent}
            onChange={(e) => setDepositPercent(Number(e.target.value))}
            className="mt-2 w-full accent-violet-500"
          />
          <span className="mt-1 block text-xs text-zinc-500">{formatAud(depositAmount, 0)}</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Loan term ({termYears} years)</span>
          <input
            type="range"
            min={15}
            max={30}
            step={1}
            value={termYears}
            onChange={(e) => setTermYears(Number(e.target.value))}
            className="mt-2 w-full accent-violet-500"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Interest rate ({ratePercent.toFixed(2)}%)</span>
          <input
            type="range"
            min={2}
            max={10}
            step={0.05}
            value={ratePercent}
            onChange={(e) => setRatePercent(Number(e.target.value))}
            className="mt-2 w-full accent-violet-500"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            {baselineRatePercent != null ? `RBA baseline: ${formatPercent(baselineRatePercent, 2)}${baselineRatePeriod ? ` (${baselineRatePeriod})` : ""}` : "No RBA baseline available"}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="text-xs text-zinc-500">Loan principal</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{formatAud(principal, 0)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="text-xs text-zinc-500">Est. monthly repayment</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{formatAud(monthlyRepayment, 0)}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="text-xs text-zinc-500">Price-to-income ratio</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{priceToIncomeRatio != null ? priceToIncomeRatio.toFixed(1) : "Unavailable"}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
          <p className="text-xs text-zinc-500">Repayment-to-income</p>
          <p className="mt-1 text-lg font-semibold text-zinc-100">{repaymentToIncomePct != null ? formatPercent(repaymentToIncomePct, 1) : "Unavailable"}</p>
        </div>
      </div>

      {medianWeeklyHouseholdIncome == null && (
        <p className="text-xs text-zinc-600">
          Price-to-income and repayment-to-income figures are unavailable — no Census household
          income match for this geography.
        </p>
      )}
    </div>
  );
}
