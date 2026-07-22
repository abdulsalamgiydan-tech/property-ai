import React from "react";
import Link from "next/link";
import { SectionCard } from "@/components/design/SectionCard";
import { MetricCard } from "@/components/design/MetricCard";
import { EmptyState } from "@/components/design/EmptyState";
import { ConfidenceBadge } from "@/components/research/ConfidenceBadge";
import { AboutThisMetric } from "@/components/research/AboutThisMetric";
import { formatPercent } from "@/lib/formatCurrency";
import {
  formatMoneyOrUnavailable as money,
  formatPercentOrUnavailable as pct,
  formatCountOrUnavailable as num,
  formatPeriodOrUnavailable as periodLabel,
} from "@/lib/warehouse/formatMetric";
import type { DemographicProfile, MarketSnapshot, MetricAssumption, TimeseriesRow } from "@/lib/warehouse/queries";

export function MarketSnapshotView({
  geographyId,
  geographyCode,
  geographyLabel,
  geographyType,
  snapshot,
  demographics,
  timeseries,
  assumptions,
  scenarioLabEnabled = false,
}: {
  geographyId: string;
  geographyCode?: string;
  geographyLabel: string;
  geographyType: "suburb" | "postcode";
  snapshot: MarketSnapshot | null;
  demographics: DemographicProfile | null;
  timeseries: TimeseriesRow[];
  assumptions: MetricAssumption[];
  scenarioLabEnabled?: boolean;
}) {
  if (!snapshot && !demographics) {
    return (
      <EmptyState
        title="No data available"
        body={`No market intelligence data has been loaded for ${geographyLabel} yet. This can happen for very small or non-residential localities with no recorded NSW sales, rent, or Census activity.`}
      />
    );
  }

  const assumptionMap = Object.fromEntries(assumptions.map((a) => [a.assumption_name, a]));
  const salesSeries = timeseries.filter((t) => t.metric_family === "sales").sort((a, b) => a.reference_period.localeCompare(b.reference_period));
  const rentSeries = timeseries.filter((t) => t.metric_family === "rent").sort((a, b) => a.reference_period.localeCompare(b.reference_period));
  const yieldSeries = timeseries.filter((t) => t.metric_family === "yield").sort((a, b) => a.reference_period.localeCompare(b.reference_period));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">{geographyLabel}</h1>
          <p className="mt-1 text-xs text-zinc-500">
            {geographyType === "suburb" ? "Suburb" : "Postcode"} research snapshot ·
            generated {snapshot?.snapshot_generated_at ? new Date(snapshot.snapshot_generated_at).toLocaleDateString("en-AU") : "n/a"}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <a
            href={`/api/v1/export/${encodeURIComponent(geographyId)}?format=csv`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Export CSV
          </a>
          <a
            href={`/api/v1/export/${encodeURIComponent(geographyId)}?format=json`}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
          >
            Export JSON
          </a>
        </div>
      </div>

      {/* 1. Market overview */}
      <SectionCard title="Market overview" description={`Data period: ${periodLabel(snapshot?.latest_sales_period)}`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <MetricCard label="Median sale price" value={money(snapshot?.median_sale_price_12m)} subtext={<ConfidenceBadge level={snapshot?.sales_sample_confidence} />} />
            <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="sales" />
          </div>
          <div>
            <MetricCard label="Median weekly rent" value={money(snapshot?.median_weekly_rent_latest)} subtext={<ConfidenceBadge level={snapshot?.rent_confidence} />} />
            <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="rent" />
          </div>
          <div>
            <MetricCard label="Gross yield" value={pct(snapshot?.gross_yield_pct)} subtext={<ConfidenceBadge level={snapshot?.yield_confidence} />} />
            <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="yield" />
          </div>
          <MetricCard label="Sales volume (12m)" value={num(snapshot?.sales_volume_12m)} subtext={<ConfidenceBadge level={snapshot?.sales_sample_confidence} />} />
        </div>
      </SectionCard>

      {/* 2. Affordability context */}
      <SectionCard
        title="Affordability context"
        description="Illustrative modelling only — excludes stamp duty, LMI and loan fees. Not a recommendation."
      >
        {snapshot?.est_monthly_repayment_owner_occupier == null ? (
          <p className="text-sm text-zinc-500">Unavailable — requires median sale price, household income and RBA rate all present.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Price-to-income ratio" value={snapshot.price_to_income_ratio?.toFixed(1) ?? "Unavailable"} />
              <MetricCard label="Est. monthly repayment (owner-occupier)" value={money(snapshot.est_monthly_repayment_owner_occupier)} />
              <MetricCard label="Est. monthly repayment (investor)" value={money(snapshot.est_monthly_repayment_investor)} />
              <div>
                <MetricCard label="Repayment-to-income" value={pct(snapshot.repayment_to_income_pct)} subtext={<ConfidenceBadge level={snapshot.affordability_confidence} />} />
                <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="affordability" />
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-zinc-500">
              Assumptions ({snapshot.assumption_scenario_code}):{" "}
              {assumptionMap.deposit_percent?.numeric_value ?? 20}% deposit,{" "}
              {assumptionMap.loan_term_years?.numeric_value ?? 30}-year principal &amp; interest loan,
              RBA housing lending rate {snapshot.rba_rate_used != null ? formatPercent(snapshot.rba_rate_used, 2) : "unavailable"}
              {snapshot.rba_rate_period ? ` (as at ${snapshot.rba_rate_period})` : ""}. LMI, stamp duty and fees excluded.
            </p>
            {scenarioLabEnabled && geographyType === "suburb" && geographyCode ? (
              <Link href={`/research/scenario/${geographyCode}`} className="mt-3 inline-block text-xs text-violet-300 hover:underline">
                Try different deposit/term/rate assumptions in Scenario Lab →
              </Link>
            ) : null}
          </>
        )}
      </SectionCard>

      {/* 3. Sales trend */}
      <SectionCard title="Sales trend" description="Trailing 12 months, detached houses and apartments/units">
        {salesSeries.length === 0 ? (
          <p className="text-sm text-zinc-500">No monthly sales trend data available for this geography.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="py-1 pr-4">Month</th>
                  <th className="py-1 pr-4">Type</th>
                  <th className="py-1 pr-4">Transactions</th>
                  <th className="py-1 pr-4">Median price</th>
                  <th className="py-1">Confidence</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {salesSeries.map((row, i) => (
                  <tr key={i} className="border-t border-zinc-800/60">
                    <td className="py-1.5 pr-4">{row.reference_period}</td>
                    <td className="py-1.5 pr-4">{row.dwelling_type}</td>
                    <td className="py-1.5 pr-4">{num(row.transaction_count)}</td>
                    <td className="py-1.5 pr-4">{money(row.median_sale_price)}</td>
                    <td className="py-1.5"><ConfidenceBadge level={row.confidence_label} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 4. Rent and yield */}
      <SectionCard title="Rent and yield trend" description="Latest available quarters">
        {rentSeries.length === 0 && yieldSeries.length === 0 ? (
          <p className="text-sm text-zinc-500">No quarterly rent/yield trend data available for this geography.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Median weekly rent</h3>
              <ul className="space-y-1 text-xs text-zinc-300">
                {rentSeries.map((row, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-zinc-800/50 py-1">
                    <span>{row.reference_period}</span>
                    <span>{money(row.median_weekly_rent)}</span>
                    <ConfidenceBadge level={row.confidence_label} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">Gross yield</h3>
              <ul className="space-y-1 text-xs text-zinc-300">
                {yieldSeries.map((row, i) => (
                  <li key={i} className="flex items-center justify-between border-b border-zinc-800/50 py-1">
                    <span>{row.reference_period}</span>
                    <span>{row.gross_yield_percentage != null ? formatPercent(row.gross_yield_percentage, 2) : "Unavailable"}</span>
                    <ConfidenceBadge level={row.confidence_label} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
        {geographyType === "suburb" ? (
          <p className="mt-3 text-[11px] text-zinc-600">
            Suburb-level rent is derived from postcode-level source data via a
            geography correspondence weighting — see the Data confidence
            section below.
          </p>
        ) : null}
      </SectionCard>

      {/* 5. Housing supply */}
      <SectionCard title="Housing supply">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <MetricCard label="Dwelling stock" value={num(snapshot?.dwelling_stock_total)} />
            <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="dwelling_stock" />
          </div>
          <div>
            <MetricCard label="Approvals (12m)" value={num(snapshot?.approvals_12m)} subtext={<ConfidenceBadge level={snapshot?.supply_confidence} />} />
            <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="approvals" />
          </div>
          <MetricCard label="Approvals per 1,000 dwellings" value={snapshot?.approvals_per_1000_dwellings?.toFixed(1) ?? "Unavailable"} />
          <MetricCard label="Sales turnover" value={pct(snapshot?.sales_turnover_pct)} subtext="rolling-12m sales / dwelling stock" />
        </div>
      </SectionCard>

      {/* 6. Demographics */}
      <SectionCard title="Demographics" description={demographics ? `2021 Census (${demographics.geography_method})` : undefined}>
        {!demographics ? (
          <p className="text-sm text-zinc-500">No Census demographic match for this geography.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <MetricCard label="Population" value={num(demographics.total_population)} />
              <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="demographics" />
            </div>
            <MetricCard label="Median age" value={demographics.median_age?.toString() ?? "Unavailable"} />
            <MetricCard label="Households" value={num(demographics.total_households)} />
            <MetricCard label="Avg. household size" value={demographics.average_household_size?.toFixed(1) ?? "Unavailable"} />
            <MetricCard label="Median household income (weekly)" value={money(demographics.median_weekly_household_income)} />
            <div>
              <MetricCard label="Population growth (2016→2021)" value={pct(snapshot?.population_growth_2016_2021_pct)} subtext="via ABS boundary correspondence" />
              {snapshot?.population_growth_2016_2021_pct != null && (
                <AboutThisMetric geographyId={geographyId} geographyType={geographyType} metricFamily="population_growth" />
              )}
            </div>
            <MetricCard label="Renter households" value={pct(demographics.renter_household_pct)} />
            <MetricCard label="Owner (with mortgage)" value={pct(demographics.owner_with_mortgage_pct)} />
            <MetricCard label="Owner (outright)" value={pct(demographics.owner_outright_pct)} />
            <MetricCard label="Detached houses" value={pct(demographics.detached_house_pct)} />
            <MetricCard label="Apartments/units" value={pct(demographics.apartment_unit_pct)} />
          </div>
        )}
        {snapshot?.population_growth_2016_2021_pct != null ? (
          <p className="mt-3 text-[11px] text-zinc-600">
            Population growth 2016→2021 is reconciled across the ABS 2016/2021
            boundary change via a population-weighted geographic correspondence
            (national accuracy 99.80%, within a documented ±0.5% tolerance) —
            it is a derived estimate, not a direct Census figure.
          </p>
        ) : (
          <p className="mt-3 text-[11px] text-zinc-600">
            Population growth 2016→2021 is unavailable for this specific
            geography — its 2016 boundary equivalent could not be reconciled
            with sufficient confidence.
          </p>
        )}
      </SectionCard>

      {/* 7. Data confidence */}
      <SectionCard title="Data confidence" description="What's direct vs derived, and what's missing">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-zinc-500">Overall coverage</p>
            <p className="mt-1 text-sm text-zinc-200">{snapshot?.coverage_status ?? "insufficient"}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Geography method</p>
            <p className="mt-1 text-sm text-zinc-200">{snapshot?.direct_or_derived ?? "n/a"}</p>
          </div>
        </div>
        {snapshot?.missing_metric_reasons && Object.keys(snapshot.missing_metric_reasons).length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Known limitations</p>
            <ul className="mt-2 space-y-1 text-xs text-zinc-400">
              {Object.entries(snapshot.missing_metric_reasons).map(([k, v]) => (
                <li key={k}>
                  <span className="text-zinc-300">{k}:</span> {v}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ul className="mt-4 space-y-1 text-xs text-zinc-500">
          <li>Sales/rent/yield source periods: sales {periodLabel(snapshot?.latest_sales_period)}, rent {periodLabel(snapshot?.latest_rent_period)}, yield {periodLabel(snapshot?.latest_yield_period)}.</li>
          <li>Demographics: 2021 Census (direct — no boundary correspondence needed at this geography level).</li>
          <li>Every displayed metric carries its own confidence label — treat &ldquo;insufficient&rdquo; or missing values as genuinely unavailable, not zero.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
