/**
 * Property analysis v2 (Sprint 14 WS6) — a rate/vacancy stress test built
 * on top of the existing, proven analyzeProperty() pure function. Reuses
 * the same modelling for every shock so the stress rows can never drift
 * from the headline analysis; this file adds no new financial logic of
 * its own, only shocked re-runs of the existing one.
 */
import { analyzeProperty, type PropertyAnalysisInputs, type ScoreStatus } from "@/lib/propertyAnalysis";

export type StressShock = {
  label: string;
  rateDeltaPercent: number;
  vacancyDeltaPercent: number;
};

export type StressTestRow = {
  label: string;
  interestRatePercent: number;
  vacancyPercent: number;
  afterTaxCashflow: number;
  score: number;
  status: ScoreStatus;
};

export const DEFAULT_STRESS_SHOCKS: StressShock[] = [
  { label: "Current assumptions", rateDeltaPercent: 0, vacancyDeltaPercent: 0 },
  { label: "Rate +1%", rateDeltaPercent: 1, vacancyDeltaPercent: 0 },
  { label: "Rate +2%", rateDeltaPercent: 2, vacancyDeltaPercent: 0 },
  { label: "Rate +3%", rateDeltaPercent: 3, vacancyDeltaPercent: 0 },
  { label: "Vacancy +5pp", rateDeltaPercent: 0, vacancyDeltaPercent: 5 },
  { label: "Rate +2% & vacancy +5pp", rateDeltaPercent: 2, vacancyDeltaPercent: 5 },
];

/**
 * Runs the existing analyzeProperty() model under a small grid of
 * interest-rate and vacancy shocks. Rate is floored at 0 (a shock can
 * never imply a negative interest rate); vacancy is clamped to [0, 100].
 */
export function buildStressTestRows(
  input: PropertyAnalysisInputs,
  shocks: StressShock[] = DEFAULT_STRESS_SHOCKS
): StressTestRow[] {
  return shocks.map((shock) => {
    const shockedInput: PropertyAnalysisInputs = {
      ...input,
      interestRatePercent: Math.max(0, input.interestRatePercent + shock.rateDeltaPercent),
      vacancyPercent: Math.min(100, Math.max(0, input.vacancyPercent + shock.vacancyDeltaPercent)),
    };
    const result = analyzeProperty(shockedInput);
    return {
      label: shock.label,
      interestRatePercent: shockedInput.interestRatePercent,
      vacancyPercent: shockedInput.vacancyPercent,
      afterTaxCashflow: result.afterTaxCashflow,
      score: result.score,
      status: result.status,
    };
  });
}
