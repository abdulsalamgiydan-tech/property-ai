export type PortfolioMetricsInput = {
  current_value: number | null;
  loan_balance: number | null;
  weekly_rent: number | null;
  annual_expenses: number | null;
  ownership_percentage: number | null;
};

export type PortfolioPropertyMetrics = {
  ownershipShare: number;
  value: number;
  debt: number;
  equity: number;
  annualRent: number;
  annualExpenses: number;
  annualCashflow: number;
};

export type PortfolioTotals = Omit<PortfolioPropertyMetrics, "ownershipShare"> & {
  lvrPercent: number;
};

function finiteOrZero(value: number | null): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function portfolioOwnershipShare(
  property: Pick<PortfolioMetricsInput, "ownership_percentage">
): number {
  const percentage = property.ownership_percentage ?? 100;
  if (!Number.isFinite(percentage)) return 1;
  return Math.min(100, Math.max(0, percentage)) / 100;
}

/** Returns the user's economic share of one portfolio property. */
export function calculatePortfolioPropertyMetrics(
  property: PortfolioMetricsInput
): PortfolioPropertyMetrics {
  const ownershipShare = portfolioOwnershipShare(property);
  const value = finiteOrZero(property.current_value) * ownershipShare;
  const debt = finiteOrZero(property.loan_balance) * ownershipShare;
  const annualRent = finiteOrZero(property.weekly_rent) * 52 * ownershipShare;
  const annualExpenses = finiteOrZero(property.annual_expenses) * ownershipShare;

  return {
    ownershipShare,
    value,
    debt,
    equity: value - debt,
    annualRent,
    annualExpenses,
    annualCashflow: annualRent - annualExpenses,
  };
}

/** Aggregates owned value, debt, equity, rent, expenses, and cashflow. */
export function calculatePortfolioTotals(
  properties: readonly PortfolioMetricsInput[]
): PortfolioTotals {
  const totals = properties.reduce(
    (sum, property) => {
      const metrics = calculatePortfolioPropertyMetrics(property);
      sum.value += metrics.value;
      sum.debt += metrics.debt;
      sum.equity += metrics.equity;
      sum.annualRent += metrics.annualRent;
      sum.annualExpenses += metrics.annualExpenses;
      sum.annualCashflow += metrics.annualCashflow;
      return sum;
    },
    {
      value: 0,
      debt: 0,
      equity: 0,
      annualRent: 0,
      annualExpenses: 0,
      annualCashflow: 0,
    }
  );

  return {
    ...totals,
    lvrPercent: totals.value > 0 ? (totals.debt / totals.value) * 100 : 0,
  };
}
