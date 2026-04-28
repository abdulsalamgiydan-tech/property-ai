import React from "react";
import { CTAButton } from "@/components/design/CTAButton";

type EmptyStateProps = {
  title: string;
  body: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
};

export function EmptyState({
  title,
  body,
  ctaLabel,
  onCtaClick,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-zinc-600/70 bg-zinc-900/45 p-8 text-center ${className ?? ""}`}
    >
      <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-zinc-400">{body}</p>
      {ctaLabel && onCtaClick ? (
        <div className="mt-5">
          <CTAButton onClick={onCtaClick}>{ctaLabel}</CTAButton>
        </div>
      ) : null}
    </div>
  );
}
