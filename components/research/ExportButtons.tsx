"use client";

import React from "react";
import { csvCell } from "@/lib/export/csvSafety";
import { downloadBlob } from "@/lib/export/downloadBlob";

export type ExportColumnDef = { key: string; label: string };
export type ExportRow = Record<string, string | number | null>;

type ExportButtonsProps = {
  rows: ExportRow[];
  columns: ExportColumnDef[];
  filenameBase: string;
  generatedAt?: string;
  provenanceNote?: string;
};

/**
 * Client-side CSV/JSON export + print trigger for a research table. No
 * server round-trip — the data is already on the page (server-rendered),
 * this just re-serialises it into a downloadable file. Rows/columns are
 * plain, already-flattened data (not accessor functions) because
 * functions cannot cross the Server Component -> Client Component
 * boundary — the calling Server Component page is responsible for
 * flattening its domain rows into ExportRow[] before rendering this.
 *
 * No PDF: this project's rule is "no PDF unless free local tooling
 * exists" — the browser's own native print-to-PDF (triggered by the
 * Print button below) already satisfies that without adding a
 * PDF-generation dependency.
 */
export function ExportButtons({ rows, columns, filenameBase, generatedAt, provenanceNote }: ExportButtonsProps) {
  const timestamp = (generatedAt ?? new Date().toISOString()).slice(0, 10);

  function exportCsv() {
    const header = columns.map((c) => csvCell(c.label)).join(",");
    const lines = rows.map((r) => columns.map((c) => csvCell(r[c.key] ?? null)).join(","));
    const provenance = provenanceNote ? `# ${provenanceNote}\n` : "";
    downloadBlob(`${provenance}${header}\n${lines.join("\n")}\n`, `${filenameBase}-${timestamp}.csv`, "text/csv;charset=utf-8");
  }

  function exportJson() {
    const payload = {
      generated_at: generatedAt ?? new Date().toISOString(),
      provenance: provenanceNote ?? null,
      disclaimer: "Descriptive research data only — not financial, tax or legal advice, not an investment recommendation, and not a forecast.",
      rows,
    };
    downloadBlob(JSON.stringify(payload, null, 2), `${filenameBase}-${timestamp}.json`, "application/json");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={exportCsv}
        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
      >
        Download CSV
      </button>
      <button
        type="button"
        onClick={exportJson}
        className="rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-zinc-100"
      >
        Download JSON
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
