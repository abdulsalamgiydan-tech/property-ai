import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { ScenarioLabClientV2 } from "@/components/research/ScenarioLabClientV2";
import { getMarketSnapshotV2, resolveGeographyByCode } from "@/lib/warehouse/queries";
import { stateLabel } from "@/lib/warehouse/stateCode";
import { isScenarioLabEnabled, isWarehousePreviewEnabled } from "@/lib/warehouse/env";

export const metadata: Metadata = { title: "Scenario Lab | Propellect", robots: { index: false, follow: false } };

// Sprint 12 WS7 — National Property Scenario Lab. Descriptive affordability
// "what if" modelling against a real recorded median sale price. Never a
// price forecast, recommendation, score or ranking (see this project's
// standing hard rule against exactly those things).
export default async function ScenarioLabPage({ params }: { params: Promise<{ geographyCode: string }> }) {
  if (!isWarehousePreviewEnabled() || !isScenarioLabEnabled()) notFound();

  const { geographyCode } = await params;
  const geo = await resolveGeographyByCode("SAL", geographyCode);
  if (!geo) notFound();

  const snapshot = await getMarketSnapshotV2(geo.geography_id);
  const geographyLabel = `${geo.geography_name}${stateLabel(geo.state_code) ? `, ${stateLabel(geo.state_code)}` : ""}`;

  if (!snapshot?.median_sale_price_12m) {
    return (
      <EmptyState
        title="No sale price data available"
        body={`Scenario Lab needs a recorded median sale price to model against, and none is available for ${geographyLabel} yet.`}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Scenario Lab — {geographyLabel}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Compare base, conservative and stress-case scenarios — deposit, loan term, interest rate,
          vacancy and expenses — against this suburb&apos;s real recorded median sale price.
        </p>
      </div>
      <SectionCard>
        <ScenarioLabClientV2
          geographyId={geo.geography_id}
          geographyCode={geographyCode}
          geographyLabel={geographyLabel}
          medianSalePrice={snapshot.median_sale_price_12m}
          medianWeeklyRentLatest={snapshot.median_weekly_rent_latest}
          medianWeeklyHouseholdIncome={snapshot.median_weekly_household_income}
          baselineRatePercent={snapshot.rba_rate_used}
          baselineRatePeriod={snapshot.rba_rate_period}
        />
      </SectionCard>
    </div>
  );
}
