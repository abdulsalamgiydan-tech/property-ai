/**
 * Deterministic price-growth calculations for the Warehouse Coverage Maximiser.
 *
 * These operate on PROPERLY-COMPUTED rolling-window median points (each a true
 * trailing-window median produced from raw sales during the mart build), NOT on
 * a median-of-monthly-medians — computing a median from pre-aggregated monthly
 * medians is not statistically valid, so this engine never does that. It only
 * computes DERIVED growth between two compatible window medians.
 *
 * Hard rules (never relaxed to inflate coverage):
 *  - both endpoints must share geography level AND property type;
 *  - both must meet the minimum sample size;
 *  - the two window ends must be ~N years apart within a documented tolerance;
 *  - cumulative change and annualised CAGR are reported as DISTINCT numbers;
 *  - no interpolation/estimation of a missing baseline — if there is no
 *    compatible prior point, the result is unavailable with a reason.
 */

export type RollingMedianPoint = {
  /** End date (ISO) of the trailing window this median summarises. */
  periodEnd: string;
  /** True trailing-window median sale price (from raw sales), not a median-of-medians. */
  medianPrice: number | null;
  sampleSize: number | null;
  propertyType: string; // "house" | "unit" | "land" | ...
  geographyLevel: "suburb" | "postcode" | "sa2" | "lga";
};

export type GrowthResult = {
  available: boolean;
  reason: string | null;
  /** Cumulative percentage change over the window, e.g. +18.5. */
  cumulativeChangePct: number | null;
  /** Annualised compound growth rate (CAGR) over the window, e.g. +5.8. */
  cagrPct: number | null;
  years: number | null;
  currentPeriodEnd: string | null;
  priorPeriodEnd: string | null;
  currentSample: number | null;
  priorSample: number | null;
};

export type GrowthOptions = {
  years: number; // target lookback (1, 3, 5, 10)
  minSample: number; // per-endpoint minimum sample
  /** Allowed |actual − target| gap in years for the prior point (default 0.5). */
  toleranceYears?: number;
};

const UNAVAILABLE = (reason: string, years: number): GrowthResult => ({
  available: false,
  reason,
  cumulativeChangePct: null,
  cagrPct: null,
  years,
  currentPeriodEnd: null,
  priorPeriodEnd: null,
  currentSample: null,
  priorSample: null,
});

function yearsBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / (365.25 * 24 * 3600 * 1000);
}

/**
 * Computes cumulative change and CAGR for one property type over `years`, from a
 * series of rolling-window median points for the SAME geography. Picks the most
 * recent valid current point and the compatible point closest to `years` prior.
 */
export function computeGrowth(points: RollingMedianPoint[], opts: GrowthOptions): GrowthResult {
  const { years, minSample } = opts;
  const tol = opts.toleranceYears ?? 0.5;

  const usable = points
    .filter((p) => p.medianPrice != null && p.medianPrice > 0 && (p.sampleSize ?? 0) >= minSample)
    .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime());

  if (usable.length === 0) return UNAVAILABLE("no points meet the minimum sample rule", years);

  // Guard: mixing property types or geography levels is never allowed.
  const propertyTypes = new Set(usable.map((p) => p.propertyType));
  const geoLevels = new Set(usable.map((p) => p.geographyLevel));
  if (propertyTypes.size > 1) return UNAVAILABLE("mixed property types in the series", years);
  if (geoLevels.size > 1) return UNAVAILABLE("mixed geography levels in the series", years);

  const current = usable[0];
  // Closest prior point to exactly `years` before current, within tolerance.
  let best: RollingMedianPoint | null = null;
  let bestGap = Infinity;
  for (const p of usable.slice(1)) {
    const dy = yearsBetween(current.periodEnd, p.periodEnd);
    const gap = Math.abs(dy - years);
    if (gap <= tol && gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  if (!best) return UNAVAILABLE(`no comparable point ~${years}y prior within ±${tol}y`, years);

  const actualYears = yearsBetween(current.periodEnd, best.periodEnd);
  const ratio = current.medianPrice! / best.medianPrice!;
  const cumulativeChangePct = Number(((ratio - 1) * 100).toFixed(2));
  const cagrPct = Number(((Math.pow(ratio, 1 / actualYears) - 1) * 100).toFixed(2));

  return {
    available: true,
    reason: null,
    cumulativeChangePct,
    cagrPct,
    years,
    currentPeriodEnd: current.periodEnd,
    priorPeriodEnd: best.periodEnd,
    currentSample: current.sampleSize,
    priorSample: best.sampleSize,
  };
}
