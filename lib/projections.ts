import { formatAud, formatNumberGb } from "@/lib/formatCurrency";
import {
  calculateAnnualTaxImpact,
  isNegativeGearingRingFenced,
} from "@/lib/tax/budget2026AnnualTaxImpact";
import {
  formatFinancialYearLabel,
  fyEndingJuneYearForProjectionRow,
} from "@/lib/tax/budget2026FinancialYear";
import type { TaxScenarioId } from "@/lib/tax/budget2026Scenario";
import { classifyTaxScenario, type PropertyTypeInput } from "@/lib/tax/budget2026Scenario";

export type YearlyAmortisationPoint = {
  year: number;
  openingBalance: number;
  closingBalance: number;
  annualInterest: number;
  annualPrincipal: number;
};

export function monthlyPiRepayment(
  loan: number,
  interestRatePercent: number,
  totalMonths: number
): number {
  if (loan <= 0) return 0;
  const r = interestRatePercent / 100 / 12;
  if (r <= 0) return loan / totalMonths;
  const numerator = loan * (r * Math.pow(1 + r, totalMonths));
  const denominator = Math.pow(1 + r, totalMonths) - 1;
  return numerator / denominator;
}

export function buildAmortisationScheduleYearly(
  loan: number,
  interestRatePercent: number,
  years: number = 30,
  isInterestOnly: boolean = false,
  loanTermYears: number = 30
): YearlyAmortisationPoint[] {
  const totalMonths = loanTermYears * 12;
  const monthlyRate = interestRatePercent / 100 / 12;
  const payment = isInterestOnly
    ? 0
    : monthlyPiRepayment(loan, interestRatePercent, totalMonths);

  const points: YearlyAmortisationPoint[] = [];
  let balance = Math.max(0, loan);

  for (let y = 0; y <= years; y++) {
    const opening = balance;
    let annualInterest = 0;
    let annualPrincipal = 0;

    if (y > 0) {
      if (isInterestOnly) {
        // IO: interest accrues, no principal repaid, balance stays flat
        annualInterest = balance * monthlyRate * 12;
        annualPrincipal = 0;
      } else {
        for (let m = 0; m < 12; m++) {
          if (balance <= 0) break;
          const interest = monthlyRate > 0 ? balance * monthlyRate : 0;
          const principal = Math.min(balance, payment - interest);
          annualInterest += interest;
          annualPrincipal += Math.max(0, principal);
          balance = Math.max(0, balance - principal);
        }
      }
    }

    points.push({
      year: y,
      openingBalance: opening,
      closingBalance: isInterestOnly ? opening : balance,
      annualInterest,
      annualPrincipal,
    });
  }

  return points;
}

/**
 * Interest and principal paid in the first 12 months of the loan — same basis as
 * {@link buildCashflowProjectionSeries} at projection year 0 (uses schedule year 1).
 */
export function firstLoanYearFinance(params: {
  loan: number;
  interestRatePercent: number;
  loanTermYears: number;
  isInterestOnly: boolean;
}): { interestAnnual: number; principalAnnual: number } {
  const { loan, interestRatePercent, loanTermYears, isInterestOnly } = params;
  if (loan <= 0) {
    return { interestAnnual: 0, principalAnnual: 0 };
  }
  const schedule = buildAmortisationScheduleYearly(
    loan,
    interestRatePercent,
    1,
    isInterestOnly,
    loanTermYears
  );
  const y1 = schedule[1];
  return {
    interestAnnual: y1?.annualInterest ?? 0,
    principalAnnual: y1?.annualPrincipal ?? 0,
  };
}

export type PropertyValueMortgagePoint = {
  year: number;
  propertyValue: number;
  mortgageBalance: number;
  equity: number;
  usableEquity80: number;
};

export type CashflowProjectionPoint = {
  year: number;
  annualRent: number;
  preTaxCashflow: number;
  afterTaxCashflow: number;
};

export type RentalLossTaxTreatmentKind =
  | "deductible_salary"
  | "ring_fenced"
  | "na_positive";

export type Budget2026LedgerRow = {
  year: number;
  financialYear: string;
  fyEndingJuneYear: number;
  netRentalPosition: number;
  treatment: RentalLossTaxTreatmentKind;
  treatmentLabel: string;
  taxRefundFromNG: number;
  lossAddedToCarryForward: number;
  carryForwardBalanceEnd: number;
};

export type CashflowProjectionPointBudget2026 = CashflowProjectionPoint & {
  financialYearLabel: string;
  fyEndingJuneYear: number;
  rentalLossTaxTreatment: RentalLossTaxTreatmentKind;
  rentalLossTaxTreatmentLabel: string;
  carryForwardBalanceEnd: number;
  propertyTaxableIncome: number;
  taxEffect: number;
};

function rentalLossTreatmentLabel(kind: RentalLossTaxTreatmentKind): string {
  switch (kind) {
    case "deductible_salary":
      return "Deductible against salary";
    case "ring_fenced":
      return "Ring-fenced — carried forward";
    case "na_positive":
      return "N/A (positive rental income)";
    default:
      return kind;
  }
}

function classifyRentalLossTreatment(
  scenario: TaxScenarioId,
  fyEndingJuneYear: number,
  propertyTaxableIncome: number
): RentalLossTaxTreatmentKind {
  if (propertyTaxableIncome > 0) return "na_positive";
  if (isNegativeGearingRingFenced(scenario, fyEndingJuneYear)) {
    return "ring_fenced";
  }
  return "deductible_salary";
}

export function buildPropertyValueVsMortgageSeries(params: {
  purchasePrice: number;
  suburbGrowthRatePercent: number;
  amortisation: YearlyAmortisationPoint[];
}): PropertyValueMortgagePoint[] {
  const { purchasePrice, suburbGrowthRatePercent, amortisation } = params;
  const g = suburbGrowthRatePercent / 100;
  return amortisation.map((p) => {
    const propertyValue = purchasePrice * Math.pow(1 + g, p.year);
    const mortgageBalance = p.closingBalance;
    const equity = propertyValue - mortgageBalance;
    const usableEquity80 = Math.max(0, propertyValue * 0.8 - mortgageBalance);
    return { year: p.year, propertyValue, mortgageBalance, equity, usableEquity80 };
  });
}

export function buildCashflowProjectionSeries(params: {
  weeklyRent: number;
  rentalGrowthRatePercent: number;
  annualExpenses: number;
  expensesGrowthRatePercent: number;
  amortisation: YearlyAmortisationPoint[];
  buildingDepreciation: number;
  fixturesEstimate: number;
  marginalTaxRate: number;
  vacancyPercent: number;
  pmFeePercent: number;
}): CashflowProjectionPoint[] {
  const {
    weeklyRent,
    rentalGrowthRatePercent,
    annualExpenses,
    expensesGrowthRatePercent,
    amortisation,
    buildingDepreciation,
    fixturesEstimate,
    marginalTaxRate,
    vacancyPercent,
    pmFeePercent,
  } = params;
  const rg = rentalGrowthRatePercent / 100;
  const eg = expensesGrowthRatePercent / 100;
  const vacancyFactor = 1 - Math.max(0, vacancyPercent) / 100;
  const lastIdx = amortisation.length - 1;

  return amortisation.map((p) => {
    const grossAnnualRent = weeklyRent * 52 * Math.pow(1 + rg, p.year);
    const annualRent = grossAnnualRent * vacancyFactor;
    const pmFeeYear = annualRent * (pmFeePercent / 100);
    const annualExpensesYear = annualExpenses * Math.pow(1 + eg, p.year) + pmFeeYear;

    const next = p.year + 1;
    const annualInterest =
      next <= lastIdx ? amortisation[next].annualInterest : 0;

    const preTaxCashflow = annualRent - annualInterest - annualExpensesYear;

    const plantDepreciation = Math.max(
      fixturesEstimate * 0.1 * Math.pow(0.85, p.year),
      0
    );
    const yearDepreciation = buildingDepreciation + plantDepreciation;
    const taxableIncome = preTaxCashflow - yearDepreciation;
    const taxEffect = taxableIncome * marginalTaxRate;
    const afterTaxCashflow = preTaxCashflow - taxEffect;

    return { year: p.year, annualRent, preTaxCashflow, afterTaxCashflow };
  });
}

/** Budget 2026 — ring-fencing, carry-forward ledger, FY-aware salary NG (personal-name ownership). */
export function buildCashflowProjectionSeriesBudget2026(params: {
  weeklyRent: number;
  rentalGrowthRatePercent: number;
  annualExpenses: number;
  expensesGrowthRatePercent: number;
  amortisation: YearlyAmortisationPoint[];
  buildingDepreciation: number;
  fixturesEstimate: number;
  marginalTaxRate: number;
  vacancyPercent: number;
  pmFeePercent: number;
  purchaseDate: Date;
  propertyType: PropertyTypeInput;
  /** When set, skips {@link classifyTaxScenario} (scenario comparison). */
  scenarioOverride?: TaxScenarioId;
  otherRentalIncome?: number;
}): { cashflow: CashflowProjectionPointBudget2026[]; ledger: Budget2026LedgerRow[] } {
  const {
    weeklyRent,
    rentalGrowthRatePercent,
    annualExpenses,
    expensesGrowthRatePercent,
    amortisation,
    buildingDepreciation,
    fixturesEstimate,
    marginalTaxRate,
    vacancyPercent,
    pmFeePercent,
    purchaseDate,
    propertyType,
    scenarioOverride,
    otherRentalIncome = 0,
  } = params;

  const scenario =
    scenarioOverride ??
    classifyTaxScenario({ purchaseDate, propertyType });

  const rg = rentalGrowthRatePercent / 100;
  const eg = expensesGrowthRatePercent / 100;
  const vacancyFactor = 1 - Math.max(0, vacancyPercent) / 100;
  const lastIdx = amortisation.length - 1;

  let carryForward = 0;
  const cashflow: CashflowProjectionPointBudget2026[] = [];
  const ledger: Budget2026LedgerRow[] = [];

  for (const p of amortisation) {
    const grossAnnualRent = weeklyRent * 52 * Math.pow(1 + rg, p.year);
    const annualRent = grossAnnualRent * vacancyFactor;
    const pmFeeYear = annualRent * (pmFeePercent / 100);
    const annualExpensesYear = annualExpenses * Math.pow(1 + eg, p.year) + pmFeeYear;

    const next = p.year + 1;
    const annualInterest =
      next <= lastIdx ? amortisation[next].annualInterest : 0;

    const preTaxCashflow = annualRent - annualInterest - annualExpensesYear;

    const plantDepreciation = Math.max(
      fixturesEstimate * 0.1 * Math.pow(0.85, p.year),
      0
    );
    const yearDepreciation = buildingDepreciation + plantDepreciation;
    const propertyTaxableIncome = preTaxCashflow - yearDepreciation;

    const fyEndingJuneYear = fyEndingJuneYearForProjectionRow(
      purchaseDate,
      p.year
    );
    const financialYearLabel = formatFinancialYearLabel(fyEndingJuneYear);

    const impact = calculateAnnualTaxImpact({
      propertyTaxableIncome,
      scenario,
      fyEndingJuneYear,
      marginalRate: marginalTaxRate,
      carryForwardBalance: carryForward,
      otherRentalIncome,
    });

    carryForward = impact.carryForwardBalanceEnd;

    const taxEffect = impact.taxableRentalIncome * marginalTaxRate;
    const afterTaxCashflow = preTaxCashflow - taxEffect;

    const treatment = classifyRentalLossTreatment(
      scenario,
      fyEndingJuneYear,
      propertyTaxableIncome
    );

    cashflow.push({
      year: p.year,
      annualRent,
      preTaxCashflow,
      afterTaxCashflow,
      financialYearLabel,
      fyEndingJuneYear,
      rentalLossTaxTreatment: treatment,
      rentalLossTaxTreatmentLabel: rentalLossTreatmentLabel(treatment),
      carryForwardBalanceEnd: carryForward,
      propertyTaxableIncome,
      taxEffect,
    });

    ledger.push({
      year: p.year + 1,
      financialYear: financialYearLabel,
      fyEndingJuneYear,
      netRentalPosition: propertyTaxableIncome,
      treatment,
      treatmentLabel: rentalLossTreatmentLabel(treatment),
      taxRefundFromNG: impact.taxRefundFromNG,
      lossAddedToCarryForward: impact.lossAddedToCarryForward,
      carryForwardBalanceEnd: carryForward,
    });
  }

  return { cashflow, ledger };
}

export function formatChartAud(value: number): string {
  return formatAud(value);
}

export function formatChartYear(year: number): string {
  return `Year ${formatNumberGb(year)}`;
}
