/**
 * Pure display mapping for a MetricProvenance record → the exact strings the
 * suburb UI renders. Kept pure so the render contract is unit-testable without a
 * DOM. A missing value renders "Unavailable" + reason — NEVER "0", never a
 * fabricated figure; derived stays labelled derived.
 */
import type { MetricProvenance } from "./metricProvenance";

export type MetricDisplayRow = {
  label: string;
  value: string; // formatted, or "Unavailable"
  status: "Direct" | "Derived" | "Unavailable";
  source: string; // source name or "—"
  period: string; // reporting period or "—"
  freshness: string; // e.g. "Fresh", "Stale", "Expired", "Unknown"
  confidence: string;
  note: string; // missing reason or attribution
};

function formatValue(p: MetricProvenance): string {
  if (p.value == null) return "Unavailable";
  const u = p.unit ?? "";
  if (u === "AUD") return `$${Math.round(p.value).toLocaleString("en-AU")}`;
  if (u === "AUD/week") return `$${Math.round(p.value).toLocaleString("en-AU")}/wk`;
  if (u === "%") return `${p.value.toFixed(1)}%`;
  return `${p.value}${u ? ` ${u}` : ""}`;
}

const STATUS_LABEL: Record<MetricProvenance["classification"], MetricDisplayRow["status"]> = {
  direct: "Direct",
  derived: "Derived",
  fallback: "Derived", // contextual/broader-geography still not a direct suburb reading
  unavailable: "Unavailable",
};

const FRESHNESS_LABEL: Record<MetricProvenance["freshness"], string> = {
  fresh: "Fresh",
  stale: "Stale",
  expired: "Expired",
  unknown: "Unknown",
};

export function toDisplayRow(label: string, p: MetricProvenance): MetricDisplayRow {
  return {
    label,
    value: formatValue(p),
    status: STATUS_LABEL[p.classification],
    source: p.source ?? "—",
    period: p.reportingPeriod ?? "—",
    freshness: FRESHNESS_LABEL[p.freshness],
    confidence: p.confidence,
    note: p.value == null ? (p.missingReason ?? "No data.") : (p.attribution ?? p.method ?? ""),
  };
}
