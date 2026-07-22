"use client";

import { useRouter } from "next/navigation";
import { StateBadge } from "@/components/research/StateBadge";
import { ConfidenceBadge } from "@/components/research/ConfidenceBadge";
import { moveGeographyId } from "@/lib/research/compareOrder";
import {
  formatMoneyOrUnavailable as money,
  formatPercentOrUnavailable as pct,
  formatCountOrUnavailable as num,
} from "@/lib/warehouse/formatMetric";
import type { CompareRow } from "@/lib/warehouse/queries";

const METRIC_ROWS: { label: string; render: (r: CompareRow) => React.ReactNode }[] = [
  { label: "Median sale price (latest)", render: (r) => money(r.median_sale_price_12m) },
  { label: "Annual price change", render: (r) => pct(r.annual_price_change_pct) },
  { label: "Sales confidence", render: (r) => <ConfidenceBadge level={r.sales_sample_confidence} /> },
  { label: "Median weekly rent", render: (r) => money(r.median_weekly_rent_latest) },
  { label: "Annual rent change", render: (r) => pct(r.annual_rent_change_pct) },
  { label: "Rent confidence", render: (r) => <ConfidenceBadge level={r.rent_confidence} /> },
  { label: "Gross yield", render: (r) => pct(r.gross_yield_pct, 2) },
  { label: "Yield confidence", render: (r) => <ConfidenceBadge level={r.yield_confidence} /> },
  { label: "Dwelling stock", render: (r) => num(r.dwelling_stock_total) },
  { label: "Approvals per 1,000 dwellings", render: (r) => (r.approvals_per_1000_dwellings != null ? r.approvals_per_1000_dwellings.toFixed(1) : "Unavailable") },
  { label: "Population", render: (r) => num(r.total_population) },
  { label: "Median weekly household income", render: (r) => money(r.median_weekly_household_income) },
  { label: "Price-to-income ratio", render: (r) => (r.price_to_income_ratio != null ? `${r.price_to_income_ratio.toFixed(1)}x` : "Unavailable") },
  { label: "Est. monthly repayment (owner-occupier)", render: (r) => money(r.est_monthly_repayment_owner_occupier) },
  { label: "Sales period", render: (r) => r.latest_sales_period ?? "n/a" },
  { label: "Rent period", render: (r) => r.latest_rent_period ?? "n/a" },
];

/**
 * Sprint 13 WS7 — the comparison table as a client component so columns
 * can be reordered in place. Order is round-tripped through the URL's
 * ?ids= param (router.replace, shallow) so a reordered comparison stays
 * shareable, matching the existing convention that ?ids= is the source of
 * truth for which geographies are being compared.
 */
export function CompareTable({ rows, orderedIds }: { rows: CompareRow[]; orderedIds: string[] }) {
  const router = useRouter();

  function reorder(index: number, direction: -1 | 1) {
    const next = moveGeographyId(orderedIds, index, direction);
    router.replace(`/research/compare?ids=${next.join(",")}`, { scroll: false });
  }

  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full text-left text-sm print:table-fixed">
        <thead>
          <tr className="border-b border-zinc-800">
            <th className="py-2 pr-4 text-xs font-medium uppercase tracking-wide text-zinc-500">Metric</th>
            {rows.map((r, i) => (
              <th key={r.geography_id} className="py-2 pr-4 align-top">
                <div className="mb-1 flex items-center gap-1 print:hidden">
                  <button
                    type="button"
                    onClick={() => reorder(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${r.geography_name} left`}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => reorder(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${r.geography_name} right`}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <div className="text-zinc-100">{r.geography_name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <StateBadge jurisdiction={r.jurisdiction} />
                  <span className="text-[11px] text-zinc-500">{r.geography_type === "SAL" ? "Suburb" : "Postcode"}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-zinc-300">
          {METRIC_ROWS.map((metric) => (
            <tr key={metric.label} className="border-t border-zinc-800/60">
              <td className="py-2 pr-4 text-xs text-zinc-500">{metric.label}</td>
              {rows.map((r) => (
                <td key={r.geography_id} className="py-2 pr-4">
                  {metric.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
