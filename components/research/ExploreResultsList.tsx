"use client";

import React, { useState } from "react";
import Link from "next/link";
import { StateBadge } from "@/components/research/StateBadge";
import type { GeographySearchResultV2 } from "@/lib/warehouse/queries";

export function ExploreResultsList({ results }: { results: GeographySearchResultV2[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 10) next.add(id);
      return next;
    });
  }

  const compareHref = `/research/compare?ids=${Array.from(selected).join(",")}`;

  return (
    <div className="space-y-3">
      {selected.size >= 2 ? (
        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-4 py-3 text-sm text-violet-200">
          {selected.size} selected (up to 10) —{" "}
          <Link href={compareHref} className="font-medium underline underline-offset-2">
            compare now →
          </Link>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Select 2-10 geographies below to compare them side by side.</p>
      )}
      <ul className="divide-y divide-zinc-800/70">
        {results.map((r) => {
          const detailHref = r.geography_type === "SAL" ? `/research/suburb/${r.geography_code}` : `/research/postcode/${r.geography_code}`;
          const checked = selected.has(r.geography_id);
          return (
            <li key={r.geography_id} className="flex items-center gap-3 py-3 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(r.geography_id)}
                disabled={!checked && selected.size >= 10}
                aria-label={`Select ${r.geography_name} for comparison`}
                className="h-4 w-4 shrink-0 rounded border-zinc-600 bg-zinc-900 accent-violet-500"
              />
              <Link href={detailHref} className="flex flex-1 items-center justify-between gap-3 hover:text-violet-300">
                <span className="text-zinc-100">
                  {r.geography_name}
                  <StateBadge jurisdiction={r.jurisdiction} className="ml-2" />
                  <span className="ml-2 text-xs text-zinc-500">{r.geography_type === "SAL" ? "Suburb" : "Postcode"}</span>
                </span>
                {!r.has_suburb_snapshot && !r.has_postcode_snapshot ? (
                  <span className="text-[11px] text-zinc-600">no market data yet</span>
                ) : (
                  <span className="text-[11px] text-violet-300">view →</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
