import { formatAud } from "@/lib/formatCurrency";

export type SnapshotPeriod = "annual" | "weekly" | "monthly";

/** Convert stored annual AUD amounts to the selected display period (logic stays annual). */
export function annualToDisplayAmount(
  annual: number,
  period: SnapshotPeriod
): number {
  if (period === "weekly") return annual / 52;
  if (period === "monthly") return annual / 12;
  return annual;
}

/** Human-readable period for toggle labels. */
export function snapshotPeriodToggleLabel(period: SnapshotPeriod): string {
  switch (period) {
    case "weekly":
      return "Weekly";
    case "monthly":
      return "Monthly";
    default:
      return "Annual";
  }
}

/** Short subcopy under values, e.g. “per week”. */
export function snapshotPerPeriodPhrase(period: SnapshotPeriod): string {
  switch (period) {
    case "weekly":
      return "per week";
    case "monthly":
      return "per month";
    default:
      return "per year";
  }
}

/**
 * Format money for key snapshot cards: commas, AUD, sensible rounding.
 * Smaller weekly/monthly amounts may show up to two decimal places.
 */
export function formatKeySnapshotAud(annual: number, period: SnapshotPeriod): string {
  const v = annualToDisplayAmount(annual, period);
  const abs = Math.abs(v);
  if (period === "annual" || abs >= 500) {
    return formatAud(v, 0);
  }
  return formatAud(v, 2, 0);
}
