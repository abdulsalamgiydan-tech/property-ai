/**
 * Gross-yield recovery from compatible, already-loaded suburb observations.
 *
 * The Coverage Maximiser dry-run measured 126 suburbs that hold BOTH a suburb
 * median sale price and a suburb median rent but have a null gross yield — a
 * defensible, immediately-recoverable derived metric. This computes it under the
 * same compatibility rules the fallback resolver enforces and records both input
 * observations (and their exact periods) so the result is fully traceable.
 *
 * Never computes yield from mixed geography (e.g. suburb price + postcode rent),
 * mixed property types, or incompatible periods.
 */

export type YieldInput = {
  value: number | null;
  period: string | null;
  geographyLevel: "suburb" | "postcode" | "sa2" | "lga";
  propertyType: string; // "house" | "unit" | "all"
  sourceField: string;
};

export type YieldRecoveryResult = {
  available: boolean;
  reason: string | null;
  grossYieldPct: number | null;
  priceInput: YieldInput | null;
  rentInput: YieldInput | null;
};

export type YieldOptions = {
  /** Max |priceDate − rentDate| in days for the two observations to be comparable. */
  maxPeriodGapDays?: number;
};

function gapDays(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (24 * 3600 * 1000);
}

export function recoverGrossYield(price: YieldInput, rent: YieldInput, opts: YieldOptions = {}): YieldRecoveryResult {
  const maxGap = opts.maxPeriodGapDays ?? 400; // ~13 months: annual rent vs 12m sales window
  const base: YieldRecoveryResult = { available: false, reason: null, grossYieldPct: null, priceInput: price, rentInput: rent };

  if (price.value == null || rent.value == null || price.value <= 0) {
    return { ...base, reason: "requires a positive price and a rent value" };
  }
  if (price.geographyLevel !== rent.geographyLevel) {
    return { ...base, reason: `incompatible geography: price ${price.geographyLevel} vs rent ${rent.geographyLevel}` };
  }
  if ((price.propertyType ?? "all") !== (rent.propertyType ?? "all")) {
    return { ...base, reason: `incompatible property types: price ${price.propertyType} vs rent ${rent.propertyType}` };
  }
  if (price.period && rent.period && gapDays(price.period, rent.period) > maxGap) {
    return { ...base, reason: `incompatible periods: price ${price.period} vs rent ${rent.period} exceed ${maxGap}d` };
  }
  const grossYieldPct = Number((((rent.value * 52) / price.value) * 100).toFixed(2));
  return { available: true, reason: null, grossYieldPct, priceInput: price, rentInput: rent };
}
