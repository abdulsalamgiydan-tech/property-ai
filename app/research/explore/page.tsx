import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { ExploreFilterForm } from "@/components/research/ExploreFilterForm";
import { ExploreResultsList } from "@/components/research/ExploreResultsList";
import { searchGeographiesV2 } from "@/lib/warehouse/queries";
import { isMultiStateResearchEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = {
  title: "Explore Suburbs & Postcodes (Research Preview) | Propellect",
  robots: { index: false, follow: false },
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; type?: string }>;
}) {
  // Multi-state routes require BOTH the base warehouse preview flag
  // (checked in app/research/layout.tsx, which wraps this route) AND this
  // sprint's own flag — both disabled by default.
  if (!isMultiStateResearchEnabled()) notFound();

  const { q, state, type } = await searchParams;
  const jurisdiction = state === "NSW" || state === "VIC" ? state : undefined;
  const geographyType = type === "SAL" || type === "POA" ? type : undefined;

  const results = await searchGeographiesV2({
    query: q,
    jurisdiction,
    geographyType,
    limit: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Explore</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Browse NSW and VIC suburbs and postcodes. No default ranking — filter by
          state and geography type, then select geographies to compare.
        </p>
      </div>

      <SectionCard>
        <ExploreFilterForm initialQuery={q ?? ""} initialJurisdiction={jurisdiction ?? ""} initialGeographyType={geographyType ?? ""} />
      </SectionCard>

      {results.length === 0 ? (
        <EmptyState
          title="No matches"
          body="Try a different search term, or clear the state/type filters to see all available geographies."
          linkHref={q || jurisdiction || geographyType ? "/research/explore" : undefined}
          linkLabel={q || jurisdiction || geographyType ? "Clear all filters →" : undefined}
        />
      ) : (
        <SectionCard title="Results" description={`${results.length} match(es), up to 50 shown`}>
          <ExploreResultsList results={results} />
        </SectionCard>
      )}
    </div>
  );
}
