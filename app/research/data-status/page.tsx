import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { StateBadge } from "@/components/research/StateBadge";
import { getDatasetFreshness, getOperationsSummary, getRefreshRunHistory } from "@/lib/warehouse/queries";
import { isDataOperationsEnabled, isWarehousePreviewEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Data Status (Research Preview) | Propellect", robots: { index: false, follow: false } };

const STATUS_STYLES: Record<string, string> = {
  current: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
  succeeded: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
  branch_published: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
  due: "border-amber-500/30 bg-amber-950/25 text-amber-200/90",
  stale: "border-orange-500/30 bg-orange-950/25 text-orange-200/90",
  partially_covered: "border-orange-500/30 bg-orange-950/25 text-orange-200/90",
  failed: "border-red-500/35 bg-red-950/25 text-red-200",
  blocked: "border-red-500/35 bg-red-950/25 text-red-200",
  source_unavailable: "border-red-500/35 bg-red-950/25 text-red-200",
  validation_failed: "border-red-500/35 bg-red-950/25 text-red-200",
  local_only: "border-sky-500/30 bg-sky-950/25 text-sky-200/90",
  unsupported: "border-zinc-500/35 bg-zinc-800/40 text-zinc-300",
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
  // Gated by both the base warehouse preview flag (parent layout already
  // enforces this; redundant defence-in-depth) and DATA_OPERATIONS_ENABLED
  // (WS18) so this operationally-sensitive console can be toggled
  // independently of the rest of /research.
  if (!isWarehousePreviewEnabled() || !isDataOperationsEnabled()) notFound();

  const [rows, summary, runHistory] = await Promise.all([getDatasetFreshness(), getOperationsSummary(), getRefreshRunHistory()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Data operations console</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Per-dataset freshness, refresh-run history and storage consumption for the
          datasets feeding this research preview. No local file paths, credentials, or
          internal identifiers are shown here.
        </p>
      </div>

      {summary ? (
        <SectionCard title="Operations summary" description="Aggregate counts and branch storage">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.total_datasets}</div>
              <div className="text-xs text-zinc-500">Datasets tracked</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-300">{summary.branch_published_count}</div>
              <div className="text-xs text-zinc-500">Branch-published</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-amber-300">{summary.local_only_count}</div>
              <div className="text-xs text-zinc-500">Local only</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-300">{summary.blocked_or_unsupported_count}</div>
              <div className="text-xs text-zinc-500">Blocked / failed</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.branch_db_size_mb.toLocaleString("en-AU")} MB</div>
              <div className="text-xs text-zinc-500">Branch database size</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-zinc-100">{summary.runs_last_30_days}</div>
              <div className="text-xs text-zinc-500">Refresh runs (30d)</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-red-300">{summary.runs_failed_last_30_days}</div>
              <div className="text-xs text-zinc-500">Failed runs (30d)</div>
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-200">{summary.last_run_status ?? "n/a"}</div>
              <div className="text-xs text-zinc-500">Last run status</div>
            </div>
          </div>
        </SectionCard>
      ) : null}

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

      {runHistory.length > 0 ? (
        <SectionCard title="Refresh run history" description={`Most recent ${runHistory.length} run(s), newest first`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-4">Dataset</th>
                  <th className="py-2 pr-4">Mode</th>
                  <th className="py-2 pr-4">Target</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Started</th>
                  <th className="py-2 pr-4">Duration</th>
                  <th className="py-2 pr-4">Rows</th>
                  <th className="py-2 pr-4">Error</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {runHistory.slice(0, 30).map((r) => (
                  <tr key={r.refresh_run_id} className="border-t border-zinc-800/60 align-top">
                    <td className="py-2 pr-4 text-zinc-100">{r.dataset_name ?? r.dataset_id}</td>
                    <td className="py-2 pr-4 text-xs">{r.mode}</td>
                    <td className="py-2 pr-4 text-xs">{r.target}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="py-2 pr-4 text-xs">{new Date(r.started_at).toLocaleString("en-AU")}</td>
                    <td className="py-2 pr-4 text-xs">{r.duration_seconds != null ? `${r.duration_seconds}s` : "n/a"}</td>
                    <td className="py-2 pr-4 text-xs">{r.rows_affected?.toLocaleString("en-AU") ?? "n/a"}</td>
                    <td className="py-2 pr-4 text-xs text-red-300" title={r.error_summary ?? undefined}>
                      {r.error_summary ? `${r.error_summary.slice(0, 40)}...` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="Status meanings">
        <ul className="space-y-1 text-xs text-zinc-400">
          <li><StatusBadge status="current" /> — refreshed within the expected cadence window.</li>
          <li><StatusBadge status="due" /> — past the expected cadence, refresh recommended.</li>
          <li><StatusBadge status="stale" /> — more than 2x the expected cadence overdue.</li>
          <li><StatusBadge status="failed" /> — last refresh attempt failed, no successful run recorded.</li>
          <li><StatusBadge status="blocked" /> — a source is known-inaccessible (e.g. Cloudflare bot protection) — documented, not bypassed.</li>
          <li><StatusBadge status="source_unavailable" /> — the official source itself currently returns an error or has been taken down.</li>
          <li><StatusBadge status="validation_failed" /> — data was retrieved but failed a local quality gate before it could be promoted.</li>
          <li><StatusBadge status="local_only" /> — built and validated locally, not yet promoted to the branch (a deliberate, documented scope decision, not a failure).</li>
          <li><StatusBadge status="branch_published" /> — promoted to the branch and queryable via the public research interfaces.</li>
          <li><StatusBadge status="partially_covered" /> — some but not all geography levels or dwelling types are available for this dataset.</li>
          <li><StatusBadge status="unsupported" /> — no free official source exists for this jurisdiction/metric combination (see the relevant jurisdiction&apos;s source manifest for why).</li>
          <li><StatusBadge status="manual_review" /> — no orchestrator run recorded yet (e.g. built directly, not yet run through warehouse/scripts/orchestration/).</li>
        </ul>
      </SectionCard>
    </div>
  );
}
