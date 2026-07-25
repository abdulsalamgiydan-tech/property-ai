import type { Metadata } from "next";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { getEvidenceCatalogue } from "@/lib/warehouse/queries";
import { isWarehousePreviewEnabled } from "@/lib/warehouse/env";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Evidence Catalogue | Propellect", robots: { index: false, follow: false } };

// Sprint 12 WS5 — every registered source this platform draws from, its
// publisher/licence/status, and how many published metrics it feeds.
// Gated the same as every other /research route.
export default async function SourcesPage() {
  if (!isWarehousePreviewEnabled()) notFound();

  const sources = await getEvidenceCatalogue();
  const byCategory = new Map<string, typeof sources>();
  for (const s of sources) {
    if (!byCategory.has(s.source_category)) byCategory.set(s.source_category, []);
    byCategory.get(s.source_category)!.push(s);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Evidence catalogue</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Every source this research platform draws from — all official government or
          statutory publishers, never unofficial or scraped-without-attribution data.
        </p>
      </div>

      {sources.length === 0 ? (
        <EmptyState title="Catalogue unavailable" body="Could not load the evidence catalogue — the warehouse client may not be configured." />
      ) : (
        [...byCategory.entries()].map(([category, categorySources]) => (
          <SectionCard key={category} title={category} description={`${categorySources.length} source(s)`}>
            <ul className="divide-y divide-zinc-800/70">
              {categorySources.map((s) => (
                <li key={s.source_id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-zinc-100">{s.source_name}</span>
                    <span className="text-xs text-zinc-500">
                      {s.dataset_count} dataset{s.dataset_count === 1 ? "" : "s"} · {s.published_metric_family_count} metric famil{s.published_metric_family_count === 1 ? "y" : "ies"} published
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">
                    {s.publisher} ({s.official_or_independent}) · {s.licence ?? "licence not recorded"}
                  </p>
                  {s.known_limitations ? <p className="mt-1 text-xs text-zinc-600">{s.known_limitations}</p> : null}
                  {s.source_url ? (
                    <a href={s.source_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-violet-300 hover:underline">
                      View source ↗
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>
        ))
      )}
    </div>
  );
}
