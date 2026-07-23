import React from "react";
import Link from "next/link";
import { CTAButton } from "@/components/design/CTAButton";

type EmptyStateProps = {
  title: string;
  body: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  className?: string;
  /**
   * A plain navigational link (e.g. "Clear filters"), rendered as a
   * next/link — safe to use from a server component, unlike
   * ctaLabel/onCtaClick which require a client-component caller.
   * Sprint 14 WS3/WS4.
   */
  linkHref?: string;
  linkLabel?: string;
};

export function EmptyState({
  title,
  body,
  ctaLabel,
  onCtaClick,
  className,
  linkHref,
  linkLabel,
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
      {linkHref && linkLabel ? (
        <div className="mt-4">
          <Link href={linkHref} className="text-sm text-violet-300 hover:underline">
            {linkLabel}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
