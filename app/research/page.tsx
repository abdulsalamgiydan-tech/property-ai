import type { Metadata } from "next";
import Link from "next/link";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { ResearchSearchForm } from "@/components/research/ResearchSearchForm";
import { StateBadge } from "@/components/research/StateBadge";
import { searchGeography } from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { isMultiStateResearchEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = {
  title: "Suburb Intelligence (Research Preview) | Propellect",
  robots: { index: false, follow: false },
};

export default async function ResearchSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const results = q ? await searchGeography(q) : [];
  const multiStateEnabled = isMultiStateResearchEnabled();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Suburb Intelligence</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Research-only snapshots for NSW{multiStateEnabled ? " and VIC" : ""} suburbs
          and postcodes — sales, rent, yield, supply, demographics and
          affordability context, combined from official government sources.
        </p>
        {multiStateEnabled ? (
          <div className="mt-3 flex gap-3 text-sm">
            <Link href="/research/explore" className="text-violet-300 hover:underline">
              Explore all suburbs/postcodes →
            </Link>
            <Link href="/research/compare" className="text-violet-300 hover:underline">
              Compare geographies →
            </Link>
          </div>
        ) : null}
      </div>

      <SectionCard>
        <ResearchSearchForm initialQuery={q ?? ""} />
      </SectionCard>

      {q && results.length === 0 ? (
        <EmptyState
          title="No matches"
          body={`No NSW suburb or postcode matched "${q}". Try a different spelling, or search a 4-digit postcode.`}
        />
      ) : null}

      {results.length > 0 ? (
        <SectionCard title="Results" description={`${results.length} match(es)`}>
          <ul className="divide-y divide-zinc-800/70">
            {results.map((r) => (
              <li key={r.geography_id}>
                <Link
                  href={r.geography_type === "SAL" ? `/research/suburb/${r.geography_code}` : `/research/postcode/${r.geography_code}`}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:bg-zinc-800/30"
                >
                  <span className="text-zinc-100">
                    {r.geography_name}
                    {r.state_code === "2" ? <StateBadge jurisdiction="VIC" className="ml-2" /> : r.state_code === "1" ? <StateBadge jurisdiction="NSW" className="ml-2" /> : null}
                    <span className="ml-2 text-xs text-zinc-500">
                      {r.geography_type === "SAL" ? "Suburb" : "Postcode"}
                      {stateLabel(r.state_code) && r.state_code !== "1" && r.state_code !== "2" ? ` · ${stateLabel(r.state_code)}` : ""}
                    </span>
                  </span>
                  {!r.has_suburb_snapshot && !r.has_postcode_snapshot ? (
                    <span className="text-[11px] text-zinc-600">no market data yet</span>
                  ) : (
                    <span className="text-[11px] text-violet-300">view snapshot →</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
