import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { MarketMapExplorer } from "@/components/research/MarketMapExplorer";
import { isMultiStateResearchEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = {
  title: "National Map Explorer (Research Preview) | Propellect",
  robots: { index: false, follow: false },
};

export default function MapPage() {
  // Same gate as /research/explore and /research/compare — reused rather
  // than a new flag, since Workstream 18 (feature flags) is the dedicated
  // pass for adding the 3 new named flags this sprint's spec calls for
  // (including NATIONAL_MAP_ENABLED); this route will move to that flag
  // when WS18 runs rather than duplicating the decision here.
  if (!isMultiStateResearchEnabled()) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">National Map Explorer</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Pan and zoom to see loaded suburbs, postcodes and LGAs across NSW, VIC, QLD, SA and WA.
          No default ranking, no colour-coded &quot;best suburb&quot; scoring — markers only show
          what data is available.
        </p>
      </div>

      <SectionCard>
        <MarketMapExplorer />
      </SectionCard>
    </div>
  );
}
