import React from "react";

type Confidence = "high" | "medium" | "low" | "insufficient" | string | null | undefined;

/**
 * Neutral data-confidence indicator — deliberately NOT components/design's
 * StatusBadge (which uses green/amber/red "DealStatus" semantics for buy/
 * pass-style signals). This badge only ever communicates how much sample
 * data backs a metric, never whether a property/suburb is "good" or "bad".
 */
export function ConfidenceBadge({ level, className }: { level: Confidence; className?: string }) {
  const normalized = (level ?? "unavailable").toLowerCase();
  const styles: Record<string, string> = {
    high: "border-sky-500/35 bg-sky-950/30 text-sky-200",
    medium: "border-zinc-500/35 bg-zinc-800/40 text-zinc-300",
    low: "border-amber-500/30 bg-amber-950/25 text-amber-200/90",
    insufficient: "border-zinc-600/40 bg-zinc-900/40 text-zinc-500",
    unavailable: "border-zinc-700/40 bg-zinc-900/40 text-zinc-600",
  };
  const cls = styles[normalized] ?? styles.unavailable;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${cls} ${className ?? ""}`}
    >
      {normalized === "unavailable" ? "no data" : `${normalized} confidence`}
    </span>
  );
}
