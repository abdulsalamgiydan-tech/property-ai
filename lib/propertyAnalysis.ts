import {
  combineStrategyWeightedScore,
  DEFAULT_INVESTMENT_STRATEGY,
  INVESTMENT_STRATEGIES,
  type InvestmentStrategyId,
} from "@/lib/investmentStrategy";
import {
  buildAmortisationScheduleYearly,
  buildCashflowProjectionSeriesBudget2026,
  firstLoanYearFinance,
} from "@/lib/projections";
import { calculateCGT, type CalculateCgtResult } from "@/lib/tax/budget2026Cgt";
import { calculateAnnualTaxImpact } from "@/lib/tax/budget2026AnnualTaxImpact";
import { fyEndingJuneYearForProjectionRow } from "@/lib/tax/budget2026FinancialYear";
import {
  classifyTaxScenario,
  taxScenarioLabel,
  type PropertyTypeInput,
  type TaxScenarioId,
} from "@/lib/tax/budget2026Scenario";

export type { InvestmentStrategyId } from "@/lib/investmentStrategy";

/** Illustrative purchase costs (legal, inspections, etc.) */
export const PURCHASE_COSTS_ALLOWANCE_AUD = 2100;

/**
 * When `purchaseDate` is omitted from inputs, this date is used so existing presets and
 * saved drafts stay on grandfathered (pre-budget) tax treatment until the user sets a date.
 */
export const DEAL_ANALYSER_DEFAULT_PURCHASE_DATE = new Date("2026-05-01T12:00:00+10:00");

function coercePurchaseDate(value: Date | string | undefined): Date {
  if (value === undefined) return new Date(DEAL_ANALYSER_DEFAULT_PURCHASE_DATE.getTime());
  return typeof value === "string" ? new Date(value) : value;
}

function holdYearsFromDates(purchaseDate: Date, saleDate: Date): number {
  const ms = saleDate.getTime() - purchaseDate.getTime();
  const years = ms / (365.25 * 24 * 3600 * 1000);
  return Math.max(1, Math.min(40, Math.ceil(years)));
}

/**
 * Tiered stamp duty (transfer duty) calculation for standard residential
 * investment property purchases — no first home buyer concessions applied.
 * Brackets are approximations based on 2025 state revenue schedules.
 * Always verify against the official state revenue office calculator.
 */
export function calculateStampDuty(purchasePrice: number, state: string): number {
  const p = Math.max(0, purchasePrice);
  const key = state.trim().toUpperCase();

  switch (key) {
    case "NSW": {
      // Revenue NSW standard transfer duty (no FHB concession)
      if (p <= 17_000) return p * 0.0125;
      if (p <= 36_000) return 212 + (p - 17_000) * 0.015;
      if (p <= 97_000) return 497 + (p - 36_000) * 0.0175;
      if (p <= 364_000) return 1_562 + (p - 97_000) * 0.035;
      if (p <= 1_240_000) return 10_907 + (p - 364_000) * 0.045;
      return 50_327 + (p - 1_240_000) * 0.055;
    }
    case "VIC": {
      // SRO Victoria general duty (no FHB concession, not PPR concession)
      if (p <= 25_000) return p * 0.014;
      if (p <= 130_000) return 350 + (p - 25_000) * 0.024;
      if (p <= 440_000) return 2_870 + (p - 130_000) * 0.05;
      if (p <= 960_000) return 18_370 + (p - 440_000) * 0.06;
      return 49_570 + (p - 960_000) * 0.065;
    }
    case "QLD": {
      // Queensland Revenue Office — general rate (no home concession)
      if (p <= 5_000) return 0;
      if (p <= 75_000) return (p - 5_000) * 0.015;
      if (p <= 540_000) return 1_050 + (p - 75_000) * 0.035;
      if (p <= 1_000_000) return 17_325 + (p - 540_000) * 0.045;
      return 38_025 + (p - 1_000_000) * 0.0575;
    }
    case "WA": {
      // Revenue WA general duty
      if (p <= 120_000) return p * 0.019;
      if (p <= 150_000) return 2_280 + (p - 120_000) * 0.0285;
      if (p <= 360_000) return 3_135 + (p - 150_000) * 0.038;
      if (p <= 725_000) return 11_115 + (p - 360_000) * 0.0475;
      return 28_453 + (p - 725_000) * 0.051;
    }
    case "SA": {
      // RevenueSA general conveyance duty
      if (p <= 12_000) return p * 0.01;
      if (p <= 30_000) return 120 + (p - 12_000) * 0.02;
      if (p <= 50_000) return 480 + (p - 30_000) * 0.03;
      if (p <= 100_000) return 1_080 + (p - 50_000) * 0.035;
      if (p <= 200_000) return 2_830 + (p - 100_000) * 0.04;
      if (p <= 250_000) return 6_830 + (p - 200_000) * 0.0425;
      if (p <= 300_000) return 8_955 + (p - 250_000) * 0.0475;
      return 11_330 + (p - 300_000) * 0.05;
    }
    case "TAS": {
      // SRO Tasmania general duty
      if (p <= 3_000) return 50;
      if (p <= 25_000) return 50 + (p - 3_000) * 0.0175;
      if (p <= 75_000) return 435 + (p - 25_000) * 0.0225;
      if (p <= 200_000) return 1_560 + (p - 75_000) * 0.035;
      if (p <= 375_000) return 5_935 + (p - 200_000) * 0.04;
      if (p <= 725_000) return 12_935 + (p - 375_000) * 0.0425;
      return 27_985 + (p - 725_000) * 0.045;
    }
    case "ACT": {
      // ACT Revenue — general duty (ACT uses a different structure)
      if (p <= 200_000) return p * 0.02;
      if (p <= 300_000) return 4_000 + (p - 200_000) * 0.035;
      if (p <= 500_000) return 7_500 + (p - 300_000) * 0.04;
      if (p <= 750_000) return 15_500 + (p - 500_000) * 0.05;
      if (p <= 1_455_000) return 28_000 + (p - 750_000) * 0.067;
      return 75_235 + (p - 1_455_000) * 0.07;
    }
    case "NT": {
      // NT Revenue — general duty (formula-based approximation)
      if (p <= 525_000) {
        const v = p / 1_000;
        return 0.06571441 * v * v + 15 * v;
      }
      return 24_829 + (p - 525_000) * 0.0495;
    }
    default:
      // Fallback: flat 4% if state not recognised
      return p * 0.04;
  }
}

/** LMI stamp duty rates on the premium by state (approximate). */
const LMI_STAMP_DUTY_RATE: Record<string, number> = {
  NSW: 0.09,
  VIC: 0.1,
  QLD: 0.09,
  ACT: 0.05,
  SA: 0,
  WA: 0,
  TAS: 0,
  NT: 0,
};

/**
 * Approximate LMI premium for investment property including state stamp duty
 * on the premium. Applies when LVR > 80%. Illustrative rates only — actual
 * premiums vary by lender, insurer (Helia/QBE), and loan amount.
 */
export function calculateLMI(
  loan: number,
  purchasePrice: number,
  state: string = ""
): number {
  if (purchasePrice <= 0 || loan <= 0) return 0;
  const lvr = (loan / purchasePrice) * 100;
  if (lvr <= 80) return 0;
  // Investment property rates are ~15% higher than owner-occupied
  let rate = 0;
  if (lvr <= 85) rate = 0.01;
  else if (lvr <= 90) rate = 0.02;
  else if (lvr <= 95) rate = 0.035;
  else rate = 0.05;

  const basePremium = loan * rate;
  const lmiStampDutyRate = LMI_STAMP_DUTY_RATE[state.trim().toUpperCase()] ?? 0;
  return basePremium * (1 + lmiStampDutyRate);
}

/**
 * Illustrative combined marginal rate (resident scale + Medicare levy) for salary-only input.
 * Stage 3 income tax brackets; Medicare levy uses a linear singles shading between ATO-style
 * low-income thresholds, then 2%. Does not include Medicare Levy Surcharge, offsets, or HECS.
 * Not tax advice — confirm with a tax adviser.
 */
export function marginalTaxRate(preTaxSalary: number): number {
  const s = Math.max(0, preTaxSalary);

  const medicareLower = 27_222;
  const medicareUpper = 34_027;
  const medicare =
    s <= medicareLower
      ? 0
      : s >= medicareUpper
        ? 0.02
        : (0.02 * (s - medicareLower)) / (medicareUpper - medicareLower);

  if (s <= 18_200) return 0;
  if (s <= 45_000) return 0.16 + medicare;
  if (s <= 135_000) return 0.3 + medicare;
  if (s <= 190_000) return 0.37 + medicare;
  return 0.45 + medicare;
}

export type DepreciationEstimate = {
  buildingDepreciation: number;
  plantDepreciation: number;
  totalDepreciation: number;
};

/** Rule-based estimate only — not tax advice. */
export function estimateDepreciation(params: {
  purchasePrice: number;
  yearBuilt: number;
  buildingValuePercent: number;
  fixturesEstimate: number;
}): DepreciationEstimate {
  const { purchasePrice, yearBuilt, buildingValuePercent, fixturesEstimate } = params;
  const buildingDepreciation =
    yearBuilt >= 1987
      ? purchasePrice * (buildingValuePercent / 100) * 0.025
      : 0;
  const plantDepreciation = fixturesEstimate * 0.1;
  return {
    buildingDepreciation,
    plantDepreciation,
    totalDepreciation: buildingDepreciation + plantDepreciation,
  };
}

function clamp0to100(x: number): number {
  return Math.min(100, Math.max(0, x));
}

/** Piecewise linear between (x0,y0) and (x1,y1); caller clamps domain. */
function lerpSegment(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) return y0;
  return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
}

/** Minimum model score for the green (upper) colour band. */
export const DEAL_SCORE_GREEN_MIN = 55;
/** Minimum model score for the amber (middle) colour band. */
export const DEAL_SCORE_AMBER_MIN = 35;

export function combineDealModelScore(
  strategy: InvestmentStrategyId,
  normYield: number,
  normAfterTaxCashflow: number,
  normGrowth: number,
  normRisk: number
): number {
  return combineStrategyWeightedScore(
    INVESTMENT_STRATEGIES[strategy].weights,
    normYield,
    normAfterTaxCashflow,
    normGrowth,
    normRisk
  );
}

/**
 * Gross rental yield → 0–100 (lower weight in the deal score; moderate yields still score fairly).
 * ≤2.5% → 0; 3.5% → 55; ≥5.5% → 100; linear between.
 */
export function normalizeYield(yieldPercent: number): number {
  const y = yieldPercent;
  if (y <= 2.5) return 0;
  if (y < 3.5) return clamp0to100(lerpSegment(y, 2.5, 0, 3.5, 55));
  if (y < 5.5) return clamp0to100(lerpSegment(y, 3.5, 55, 5.5, 100));
  return 100;
}

/** Annual after-tax cashflow (AUD) → 0–100; main holding-cost signal in the score. */
export function normalizeCashflow(annualAfterTaxCashflow: number): number {
  const c = annualAfterTaxCashflow;
  if (c <= -15_000) return 0;
  if (c < -5_000) return clamp0to100(lerpSegment(c, -15_000, 0, -5_000, 40));
  if (c < 0) return clamp0to100(lerpSegment(c, -5_000, 40, 0, 65));
  if (c < 10_000) return clamp0to100(lerpSegment(c, 0, 65, 10_000, 100));
  return 100;
}

/** Suburb / capital growth assumption (% p.a.) → 0–100. ≤2% → 0; 5% → 55; ≥8% → 100. */
export function normalizeGrowth(growthPercent: number): number {
  const g = growthPercent;
  if (g <= 2) return 0;
  if (g < 5) return clamp0to100(lerpSegment(g, 2, 0, 5, 55));
  if (g < 8) return clamp0to100(lerpSegment(g, 5, 55, 8, 100));
  return 100;
}

/** Deposit % (equity buffer) → 0–100 for risk. ≤10% → 0; 20% → 50; ≥40% → 100. */
export function normalizeDepositRisk(depositPercent: number): number {
  const d = Math.min(100, Math.max(0, depositPercent));
  if (d <= 10) return 0;
  if (d < 20) return clamp0to100(lerpSegment(d, 10, 0, 20, 50));
  if (d < 40) return clamp0to100(lerpSegment(d, 20, 50, 40, 100));
  return 100;
}

/** Vacancy % → 0–100 for risk (lower vacancy = higher score). ≥5% → 0; 2% → 60; ≤1% → 100. */
export function normalizeVacancy(vacancyPercent: number): number {
  const v = Math.max(0, vacancyPercent);
  if (v >= 5) return 0;
  if (v > 2) return clamp0to100(lerpSegment(v, 5, 0, 2, 60));
  if (v > 1) return clamp0to100(lerpSegment(v, 2, 60, 1, 100));
  return 100;
}

export function modelScoreFromAfterTaxCashflow(
  weeklyRent: number,
  purchasePrice: number,
  annualRatePct: number,
  depositPct: number,
  annualExpenses: number,
  growthPct: number,
  vacancyPct: number,
  marginalRate: number,
  totalDepreciation: number,
  pmFeePercent: number = 0,
  strategy: InvestmentStrategyId = DEFAULT_INVESTMENT_STRATEGY,
  loanTermYears: number = 30,
  isInterestOnly: boolean = false
): number {
  const rentAnnualGross = weeklyRent * 52;
  const vacancyFactor = 1 - Math.max(0, vacancyPct) / 100;
  const rentAnnualEffective = rentAnnualGross * vacancyFactor;
  const yieldPercent = (rentAnnualGross / purchasePrice) * 100;
  const d = Math.min(100, Math.max(0, depositPct));
  const loan = purchasePrice * (1 - d / 100);
  const { interestAnnual } = firstLoanYearFinance({
    loan,
    interestRatePercent: annualRatePct,
    loanTermYears,
    isInterestOnly,
  });
  const pmFeeAnnual = rentAnnualEffective * (pmFeePercent / 100);
  const effectiveExpenses = annualExpenses + pmFeeAnnual;
  const preTax = rentAnnualEffective - interestAnnual - effectiveExpenses;
  const taxableIncome = preTax - totalDepreciation;
  const taxEffect = taxableIncome * marginalRate;
  const afterTax = preTax - taxEffect;

  const ny = normalizeYield(yieldPercent);
  const nc = normalizeCashflow(afterTax);
  const ng = normalizeGrowth(growthPct);
  const nDeposit = normalizeDepositRisk(d);
  const nVacancy = normalizeVacancy(vacancyPct);
  const nr = (nDeposit + nVacancy) / 2;
  return combineDealModelScore(strategy, ny, nc, ng, nr);
}

export function minimumWeeklyForBuyScoreAfterTax(
  purchasePrice: number,
  annualRatePct: number,
  depositPct: number,
  annualExpenses: number,
  growthPct: number,
  vacancyPct: number,
  marginalRate: number,
  totalDepreciation: number,
  currentWeekly: number,
  pmFeePercent: number = 0,
  strategy: InvestmentStrategyId = DEFAULT_INVESTMENT_STRATEGY,
  loanTermYears: number = 30,
  isInterestOnly: boolean = false
): number | null {
  if (
    modelScoreFromAfterTaxCashflow(
      currentWeekly,
      purchasePrice,
      annualRatePct,
      depositPct,
      annualExpenses,
      growthPct,
      vacancyPct,
      marginalRate,
      totalDepreciation,
      pmFeePercent,
      strategy,
      loanTermYears,
      isInterestOnly
    ) >= DEAL_SCORE_GREEN_MIN
  ) {
    return currentWeekly;
  }
  let lo = 0;
  let hi = Math.max(currentWeekly, 50);
  while (
    modelScoreFromAfterTaxCashflow(
      hi,
      purchasePrice,
      annualRatePct,
      depositPct,
      annualExpenses,
      growthPct,
      vacancyPct,
      marginalRate,
      totalDepreciation,
      pmFeePercent,
      strategy,
      loanTermYears,
      isInterestOnly
    ) < DEAL_SCORE_GREEN_MIN &&
    hi < 500_000
  ) {
    hi = Math.ceil(hi * 1.5 + 1);
  }
  if (
    modelScoreFromAfterTaxCashflow(
      hi,
      purchasePrice,
      annualRatePct,
      depositPct,
      annualExpenses,
      growthPct,
      vacancyPct,
      marginalRate,
      totalDepreciation,
      pmFeePercent,
      strategy,
      loanTermYears,
      isInterestOnly
    ) < DEAL_SCORE_GREEN_MIN
  ) {
    return null;
  }
  for (let i = 0; i < 64; i++) {
    const mid = (lo + hi) / 2;
    if (
      modelScoreFromAfterTaxCashflow(
        mid,
        purchasePrice,
        annualRatePct,
        depositPct,
        annualExpenses,
        growthPct,
        vacancyPct,
        marginalRate,
        totalDepreciation,
        pmFeePercent,
        strategy,
        loanTermYears,
        isInterestOnly
      ) >= DEAL_SCORE_GREEN_MIN
    ) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

/** Weekly rent such that after-tax cashflow ≈ 0 (negative gearing aware). */
export function computeBreakEvenWeeklyAfterTax(
  annualInterest: number,
  annualExpenses: number,
  totalDepreciation: number,
  marginalRate: number
): number {
  const P = annualInterest + annualExpenses;
  const m = marginalRate;
  if (m <= 0 || m >= 0.999) return P / 52;
  const R = (-totalDepreciation * m) / (1 - m);
  if (R >= totalDepreciation - 1e-6) return P / 52;
  return (P + R) / 52;
}

export type PropertyAnalysisInputs = {
  purchasePrice: number;
  weeklyRent: number;
  rentalGrowthRatePercent: number;
  interestRatePercent: number;
  depositPercent: number;
  annualExpenses: number;
  preTaxSalary: number;
  yearBuilt: number;
  buildingValuePercent: number;
  fixturesEstimate: number;
  suburbGrowthPercent: number;
  vacancyPercent: number;
  suburb: string;
  state: string;
  isInterestOnly: boolean;
  loanTermYears: number;
  pmFeePercent: number;
  strategy: InvestmentStrategyId;

  /** Matches projection assumptions (default 2.5 when omitted). */
  expensesGrowthRatePercent?: number;

  /** Defaults so omitted fields preserve legacy grandfathered modelling. */
  purchaseDate?: Date | string;
  propertyType?: PropertyTypeInput;
  /** Positive net rental income from other properties (ring-fence absorption). */
  otherRentalIncome?: number;
  /** CPI / general inflation assumption (% p.a.) — CGT indexation + holding-cost growth. */
  cpiAssumptionPercent?: number;
  isPreCGTAsset?: boolean;
  marketValueAt1July2027?: number;
  /** Sale modelling — when both set, CGT summary is included on the result. */
  saleDate?: Date | string;
  salePrice?: number;
  holdingCostsCapitalised?: number;
};

export type ScoreStatus = "strong" | "borderline" | "weak";

export type DealDiagnostics = {
  breakEvenWeeklyPreTax: number;
  breakEvenWeeklyAfterTax: number;
  priceForZeroPreTaxCashflow: number | null;
  priceForZeroNote: string | null;
  targetWeeklyForBuy: number | null;
  targetYieldPercentForBuy: number | null;
  isStrong: boolean;
};

export type PropertyAnalysisResult = {
  // Yields
  yieldPercent: number;         // gross yield (backward compat)
  grossYieldPercent: number;    // same as yieldPercent, explicit label
  netYieldPercent: number;      // (effectiveRent - effectiveExpenses) / price

  // Loan & upfront
  loan: number;
  lvr: number;
  lmiAmount: number;
  /** LMI spread over 5 years × marginal rate (illustrative tax benefit). */
  lmiAnnualTaxDeduction: number;
  depositAmount: number;
  stampDuty: number;
  totalCashRequired: number;

  // Cashflow (year 1)
  /** First loan year: amortised interest (P&I) matches projection Year 0; IO uses opening balance × rate. */
  interestAnnual: number;
  pmFeeAnnual: number;
  effectiveAnnualExpenses: number;
  effectiveAnnualRent: number;
  preTaxCashflow: number;
  /** $0 for IO loans; actual principal for P&I */
  annualPrincipalRepayment: number;
  /** preTaxCashflow minus principal (real bank account impact) */
  actualCashPosition: number;
  cashOnCashReturn: number;

  // Tax & depreciation
  marginalRate: number;
  depreciation: DepreciationEstimate;
  taxablePropertyResult: number;
  /** Signed cashflow delta from tax: afterTaxCashflow - preTaxCashflow (positive = refund-style lift, negative = extra tax owed). */
  taxBenefit: number;
  afterTaxCashflow: number;

  // Score
  score: number;
  status: ScoreStatus;
  normYield: number;
  normCashflow: number;
  normGrowth: number;
  normDeposit: number;
  normVacancy: number;
  normRisk: number;

  // Inputs echoed for projections
  suburbGrowthPercent: number;
  vacancyPercent: number;
  suburb: string;
  state: string;
  purchasePrice: number;
  weeklyRent: number;
  annualExpenses: number;
  interestRatePercent: number;
  rentalGrowthRatePercent: number;
  preTaxSalary: number;
  yearBuilt: number;
  buildingValuePercent: number;
  fixturesEstimate: number;
  isInterestOnly: boolean;
  loanTermYears: number;
  pmFeePercent: number;
  strategy: InvestmentStrategyId;

  diagnostics: DealDiagnostics;

  /** Budget 2026 tax classification */
  taxScenarioId: TaxScenarioId;
  taxScenarioDescription: string;
  purchaseDate: Date;
  propertyType: PropertyTypeInput;
  otherRentalIncome: number;
  cpiAssumptionPercent: number;

  /** Capital gains — present when sale inputs provided */
  cgt?: CalculateCgtResult;
  carryForwardLossesAtSale?: number;
};

export function analyzeProperty(input: PropertyAnalysisInputs): PropertyAnalysisResult {
  const {
    purchasePrice: price,
    weeklyRent: weekly,
    rentalGrowthRatePercent: rentalGrowthRate,
    interestRatePercent: rate,
    depositPercent: deposit,
    annualExpenses: expenses,
    preTaxSalary: salary,
    yearBuilt,
    buildingValuePercent,
    fixturesEstimate,
    suburbGrowthPercent: growth,
    vacancyPercent: vacancy,
    suburb,
    state,
    isInterestOnly,
    loanTermYears,
    pmFeePercent,
    strategy,
    otherRentalIncome: otherRentalIncomeIn,
    cpiAssumptionPercent: cpiIn,
    isPreCGTAsset,
    marketValueAt1July2027,
    saleDate: saleDateIn,
    salePrice: salePriceIn,
    holdingCostsCapitalised: holdingCostsIn,
    expensesGrowthRatePercent: expensesGrowthIn,
  } = input;

  const purchaseDate = coercePurchaseDate(input.purchaseDate);
  const expensesGrowthRatePercent = expensesGrowthIn ?? 2.5;
  const propertyType: PropertyTypeInput = input.propertyType ?? "established";
  const otherRentalIncome = otherRentalIncomeIn ?? 0;
  const cpiAssumptionPercent = cpiIn ?? 3;
  const taxScenarioId = classifyTaxScenario({ purchaseDate, propertyType });

  // Yields
  const rentAnnualGross = weekly * 52;
  const vacancyFactor = 1 - Math.max(0, vacancy) / 100;
  const effectiveAnnualRent = rentAnnualGross * vacancyFactor;
  const grossYieldPercent = (rentAnnualGross / price) * 100;
  const yieldPercent = grossYieldPercent; // backward compat

  // Loan & upfront costs
  const d = Math.min(100, Math.max(0, deposit));
  const depositAmount = price * (d / 100);
  const loan = price * (1 - d / 100);
  const lvr = price > 0 ? (loan / price) * 100 : 0;
  const stampDuty = calculateStampDuty(price, state);
  const lmiAmount = calculateLMI(loan, price, state);
  const totalCashRequired = depositAmount + stampDuty + lmiAmount + PURCHASE_COSTS_ALLOWANCE_AUD;

  // Expenses
  const pmFeeAnnual = effectiveAnnualRent * (Math.max(0, pmFeePercent) / 100);
  const effectiveAnnualExpenses = expenses + pmFeeAnnual;

  // Cashflow — first-year interest/principal from the same amortisation as projections (not opening × rate for P&I).
  const { interestAnnual, principalAnnual: annualPrincipalRepayment } = firstLoanYearFinance({
    loan,
    interestRatePercent: rate,
    loanTermYears,
    isInterestOnly,
  });
  const preTaxCashflow = effectiveAnnualRent - interestAnnual - effectiveAnnualExpenses;
  const actualCashPosition = preTaxCashflow - annualPrincipalRepayment;

  // Net yield: (effective rent - operating expenses, before interest) / price
  const netYieldPercent = ((effectiveAnnualRent - effectiveAnnualExpenses) / price) * 100;

  // Tax & depreciation
  const m = marginalTaxRate(salary);
  // LMI is a borrowing expense — deductible over 5 years for investment properties.
  // Annual deduction = LMI / 5 years. Tax benefit = deduction × marginal rate.
  const lmiAnnualTaxDeduction = lmiAmount > 0 ? (lmiAmount / 5) * m : 0;
  const depreciation = estimateDepreciation({ purchasePrice: price, yearBuilt, buildingValuePercent, fixturesEstimate });
  const totalDep = depreciation.totalDepreciation;
  const taxablePropertyResult = preTaxCashflow - totalDep;

  const fyFirst = fyEndingJuneYearForProjectionRow(purchaseDate, 0);
  const year1Impact = calculateAnnualTaxImpact({
    propertyTaxableIncome: taxablePropertyResult,
    scenario: taxScenarioId,
    fyEndingJuneYear: fyFirst,
    marginalRate: m,
    carryForwardBalance: 0,
    otherRentalIncome,
  });
  const taxEffect = year1Impact.taxableRentalIncome * m;
  const afterTaxCashflow = preTaxCashflow - taxEffect;
  const taxBenefit = afterTaxCashflow - preTaxCashflow;

  let cgt: CalculateCgtResult | undefined;
  let carryForwardLossesAtSale: number | undefined;

  if (saleDateIn !== undefined && salePriceIn !== undefined && Number.isFinite(salePriceIn)) {
    const saleDate = coercePurchaseDate(saleDateIn);
    const salePrice = salePriceIn;
    const holdingCostsCapitalised = holdingCostsIn ?? 0;
    const holdYears = holdYearsFromDates(purchaseDate, saleDate);
    const scheduleYears = Math.max(0, holdYears - 1);
    const schedule = buildAmortisationScheduleYearly(
      loan,
      rate,
      scheduleYears,
      isInterestOnly,
      loanTermYears
    );
    const { ledger } = buildCashflowProjectionSeriesBudget2026({
      weeklyRent: weekly,
      rentalGrowthRatePercent: rentalGrowthRate,
      annualExpenses: expenses,
      expensesGrowthRatePercent,
      amortisation: schedule,
      buildingDepreciation: depreciation.buildingDepreciation,
      fixturesEstimate,
      marginalTaxRate: m,
      vacancyPercent: vacancy,
      pmFeePercent,
      purchaseDate,
      propertyType,
      otherRentalIncome,
    });
    carryForwardLossesAtSale = ledger[ledger.length - 1]?.carryForwardBalanceEnd ?? 0;

    cgt = calculateCGT({
      purchaseDate,
      purchasePrice: price,
      saleDate,
      salePrice,
      scenario: taxScenarioId,
      propertyType,
      holdingCostsCapitalised,
      marginalRate: m,
      carryForwardLossesAtSale,
      cpiAnnualPercent: cpiAssumptionPercent,
      isPreCGTAsset,
      marketValueAt1July2027,
    });
  }

  // Cash-on-cash return
  const cashOnCashReturn = totalCashRequired > 0 ? (afterTaxCashflow / totalCashRequired) * 100 : 0;

  // Score
  const ny = normalizeYield(yieldPercent);
  const nc = normalizeCashflow(afterTaxCashflow);
  const ng = normalizeGrowth(growth);
  const nDeposit = normalizeDepositRisk(d);
  const nVacancy = normalizeVacancy(vacancy);
  const nr = (nDeposit + nVacancy) / 2;
  const score = combineDealModelScore(strategy, ny, nc, ng, nr);

  let status: ScoreStatus;
  if (score >= DEAL_SCORE_GREEN_MIN) status = "strong";
  else if (score >= DEAL_SCORE_AMBER_MIN) status = "borderline";
  else status = "weak";

  // Diagnostics
  const breakEvenWeeklyPreTax = (interestAnnual + effectiveAnnualExpenses) / 52;
  const breakEvenWeeklyAfterTax = computeBreakEvenWeeklyAfterTax(
    interestAnnual, effectiveAnnualExpenses, totalDep, m
  );

  const leverage = 1 - d / 100;
  const r = rate / 100;
  let priceForZeroPreTaxCashflow: number | null = null;
  let priceForZeroNote: string | null = null;

  if (leverage * r < 1e-9) {
    priceForZeroNote =
      "With no interest on debt at these settings, purchase price does not move pre-tax cashflow—adjust rent or operating costs instead.";
  } else if (effectiveAnnualRent - effectiveAnnualExpenses <= 0) {
    priceForZeroNote =
      "Gross rent does not cover operating expenses before interest—raise rent (or cut costs) before a lower price can deliver positive pre-tax cashflow.";
  } else {
    priceForZeroPreTaxCashflow = (effectiveAnnualRent - effectiveAnnualExpenses) / (leverage * r);
  }

  const isStrong = score >= DEAL_SCORE_GREEN_MIN;
  let targetWeeklyForBuy: number | null = null;
  let targetYieldPercentForBuy: number | null = null;

  if (isStrong) {
    targetWeeklyForBuy = weekly;
    targetYieldPercentForBuy = yieldPercent;
  } else {
    const w = minimumWeeklyForBuyScoreAfterTax(
      price,
      rate,
      d,
      expenses,
      growth,
      vacancy,
      m,
      totalDep,
      weekly,
      pmFeePercent,
      strategy,
      loanTermYears,
      isInterestOnly
    );
    if (w !== null) {
      targetWeeklyForBuy = w;
      targetYieldPercentForBuy = ((w * 52) / price) * 100;
    }
  }

  return {
    yieldPercent,
    grossYieldPercent,
    netYieldPercent,
    loan,
    lvr,
    lmiAmount,
    lmiAnnualTaxDeduction,
    depositAmount,
    stampDuty,
    totalCashRequired,
    interestAnnual,
    pmFeeAnnual,
    effectiveAnnualExpenses,
    effectiveAnnualRent,
    preTaxCashflow,
    annualPrincipalRepayment,
    actualCashPosition,
    cashOnCashReturn,
    marginalRate: m,
    depreciation,
    taxablePropertyResult,
    taxBenefit,
    afterTaxCashflow,
    score,
    status,
    normYield: ny,
    normCashflow: nc,
    normGrowth: ng,
    normDeposit: nDeposit,
    normVacancy: nVacancy,
    normRisk: nr,
    suburbGrowthPercent: growth,
    vacancyPercent: vacancy,
    suburb,
    state: state.trim().toUpperCase(),
    purchasePrice: price,
    weeklyRent: weekly,
    annualExpenses: expenses,
    interestRatePercent: rate,
    rentalGrowthRatePercent: rentalGrowthRate,
    preTaxSalary: salary,
    yearBuilt,
    buildingValuePercent,
    fixturesEstimate,
    isInterestOnly,
    loanTermYears,
    pmFeePercent,
    strategy,
    diagnostics: {
      breakEvenWeeklyPreTax,
      breakEvenWeeklyAfterTax,
      priceForZeroPreTaxCashflow,
      priceForZeroNote,
      targetWeeklyForBuy,
      targetYieldPercentForBuy,
      isStrong,
    },

    taxScenarioId,
    taxScenarioDescription: taxScenarioLabel(taxScenarioId),
    purchaseDate,
    propertyType,
    otherRentalIncome,
    cpiAssumptionPercent,
    cgt,
    carryForwardLossesAtSale,
  };
}