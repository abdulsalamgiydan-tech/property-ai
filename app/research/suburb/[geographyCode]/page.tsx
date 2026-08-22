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
import { resolveSuburbMetricProvenance } from "@/lib/warehouse/suburbMetricProvenance";
import type { SourceRegistryEntry } from "@/lib/warehouse/metricProvenance";
import sourceRegistry from "@/warehouse/config/v3_source_registry.json";

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

  const metricProvenance = resolveSuburbMetricProvenance(
    {
      state_code: geo.state_code,
      median_sale_price_12m: snapshot?.median_sale_price_12m ?? null,
      annual_price_change_pct: snapshot?.annual_price_change_pct ?? null,
      median_weekly_rent_latest: snapshot?.median_weekly_rent_latest ?? null,
      gross_yield_pct: snapshot?.gross_yield_pct ?? null,
      latest_sales_period: snapshot?.latest_sales_period ?? null,
      latest_rent_period: snapshot?.latest_rent_period ?? null,
      latest_yield_period: snapshot?.latest_yield_period ?? null,
    },
    sourceRegistry as unknown as SourceRegistryEntry[],
    new Date(),
  );

  return (
    <MarketSnapshotView
      geographyId={geo.geography_id}
      metricProvenance={metricProvenance}
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
