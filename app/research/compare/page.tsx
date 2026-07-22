import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SectionCard } from "@/components/design/SectionCard";
import { EmptyState } from "@/components/design/EmptyState";
import { StateBadge } from "@/components/research/StateBadge";
import { CompareTable } from "@/components/research/CompareTable";
import { ExportButtons, type ExportColumnDef, type ExportRow } from "@/components/research/ExportButtons";
import { compareMarketGeographies, type CompareRow } from "@/lib/warehouse/queries";
import { isMultiStateResearchEnabled } from "@/lib/warehouse/env";
import { sortByIdOrder } from "@/lib/research/compareOrder";

export const metadata: Metadata = {
  title: "Compare Suburbs & Postcodes (Research Preview) | Propellect",
  robots: { index: false, follow: false },
};

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  if (!isMultiStateResearchEnabled()) notFound();

  const { ids } = await searchParams;
  const geographyIds = (ids ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  if (geographyIds.length < 2) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Compare</h1>
          <p className="mt-1 text-sm text-zinc-400">Select 2-10 geographies from Explore to compare them side by side.</p>
        </div>
        <EmptyState title="Nothing to compare yet" body="Go to Explore, select 2-10 suburbs or postcodes, then click 'compare now'." />
      </div>
    );
  }
  if (geographyIds.length > 10) {
    return (
      <div className="space-y-6">
        <EmptyState title="Too many selected" body="Comparison supports 2-10 geographies at a time. Go back to Explore and select fewer." />
      </div>
    );
  }

  const rawRows = await compareMarketGeographies(geographyIds);

  if (rawRows.length === 0) {
    return <EmptyState title="No comparison data" body="None of the selected geographies had market data to compare." />;
  }

  // The RPC's own row order isn't a contract — sort to match the ?ids=
  // order so reordering (Workstream 7) has a stable, shareable source of
  // truth, and so removing/re-adding a geography via Explore behaves
  // predictably.
  const rows = sortByIdOrder(rawRows, geographyIds);
  const orderedIds = rows.map((r) => r.geography_id);

  // One export row per geography (long format), all raw values — not a
  // transpose of the on-screen table, which is easier to reopen in a
  // spreadsheet or feed into another tool than a metric-per-row layout.
  const exportColumns: ExportColumnDef[] = [
    { key: "geography_name", label: "Geography" },
    { key: "jurisdiction", label: "Jurisdiction" },
    { key: "geography_type", label: "Type" },
    { key: "median_sale_price_12m", label: "Median sale price (12m, AUD)" },
    { key: "annual_price_change_pct", label: "Annual price change (%)" },
    { key: "sales_sample_confidence", label: "Sales confidence" },
    { key: "median_weekly_rent_latest", label: "Median weekly rent (AUD)" },
    { key: "annual_rent_change_pct", label: "Annual rent change (%)" },
    { key: "rent_confidence", label: "Rent confidence" },
    { key: "gross_yield_pct", label: "Gross yield (%)" },
    { key: "yield_confidence", label: "Yield confidence" },
    { key: "dwelling_stock_total", label: "Dwelling stock" },
    { key: "approvals_per_1000_dwellings", label: "Approvals per 1,000 dwellings" },
    { key: "total_population", label: "Population" },
    { key: "median_weekly_household_income", label: "Median weekly household income (AUD)" },
    { key: "price_to_income_ratio", label: "Price-to-income ratio (years)" },
    { key: "est_monthly_repayment_owner_occupier", label: "Est. monthly repayment, owner-occupier (AUD)" },
    { key: "latest_sales_period", label: "Sales period" },
    { key: "latest_rent_period", label: "Rent period" },
  ];
  const exportRows: ExportRow[] = rows.map((r: CompareRow) => ({
    geography_name: r.geography_name,
    jurisdiction: r.jurisdiction,
    geography_type: r.geography_type,
    median_sale_price_12m: r.median_sale_price_12m,
    annual_price_change_pct: r.annual_price_change_pct,
    sales_sample_confidence: r.sales_sample_confidence,
    median_weekly_rent_latest: r.median_weekly_rent_latest,
    annual_rent_change_pct: r.annual_rent_change_pct,
    rent_confidence: r.rent_confidence,
    gross_yield_pct: r.gross_yield_pct,
    yield_confidence: r.yield_confidence,
    dwelling_stock_total: r.dwelling_stock_total,
    approvals_per_1000_dwellings: r.approvals_per_1000_dwellings,
    total_population: r.total_population,
    median_weekly_household_income: r.median_weekly_household_income,
    price_to_income_ratio: r.price_to_income_ratio,
    est_monthly_repayment_owner_occupier: r.est_monthly_repayment_owner_occupier,
    latest_sales_period: r.latest_sales_period,
    latest_rent_period: r.latest_rent_period,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Compare</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Side-by-side descriptive comparison — not a ranking or recommendation. Confidence
            and missing-data reasons are shown per metric; periods may not align exactly
            across geographies or states.
          </p>
        </div>
        <ExportButtons
          rows={exportRows}
          columns={exportColumns}
          filenameBase="propellect-compare"
          provenanceNote={`Propellect research comparison — ${rows.length} geographies. Descriptive data only, not financial/tax/legal advice, not an investment recommendation, not a forecast.`}
        />
      </div>

      <SectionCard>
        <CompareTable rows={rows} orderedIds={orderedIds} />
      </SectionCard>

      <SectionCard title="Missing data" description="Reasons a metric is unavailable for a specific geography">
        <div className="grid gap-3 sm:grid-cols-2">
          {rows
            .filter((r) => r.missing_metric_reasons && Object.keys(r.missing_metric_reasons).length > 0)
            .map((r) => (
              <div key={r.geography_id}>
                <p className="text-xs font-medium text-zinc-300">
                  {r.geography_name} <StateBadge jurisdiction={r.jurisdiction} />
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-zinc-500">
                  {Object.entries(r.missing_metric_reasons ?? {}).map(([k, v]) => (
                    <li key={k}>
                      <span className="text-zinc-400">{k}:</span> {v}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </SectionCard>
    </div>
  );
}
