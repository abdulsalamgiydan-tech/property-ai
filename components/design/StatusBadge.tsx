import React from "react";
import { statusClasses, statusLabel, type DealStatus } from "@/components/design/tokens";

type StatusBadgeProps = {
  status: DealStatus;
  score?: number;
  className?: string;
};

export function StatusBadge({ status, score, className }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(status)} ${className ?? ""}`}
      aria-label={statusLabel(status)}
    >
      <span className="inline-block size-1.5 rounded-full bg-current" aria-hidden />
      <span>{statusLabel(status)}</span>
      {typeof score === "number" ? <span className="opacity-90">{score}</span> : null}
    </span>
  );
}
