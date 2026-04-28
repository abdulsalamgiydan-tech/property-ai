import React, { type ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  accent?: "default" | "violet" | "emerald" | "amber" | "red";
  className?: string;
};

function accentClasses(accent: NonNullable<MetricCardProps["accent"]>): string {
  if (accent === "violet") return "text-violet-200";
  if (accent === "emerald") return "text-emerald-200";
  if (accent === "amber") return "text-amber-200";
  if (accent === "red") return "text-red-200";
  return "text-zinc-100";
}

export function MetricCard({
  label,
  value,
  subtext,
  accent = "default",
  className,
}: MetricCardProps) {
  return (
    <article
      className={`rounded-xl border border-zinc-700/70 bg-zinc-950/55 p-4 shadow-md shadow-black/20 ${className ?? ""}`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight tabular-nums ${accentClasses(accent)}`}>
        {value}
      </p>
      {subtext ? <p className="mt-1 text-xs text-zinc-500">{subtext}</p> : null}
    </article>
  );
}
