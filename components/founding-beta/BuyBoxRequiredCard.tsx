"use client";

import Link from "next/link";
import { useEffect } from "react";
import { trackEvent, type FoundingBetaSurface } from "@/lib/analytics/events";

export function BuyBoxRequiredCard({ surface }: { surface: FoundingBetaSurface }) {
  useEffect(() => {
    trackEvent({ name: "founding_beta_buy_box_required", surface });
  }, [surface]);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status" aria-labelledby={`${surface}-buy-box-required`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">One quick setup step</p>
      <h2 id={`${surface}-buy-box-required`} className="mt-1 text-sm font-semibold text-amber-950">
        Create your buy box before scoring deals
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-amber-900">
        Your saved investment profile sets the budget, locations, property type and holding-cost limits used to assess each deal.
      </p>
      <ol className="mt-3 space-y-1 text-xs text-amber-900">
        <li><strong>1.</strong> Complete Find My Investment and save a profile.</li>
        <li><strong>2.</strong> Return here; your deal results will use that profile automatically.</li>
      </ol>
      <Link
        href="/find-investment"
        className="mt-3 inline-flex items-center justify-center rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-600/30"
      >
        Create my buy box
      </Link>
    </section>
  );
}
