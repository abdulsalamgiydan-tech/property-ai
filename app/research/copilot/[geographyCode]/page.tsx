import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { ResearchCopilotClient } from "@/components/research/ResearchCopilotClient";
import { resolveGeographyByCode } from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { isResearchCopilotEnabled, isWarehousePreviewEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Research Copilot | Propellect", robots: { index: false, follow: false } };

// Sprint 14 WS5 — grounded AI research copilot. The page itself only
// resolves the geography for display purposes (label/existence check);
// the actual evidence fetch, LLM call, and grounding check all happen
// server-side per-question in app/api/research/copilot, never here.
export default async function ResearchCopilotPage({ params }: { params: Promise<{ geographyCode: string }> }) {
  if (!isWarehousePreviewEnabled() || !isResearchCopilotEnabled()) notFound();

  const { geographyCode } = await params;
  const geo = await resolveGeographyByCode("SAL", geographyCode);
  if (!geo) notFound();

  const geographyLabel = `${geo.geography_name}${stateLabel(geo.state_code) ? `, ${stateLabel(geo.state_code)}` : ""}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Research Copilot — {geographyLabel}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ask a question about this area&apos;s recorded market evidence. Every answer is generated only from that
          evidence and checked before being shown — never a forecast or recommendation.
        </p>
      </div>
      <SectionCard>
        <ResearchCopilotClient geographyCode={geographyCode} geographyLabel={geographyLabel} />
      </SectionCard>
    </div>
  );
}
