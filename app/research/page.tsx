import type { Metadata } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { ResearchSearchForm } from "@/components/research/ResearchSearchForm";
import { StateBadge } from "@/components/research/StateBadge";
import { getDatasetFreshness, getEvidenceCatalogue, searchGeography } from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { isMultiStateResearchEnabled, isScenarioLabEnabled } from "@/lib/warehouse/env";
import { buildResearchHubSummary, formatSummaryDate } from "@/lib/research/hubSummary";

export const metadata: Metadata = {
  title: "Research Hub (Preview) | Propellect",
  robots: { index: false, follow: false },
};

const statusCopy = {
  available: "Fresh warehouse data available",
  partial: "Some warehouse data needs review",
  unavailable: "Warehouse status unavailable",
} as const;

export default async function ResearchSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const [results, datasets, sources] = await Promise.all([
    q ? searchGeography(q) : Promise.resolve([]),
    getDatasetFreshness(),
    getEvidenceCatalogue(),
  ]);
  const multiStateEnabled = isMultiStateResearchEnabled();
  const scenarioLabEnabled = isScenarioLabEnabled();
  const summary = buildResearchHubSummary(datasets, sources);

  return (
    <div className="space-y-7">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Research preview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-100 sm:text-4xl">Research Hub</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
            Search suburbs and postcodes, compare like-for-like market signals, and inspect source freshness before using a metric in analysis.
          </p>
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            {multiStateEnabled ? (
              <>
                <Link href="/research/explore" className="rounded-lg border border-zinc-700/70 px-3 py-2 text-violet-200 hover:border-violet-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35">
                  Explore locations
                </Link>
                <Link href="/research/compare" className="rounded-lg border border-zinc-700/70 px-3 py-2 text-violet-200 hover:border-violet-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35">
                  Compare locations
                </Link>
                <Link href="/research/map" className="rounded-lg border border-zinc-700/70 px-3 py-2 text-violet-200 hover:border-violet-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35">
                  Open map
                </Link>
              </>
            ) : null}
            {scenarioLabEnabled ? (
              <Link href="/research/scenario" className="rounded-lg border border-zinc-700/70 px-3 py-2 text-violet-200 hover:border-violet-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35">
                Scenario Lab
              </Link>
            ) : null}
            <Link href="/research/sources" className="rounded-lg border border-zinc-700/70 px-3 py-2 text-violet-200 hover:border-violet-500/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/35">
              Sources
            </Link>
          </div>
        </div>

        <SectionCard title="Warehouse status" description={statusCopy[summary.statusLabel]}>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-zinc-500">Datasets</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{summary.datasetCount || "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Sources</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{summary.sourceCount || "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Current</dt>
              <dd className="mt-1 text-xl font-semibold text-zinc-100">{summary.datasetCount ? `${summary.currentDatasetCount}/${summary.datasetCount}` : "Unavailable"}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Last refresh</dt>
              <dd className="mt-1 text-sm font-medium text-zinc-100">{formatSummaryDate(summary.latestRetrievedAt)}</dd>
            </div>
          </dl>
          {summary.attentionDatasetCount > 0 ? (
            <p className="mt-4 text-xs leading-5 text-amber-200">{summary.attentionDatasetCount} dataset(s) are due, stale, blocked, failed, or awaiting manual review.</p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard title="Find a market" description="Use suburb names or postcodes. Results stay descriptive and include confidence and source-period context where the warehouse provides it.">
        <ResearchSearchForm initialQuery={q ?? ""} />
      </SectionCard>

      {q && results.length === 0 ? (
        <EmptyState
          title="No matches"
          body={`No suburb or postcode matched "${q}". Try a different spelling, or search a 4-digit postcode.`}
        />
      ) : null}

      {results.length > 0 ? (
        <SectionCard title="Results" description={`${results.length} match(es)`}>
          <ul className="divide-y divide-zinc-800/70">
            {results.map((r) => (
              <li key={r.geography_id}>
                <Link
                  href={r.geography_type === "SAL" ? `/research/suburb/${r.geography_code}` : `/research/postcode/${r.geography_code}`}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-zinc-800/30 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30"
                >
                  <span className="text-zinc-100">
                    {r.geography_name}
                    {r.state_code === "2" ? <StateBadge jurisdiction="VIC" className="ml-2" /> : r.state_code === "1" ? <StateBadge jurisdiction="NSW" className="ml-2" /> : null}
                    <span className="ml-2 text-xs text-zinc-500">
                      {r.geography_type === "SAL" ? "Suburb" : "Postcode"}
                      {stateLabel(r.state_code) && r.state_code !== "1" && r.state_code !== "2" ? ` / ${stateLabel(r.state_code)}` : ""}
                    </span>
                  </span>
                  {!r.has_suburb_snapshot && !r.has_postcode_snapshot ? (
                    <span className="text-[11px] text-zinc-600">No market data yet</span>
                  ) : (
                    <span className="text-[11px] text-violet-300">View snapshot</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SectionCard title="Compare" description="Review multiple locations against the same metric set.">
          <Link href="/research/compare" className="text-sm font-medium text-violet-300 hover:underline">Open comparison</Link>
        </SectionCard>
        <SectionCard title="Map" description="Inspect bounded map results without unbounded warehouse queries.">
          <Link href="/research/map" className="text-sm font-medium text-violet-300 hover:underline">Open map</Link>
        </SectionCard>
        <SectionCard title="Data Status" description="Check freshness, quality and source limitations.">
          <Link href="/research/data-status" className="text-sm font-medium text-violet-300 hover:underline">View status</Link>
        </SectionCard>
      </div>
    </div>
  );
}