/**
 * Map purchase date + projection row index → Australian income year (FY ending 30 June).
 * First row aligns with the financial year that begins on the first 1 July on or after purchase.
 */
export function fyEndingJuneYearForProjectionRow(
  purchaseDate: Date,
  projectionYearIndex: number
): number {
  const y = purchaseDate.getFullYear();
  const july1SameYear = new Date(y, 6, 1);
  const fyStart =
    purchaseDate.getTime() > july1SameYear.getTime()
      ? new Date(y + 1, 6, 1)
      : july1SameYear;
  const firstFyEndingJuneYear = fyStart.getFullYear() + 1;
  return firstFyEndingJuneYear + projectionYearIndex;
}

/** e.g. fyEndingJuneYear 2027 → "2026-27" */
export function formatFinancialYearLabel(fyEndingJuneYear: number): string {
  const startYear = fyEndingJuneYear - 1;
  const e = String(fyEndingJuneYear).slice(-2);
  return `${startYear}-${e}`;
}
