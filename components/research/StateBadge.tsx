import React from "react";

/**
 * Explicit state/jurisdiction badge — Sprint 10 (multi-state). Prevents
 * same-name-suburb confusion (e.g. an "Ascot" or "Richmond" exists in more
 * than one Australian state) by always showing which jurisdiction a result
 * belongs to, everywhere a geography name is shown.
 */
export function StateBadge({ jurisdiction, className }: { jurisdiction: "NSW" | "VIC" | string | null | undefined; className?: string }) {
  if (!jurisdiction) return null;
  const styles: Record<string, string> = {
    NSW: "border-sky-500/35 bg-sky-950/25 text-sky-200",
    VIC: "border-emerald-500/35 bg-emerald-950/25 text-emerald-200",
  };
  const cls = styles[jurisdiction] ?? "border-zinc-600/40 bg-zinc-900/40 text-zinc-400";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls} ${className ?? ""}`}>
      {jurisdiction}
    </span>
  );
}
