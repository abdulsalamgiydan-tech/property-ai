import { formatAud, formatPercent } from "@/lib/formatCurrency";

/**
 * Shared "unavailable, never zero" formatters for warehouse-sourced
 * metrics. `null`/`undefined` mean the source has no value; `0` is a real
 * value and must render as `0`, not collapse into "Unavailable" — the two
 * are semantically different and conflating them would silently imply a
 * measured zero where none exists.
 */
export function formatMoneyOrUnavailable(v: number | null | undefined, maxFractionDigits = 0): string {
  return v === null || v === undefined ? "Unavailable" : formatAud(v, maxFractionDigits);
}

export function formatPercentOrUnavailable(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "Unavailable" : formatPercent(v, digits);
}

export function formatCountOrUnavailable(v: number | null | undefined): string {
  return v === null || v === undefined ? "Unavailable" : v.toLocaleString("en-AU");
}

export function formatPeriodOrUnavailable(v: string | number | null | undefined): string {
  return v === null || v === undefined ? "n/a" : String(v);
}
