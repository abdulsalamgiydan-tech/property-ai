"use client";

import { downloadBlob } from "@/lib/export/downloadBlob";
import { reportBundleToCsv, reportBundleToJson, type ResearchReportBundle } from "@/lib/export/researchReport";

/**
 * Sprint 13 WS16 — combined investment-research report export (area
 * snapshot + scenario cases + confidence + sources + limitations +
 * generation date). Same "no PDF dependency" convention as
 * ExportButtons: Print/Save as PDF uses the browser's own native
 * print-to-PDF, triggered on window.print().
 */
export function ResearchReportExportButtons({ bundle, filenameBase }: { bundle: ResearchReportBundle; filenameBase: string }) {
  const timestamp = bundle.generatedAt.slice(0, 10);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => downloadBlob(reportBundleToCsv(bundle), `${filenameBase}-report-${timestamp}.csv`, "text/csv;charset=utf-8")}
        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
      >
        Download report (CSV)
      </button>
      <button
        type="button"
        onClick={() => downloadBlob(reportBundleToJson(bundle), `${filenameBase}-report-${timestamp}.json`, "application/json")}
        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
      >
        Download report (JSON)
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}
