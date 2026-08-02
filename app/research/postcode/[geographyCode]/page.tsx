import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketSnapshotView } from "@/components/research/MarketSnapshotView";
import {
  getEnrichedMarketSnapshot,
  getMetricAssumptions,
  getPostcodeDemographics,
  getTimeseriesV2,
  resolveGeographyByCode,
} from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";

export const metadata: Metadata = { title: "Postcode Research Preview | Propellect", robots: { index: false, follow: false } };

export default async function PostcodeResearchPage({
  params,
}: {
  params: Promise<{ geographyCode: string }>;
}) {
  const { geographyCode } = await params;
  const geo = await resolveGeographyByCode("POA", geographyCode);
  if (!geo) notFound();

  const [snapshot, demographics, timeseries, assumptions] = await Promise.all([
    getEnrichedMarketSnapshot(geo.geography_id, "POA"),
    getPostcodeDemographics(geo.geography_id),
    getTimeseriesV2(geo.geography_id),
    getMetricAssumptions(),
  ]);

  return (
    <MarketSnapshotView
      geographyId={geo.geography_id}
      geographyCode={geo.geography_code}
      geographyLabel={`Postcode ${geo.geography_code}${stateLabel(geo.state_code) ? `, ${stateLabel(geo.state_code)}` : ""}`}
      geographyType="postcode"
      snapshot={snapshot}
      demographics={demographics}
      timeseries={timeseries}
      assumptions={assumptions}
    />
  );
}
