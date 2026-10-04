/**
 * Deterministic change detection + provenance-mapped explanations for the V7A
 * watchlist ("what changed on a shortlisted suburb"). Pure functions — no I/O.
 *
 * Design rules (roadmap "V7 slice"):
 *   - Never fabricate. A change is only reported when an accepted OFFICIAL metric
 *     advances to a newer period_end. A metric that goes missing or stale yields a
 *     `confidence` event (newValue = null), never an invented replacement figure.
 *   - Every reported figure carries its provenance (source_id · period + attribution).
 *   - Deterministic: same inputs → same ordered output. Metrics are emitted in the
 *     fixed MANDATORY_METRICS order so alerts never reshuffle between refreshes.
 *
 * This is the reference detector that mirrors the SQL detector in migration 062
 * (value-advance events) and additionally covers the missing/stale confidence
 * case, so the explainer and the tests share one source of truth.
 */
import type { MandatoryMetric, MetricProvenance } from "./types";
import { MANDATORY_METRICS } from "./types";

export type ChangeDirection = "up" | "down" | "flat" | "new" | "confidence";

export interface MetricChange {
  metric: MandatoryMetric;
  direction: ChangeDirection;
  oldValue: number | null;
  newValue: number | null;
  oldPeriodEnd: string | null;
  newPeriodEnd: string | null;
  unit: string | null;
  /** Provenance of the figure being surfaced (new value, or the last known one for confidence). */
  sourceId: string | null;
  attribution: string | null;
  /** Signed percent change vs the old value; null when not computable. */
  pctChange: number | null;
}

/** A per-suburb metrics map, as returned by the scoring RPC / stored evidence. */
export type MetricSnapshot = Partial<Record<string, MetricProvenance>>;

export interface DetectOptions {
  /** Suppress value moves smaller than this percent (confidence/new always pass). Default 0. */
  minChangePct?: number;
  /** "Now" for staleness. When omitted, staleness (confidence) detection is skipped. */
  asOf?: Date;
  /** A metric older than this many days at asOf is considered stale. Default 540 (mirrors engine HARD_STALE_DAYS). */
  hardStaleDays?: number;
}

function periodEndMs(m: MetricProvenance): number | null {
  const d = m.period_end ?? m.period_start;
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
}

function ageDays(m: MetricProvenance, asOf: Date): number | null {
  const t = periodEndMs(m);
  return t === null ? null : (asOf.getTime() - t) / 86_400_000;
}

/**
 * Compare a prior snapshot against the current one for a single suburb.
 * Returns one MetricChange per mandatory metric that materially changed,
 * in fixed metric order (deterministic).
 */
export function detectMetricChanges(
  prev: MetricSnapshot,
  curr: MetricSnapshot,
  opts: DetectOptions = {},
): MetricChange[] {
  const minPct = Math.max(0, opts.minChangePct ?? 0);
  const hardStaleDays = opts.hardStaleDays ?? 540;
  const out: MetricChange[] = [];

  for (const metric of MANDATORY_METRICS) {
    const p = prev[metric];
    const c = curr[metric];

    const currFresh =
      c != null && (opts.asOf == null || (ageDays(c, opts.asOf) ?? Infinity) <= hardStaleDays);

    // Metric present before but now gone or stale → confidence event (no invented value).
    if (p != null && !currFresh) {
      out.push({
        metric,
        direction: "confidence",
        oldValue: p.value,
        newValue: null,
        oldPeriodEnd: p.period_end,
        newPeriodEnd: null,
        unit: p.unit,
        sourceId: p.source_id,
        attribution: p.attribution,
        pctChange: null,
      });
      continue;
    }

    if (c == null) continue; // absent before and after → nothing to say.

    // Brand-new metric appearing on the suburb.
    if (p == null) {
      out.push({
        metric,
        direction: "new",
        oldValue: null,
        newValue: c.value,
        oldPeriodEnd: null,
        newPeriodEnd: c.period_end,
        unit: c.unit,
        sourceId: c.source_id,
        attribution: c.attribution,
        pctChange: null,
      });
      continue;
    }

    // Both present: a change is only real when the official period advanced.
    const pMs = periodEndMs(p);
    const cMs = periodEndMs(c);
    if (pMs != null && cMs != null && cMs <= pMs) continue; // same/older period → not a refresh.

    const pctChange = p.value !== 0 ? ((c.value - p.value) / Math.abs(p.value)) * 100 : null;
    const direction: ChangeDirection = c.value > p.value ? "up" : c.value < p.value ? "down" : "flat";

    // Threshold gate applies to value moves only (never to confidence/new).
    if (direction !== "flat" && pctChange != null && Math.abs(pctChange) < minPct) continue;
    if (direction === "flat") continue; // a refresh that didn't move the value is not an alert.

    out.push({
      metric,
      direction,
      oldValue: p.value,
      newValue: c.value,
      oldPeriodEnd: p.period_end,
      newPeriodEnd: c.period_end,
      unit: c.unit,
      sourceId: c.source_id,
      attribution: c.attribution,
      pctChange,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Provenance-mapped explanations.
// ---------------------------------------------------------------------------

const METRIC_LABELS: Record<MandatoryMetric, string> = {
  median_house_price: "median house price",
  median_rent: "median rent",
  gross_yield: "gross yield",
  sales_volume: "12-month sales volume",
  price_growth_12m: "12-month price growth",
};

const PCT_METRICS = new Set<string>(["gross_yield", "price_growth_12m"]);
const MONEY_METRICS = new Set<string>(["median_house_price", "median_rent"]);

/** Human label for a metric; falls back to the raw key humanised for any non-mandatory metric. */
function labelFor(metric: string): string {
  return METRIC_LABELS[metric as MandatoryMetric] ?? metric.replace(/_/g, " ");
}

function fmtValue(metric: string, value: number): string {
  if (PCT_METRICS.has(metric)) return `${value.toFixed(2)}%`;
  if (MONEY_METRICS.has(metric)) return `A$${Math.round(value).toLocaleString("en-AU")}`;
  return `${Math.round(value).toLocaleString("en-AU")}`; // counts (sales_volume) + unknowns
}

function provenanceLabel(c: MetricChange): string {
  const period = c.newPeriodEnd ?? c.oldPeriodEnd ?? "n/a";
  const src = c.sourceId ? `${c.sourceId} · ${period}` : period;
  return c.attribution ? `${src}. Source: ${c.attribution}.` : `${src}.`;
}

/**
 * A single, plain-English, sourced sentence for one change. Deterministic; every
 * figure it states is copied from the change's provenance (no interpretation of
 * cause, no recommendation, no forecast).
 */
export function explainChange(c: MetricChange): string {
  const label = labelFor(c.metric);
  const prov = provenanceLabel(c);

  if (c.direction === "confidence") {
    return `We can no longer confirm a current ${label} for this suburb from official data — confidence lowered until it refreshes (last known ${c.oldValue != null ? fmtValue(c.metric, c.oldValue) : "value"}, ${prov})`;
  }
  if (c.direction === "new" && c.newValue != null) {
    return `${cap(label)} is now available: ${fmtValue(c.metric, c.newValue)} (${prov})`;
  }

  const verb = c.direction === "up" ? "rose" : "fell";
  const oldStr = c.oldValue != null ? fmtValue(c.metric, c.oldValue) : "n/a";
  const newStr = c.newValue != null ? fmtValue(c.metric, c.newValue) : "n/a";
  const delta = c.pctChange != null ? ` (${c.pctChange >= 0 ? "+" : ""}${c.pctChange.toFixed(1)}%)` : "";
  return `${cap(label)} ${verb} from ${oldStr} to ${newStr}${delta} (${prov})`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
