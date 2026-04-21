import { formatAud, formatNumberGb } from "@/lib/formatCurrency";

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
    const taxable = preTaxCashflow - yearDepreciation;
    const taxBenefit = taxable < 0 ? Math.abs(taxable) * marginalTaxRate : 0;
    const afterTaxCashflow = preTaxCashflow + taxBenefit;

    return { year: p.year, annualRent, preTaxCashflow, afterTaxCashflow };
  });
}

export function formatChartAud(value: number): string {
  return formatAud(value);
}

export function formatChartYear(year: number): string {
  return `Year ${formatNumberGb(year)}`;
}
