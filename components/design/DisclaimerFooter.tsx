import React from "react";
import Link from "next/link";

type DisclaimerFooterProps = {
  className?: string;
};

export function DisclaimerFooter({ className }: DisclaimerFooterProps) {
  return (
    <footer className={`border-t border-zinc-800/70 ${className ?? ""}`}>
      <p className="mx-auto max-w-5xl px-4 py-6 text-center text-[11px] leading-relaxed text-zinc-500 sm:px-6">
        Illustrative modelling only - not financial, tax or legal advice.{" "}
        <Link
          href="/legal"
          className="rounded text-violet-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
        >
          Legal &amp; disclosures
        </Link>
      </p>
    </footer>
  );
}
