/**
 * CPI index series: base 100 at `anchorDate`, compounded at `annualRatePercent` p.a.
 * Used for CGT indexation modelling (simplified vs ATO quarterly CPI).
 */
export function cpiIndexAt(
  anchorDate: Date,
  annualRatePercent: number,
  atDate: Date
): number {
  const r = annualRatePercent / 100;
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  const years = (atDate.getTime() - anchorDate.getTime()) / msPerYear;
  return 100 * Math.pow(1 + r, Math.max(0, years));
}
