"use client";

import type { ReactNode } from "react";
import { Lock } from "./LockIcon";

type UnlockCardProps = {
  title: string;
  body: ReactNode;
  ctaLabel?: string;
  /** Optional line under the CTA; omit for default early-access copy. Pass null to hide. */
  accountHint?: string | null;
  onCtaClick: () => void;
};

const DEFAULT_ACCOUNT_HINT =
  "Create a free account to unlock the full analysis and future investor tools.";

export function UnlockCard({
  title,
  body,
  ctaLabel = "Get free early access",
  accountHint,
  onCtaClick,
}: UnlockCardProps) {
  return (
    <div className="w-full max-w-md rounded-2xl border border-violet-500/35 bg-zinc-900/95 p-6 shadow-2xl shadow-violet-950/40 backdrop-blur-md sm:p-7">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-950/50 text-violet-200">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-white">{title}</h3>
          <div className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</div>
        </div>
      </div>
      {accountHint !== null ? (
        <p className="mt-4 text-xs leading-relaxed text-zinc-500">
          {accountHint === undefined ? DEFAULT_ACCOUNT_HINT : accountHint}
        </p>
      ) : null}
      <button
        type="button"
        onClick={onCtaClick}
        className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40"
      >
        {ctaLabel}
      </button>
    </div>
  );
}
