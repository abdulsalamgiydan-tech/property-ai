import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketSnapshotView } from "@/components/research/MarketSnapshotView";
import {
  getEnrichedMarketSnapshot,
  getMetricAssumptions,
  getOfficialSuburbMetricsV1,
  getSuburbDemographics,
  getTimeseriesV2,
  resolveGeographyByCode,
} from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { isResearchCopilotEnabled, isScenarioLabEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Suburb Research Preview | Propellect", robots: { index: false, follow: false } };

export default async function SuburbResearchPage({
  params,
}: {
  params: Promise<{ geographyCode: string }>;
}) {
  const { geographyCode } = await params;
  const geo = await resolveGeographyByCode("SAL", geographyCode);
  if (!geo) notFound();

  const [snapshot, demographics, timeseries, assumptions, officialMetrics] = await Promise.all([
    getEnrichedMarketSnapshot(geo.geography_id, "SAL"),
    getSuburbDemographics(geo.geography_id),
    getTimeseriesV2(geo.geography_id),
    getMetricAssumptions(),
    getOfficialSuburbMetricsV1(geo.geography_id),
  ]);

  return (
    <MarketSnapshotView
      geographyId={geo.geography_id}
      geographyCode={geo.geography_code}
      geographyLabel={`${geo.geography_name}${stateLabel(geo.state_code) ? `, ${stateLabel(geo.state_code)}` : ""}`}
      geographyType="suburb"
      snapshot={snapshot}
      demographics={demographics}
      timeseries={timeseries}
      assumptions={assumptions}
      officialMetrics={officialMetrics}
      scenarioLabEnabled={isScenarioLabEnabled()}
      researchCopilotEnabled={isResearchCopilotEnabled()}
    />
  );
}
