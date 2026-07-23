const gbNumber = new Intl.NumberFormat("en-GB");

/** AUD label, British separators. */
export function formatAud(
  n: number,
  maxFractionDigits: number = 0,
  minFractionDigits: number = 0
): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(n);
}

/** Plain number with UK grouping: 1350000 -> 1,350,000 */
export function formatNumberGb(n: number): string {
  return gbNumber.format(n);
}

/** Input helper: strips non-number chars and applies GB grouping. */
export function formatInputNumber(value: string): string {
  const stripped = value.replace(/[^\d.-]/g, "");
  if (!stripped || stripped === "-" || stripped === "." || stripped === "-.") {
    return stripped;
  }
  const n = Number(stripped);
  if (!Number.isFinite(n)) return value;
  const [intPart, decimalPart] = stripped.split(".");
  const normalisedIntPart =
    intPart === "-" ? "-0" : intPart === "" ? "0" : intPart;
  const grouped = formatNumberGb(Number(normalisedIntPart));
  return decimalPart !== undefined ? `${grouped}.${decimalPart}` : grouped;
}

export function formatPercent(value: number, fractionDigits: number = 2): string {
  return `${value.toFixed(fractionDigits)}%`;
}
