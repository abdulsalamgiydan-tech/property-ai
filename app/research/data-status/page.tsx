import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { StateBadge } from "@/components/research/StateBadge";
import { getDatasetFreshness } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Data Status (Research Preview) | Propellect", robots: { index: false, follow: false } };

const STATUS_STYLES: Record<string, string> = {
  current: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
  due: "border-amber-500/30 bg-amber-950/25 text-amber-200/90",
  stale: "border-orange-500/30 bg-orange-950/25 text-orange-200/90",
  failed: "border-red-500/35 bg-red-950/25 text-red-200",
  blocked: "border-red-500/35 bg-red-950/25 text-red-200",
  manual_review: "border-zinc-500/35 bg-zinc-800/40 text-zinc-300",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.manual_review;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export default async function DataStatusPage() {
  // Gated by the base warehouse preview flag only (this is an
  // observability page for the whole warehouse, not multi-state-specific
  // functionality) — the parent layout already enforces this, this check
  // is redundant defence-in-depth matching the pattern used elsewhere.
  if (!isWarehousePreviewEnabled()) notFound();

  const rows = await getDatasetFreshness();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Data status</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Per-dataset freshness for the datasets feeding this research preview. No
          local file paths, credentials, or internal identifiers are shown here.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No freshness data yet"
          body="Run warehouse/scripts/orchestration/check_freshness.mjs --execute to populate this page."
        />
      ) : (
        <SectionCard title="Datasets" description={`${rows.length} dataset(s)`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Dataset</th>
                  <th className="py-2 pr-4">Publisher</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Expected cadence</th>
                  <th className="py-2 pr-4">Branch rows</th>
                  <th className="py-2 pr-4">Coverage</th>
                  <th className="py-2 pr-4">Source</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {rows.map((r) => (
                  <tr key={r.dataset_id} className="border-t border-zinc-800/60 align-top">
                    <td className="py-2 pr-4">
                      <div className="text-zinc-100">{r.dataset_name ?? r.dataset_id}</div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <StateBadge jurisdiction={r.jurisdiction} />
                        {r.last_failure_summary ? (
                          <span className="text-[11px] text-red-300" title={r.last_failure_summary}>
                            last failure recorded
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-zinc-400">{r.publisher ?? "n/a"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={r.freshness_status} />
                    </td>
                    <td className="py-2 pr-4 text-xs">{r.expected_cadence_days != null ? `${r.expected_cadence_days} days` : "n/a"}</td>
                    <td className="py-2 pr-4 text-xs">{r.current_branch_row_count?.toLocaleString("en-AU") ?? "n/a"}</td>
                    <td className="py-2 pr-4 text-xs">{r.local_only_or_branch_published === "branch_published" ? "Branch-published" : "Local only"}</td>
                    <td className="py-2 pr-4 text-xs">
                      {r.source_url ? (
                        <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-violet-300 hover:underline">
                          official source →
                        </a>
                      ) : (
                        "n/a"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Status meanings">
        <ul className="space-y-1 text-xs text-zinc-400">
          <li><StatusBadge status="current" /> — refreshed within the expected cadence window.</li>
          <li><StatusBadge status="due" /> — past the expected cadence, refresh recommended.</li>
          <li><StatusBadge status="stale" /> — more than 2x the expected cadence overdue.</li>
          <li><StatusBadge status="failed" /> — last refresh attempt failed, no successful run recorded.</li>
          <li><StatusBadge status="manual_review" /> — no orchestrator run recorded yet (e.g. built directly, not yet run through warehouse/scripts/orchestration/).</li>
        </ul>
      </SectionCard>
    </div>
  );
}
