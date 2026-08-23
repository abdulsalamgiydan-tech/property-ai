import type { SuburbMetricProvenance } from "@/lib/warehouse/suburbMetricProvenance";
import { toDisplayRow, type MetricDisplayRow } from "@/lib/warehouse/metricProvenanceDisplay";

/**
 * Honest per-metric provenance for a suburb: value, direct/derived/unavailable
 * status, source, reporting period, freshness and a missing-data reason. Renders
 * nothing that isn't in the underlying MetricProvenance — a missing value shows
 * "Unavailable" + reason, never a fabricated figure.
 */
function StatusBadge({ status }: { status: MetricDisplayRow["status"] }) {
  const cls =
    status === "Direct"
      ? "bg-emerald-100 text-emerald-800"
      : status === "Derived"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-600";
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{status}</span>;
}

export function MetricProvenancePanel({ provenance }: { provenance: SuburbMetricProvenance }) {
  const rows: MetricDisplayRow[] = [
    toDisplayRow("Median sale price", provenance.salePrice),
    toDisplayRow("Median weekly rent", provenance.weeklyRent),
    toDisplayRow("Gross yield", provenance.grossYield),
    toDisplayRow("12-month price growth", provenance.annualGrowth),
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1 pr-4">Metric</th>
            <th className="py-1 pr-4">Value</th>
            <th className="py-1 pr-4">Basis</th>
            <th className="py-1 pr-4">Source</th>
            <th className="py-1 pr-4">Period</th>
            <th className="py-1 pr-4">Freshness</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-slate-100 align-top">
              <td className="py-1.5 pr-4 font-medium text-slate-700">{r.label}</td>
              <td className="py-1.5 pr-4">{r.value}</td>
              <td className="py-1.5 pr-4"><StatusBadge status={r.status} /></td>
              <td className="py-1.5 pr-4 text-slate-600">{r.source}</td>
              <td className="py-1.5 pr-4 text-slate-600">{r.period}</td>
              <td className="py-1.5 pr-4 text-slate-600">{r.freshness}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.some((r) => r.status === "Unavailable" && r.note) ? (
        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
          {rows
            .filter((r) => r.status === "Unavailable" && r.note)
            .map((r) => (
              <li key={r.label}>
                <span className="font-medium">{r.label}:</span> {r.note}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}
