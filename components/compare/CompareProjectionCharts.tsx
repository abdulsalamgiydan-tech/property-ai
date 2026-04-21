"use client";

import {
  type CashflowProjectionPoint,
  formatChartAud,
  formatChartYear,
  type PropertyValueMortgagePoint,
} from "@/lib/projections";
import { formatNumberGb } from "@/lib/formatCurrency";
import type { CSSProperties } from "react";
import {
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartMargin = { top: 8, right: 12, left: 4, bottom: 32 };
const legendProps = {
  wrapperStyle: { paddingTop: 10, color: "#e4e4e7", fontSize: 12 },
  iconType: "line" as const,
  verticalAlign: "bottom" as const,
};

const chartTooltipContentStyle: CSSProperties = {
  background: "#09090b",
  border: "1px solid #3f3f46",
  color: "#f4f4f5",
  borderRadius: 8,
  fontSize: 12,
};
const chartTooltipLabelStyle: CSSProperties = { color: "#a1a1aa", marginBottom: 4 };
const chartTooltipItemStyle: CSSProperties = { color: "#f4f4f5" };

export type ChartCompareTab = "overlay" | "propertyA" | "propertyB";

export type CompareProjectionBundle = {
  valueA: PropertyValueMortgagePoint[];
  valueB: PropertyValueMortgagePoint[];
  cashA: CashflowProjectionPoint[];
  cashB: CashflowProjectionPoint[];
  valueOverlay: Array<{
    year: number;
    propertyValueA: number;
    mortgageBalanceA: number;
    propertyValueB: number;
    mortgageBalanceB: number;
  }>;
  cashflowOverlay: Array<{
    year: number;
    afterTaxCashflowA: number;
    afterTaxCashflowB: number;
  }>;
};

type CompareProjectionChartsProps = {
  bundle: CompareProjectionBundle;
  valueChartTab: ChartCompareTab;
  onValueChartTab: (v: ChartCompareTab) => void;
  cashflowChartTab: ChartCompareTab;
  onCashflowChartTab: (v: ChartCompareTab) => void;
};

function chartTabButtons(
  value: ChartCompareTab,
  onChange: (v: ChartCompareTab) => void,
  id: string
) {
  const opts = [
    { id: "overlay" as const, label: "Overlay" },
    { id: "propertyA" as const, label: "Property A" },
    { id: "propertyB" as const, label: "Property B" },
  ];
  return (
    <div
      className="flex flex-wrap gap-1 rounded-lg border border-zinc-600/60 bg-zinc-800/60 p-0.5"
      role="tablist"
      aria-label={id}
    >
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
            value === o.id ? "bg-violet-600 text-white" : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function CompareProjectionCharts({
  bundle,
  valueChartTab,
  onValueChartTab,
  cashflowChartTab,
  onCashflowChartTab,
}: CompareProjectionChartsProps) {
  return (
    <>
      <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Property value vs mortgage balance
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              Nominal dollars over 30 years from each property&apos;s growth and repayment assumptions.
            </p>
          </div>
          {chartTabButtons(valueChartTab, onValueChartTab, "Value chart view")}
        </div>
        <div className="mt-4 h-[17rem] w-full sm:h-[20rem]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {valueChartTab === "overlay" ? (
              <LineChart data={bundle.valueOverlay} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{ value: "AUD", angle: -90, position: "insideLeft", fill: "#a1a1aa" }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="propertyValueA"
                  stroke="#c4b5fd"
                  strokeWidth={2.4}
                  dot={false}
                  name="Property A — value"
                />
                <Line
                  type="monotone"
                  dataKey="mortgageBalanceA"
                  stroke="#fb7185"
                  strokeWidth={2}
                  dot={false}
                  name="Property A — mortgage"
                />
                <Line
                  type="monotone"
                  dataKey="propertyValueB"
                  stroke="#22d3ee"
                  strokeWidth={2.4}
                  strokeDasharray="6 4"
                  dot={false}
                  name="Property B — value"
                />
                <Line
                  type="monotone"
                  dataKey="mortgageBalanceB"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                  name="Property B — mortgage"
                />
              </LineChart>
            ) : valueChartTab === "propertyA" ? (
              <LineChart data={bundle.valueA} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{ value: "AUD", angle: -90, position: "insideLeft", fill: "#a1a1aa" }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="propertyValue"
                  stroke="#c4b5fd"
                  strokeWidth={2.8}
                  dot={false}
                  name="Property value"
                />
                <Line
                  type="monotone"
                  dataKey="mortgageBalance"
                  stroke="#fb7185"
                  strokeWidth={2.4}
                  dot={false}
                  name="Mortgage balance"
                />
              </LineChart>
            ) : (
              <LineChart data={bundle.valueB} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{ value: "AUD", angle: -90, position: "insideLeft", fill: "#a1a1aa" }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="propertyValue"
                  stroke="#22d3ee"
                  strokeWidth={2.8}
                  dot={false}
                  name="Property value"
                />
                <Line
                  type="monotone"
                  dataKey="mortgageBalance"
                  stroke="#fbbf24"
                  strokeWidth={2.4}
                  dot={false}
                  name="Mortgage balance"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-600/50 bg-zinc-950/40 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              After-tax cashflow over time
            </h2>
            <p className="mt-1 text-[10px] leading-relaxed text-zinc-600">
              Modelled annual after-tax cashflow by year (same basis as Analyse a Property projections).
            </p>
          </div>
          {chartTabButtons(cashflowChartTab, onCashflowChartTab, "Cashflow chart view")}
        </div>
        <div className="mt-4 h-[17rem] w-full sm:h-[20rem]">
          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            {cashflowChartTab === "overlay" ? (
              <LineChart data={bundle.cashflowOverlay} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{
                    value: "AUD / year",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#a1a1aa",
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="afterTaxCashflowA"
                  stroke="#818cf8"
                  strokeWidth={2.6}
                  dot={false}
                  name="Property A — after-tax"
                />
                <Line
                  type="monotone"
                  dataKey="afterTaxCashflowB"
                  stroke="#34d399"
                  strokeWidth={2.6}
                  strokeDasharray="7 5"
                  dot={false}
                  name="Property B — after-tax"
                />
              </LineChart>
            ) : cashflowChartTab === "propertyA" ? (
              <LineChart data={bundle.cashA} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{
                    value: "AUD / year",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#a1a1aa",
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="preTaxCashflow"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                  name="Pre-tax cashflow"
                />
                <Line
                  type="monotone"
                  dataKey="afterTaxCashflow"
                  stroke="#818cf8"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                  dot={false}
                  name="After-tax cashflow"
                />
              </LineChart>
            ) : (
              <LineChart data={bundle.cashB} margin={chartMargin}>
                <XAxis
                  dataKey="year"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatNumberGb(Number(v))}
                  label={{ value: "Year", fill: "#a1a1aa", position: "insideBottom", offset: -4 }}
                />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v) => formatChartAud(Number(v))}
                  width={88}
                  label={{
                    value: "AUD / year",
                    angle: -90,
                    position: "insideLeft",
                    fill: "#a1a1aa",
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [formatChartAud(Number(value)), name]}
                  labelFormatter={(label) => formatChartYear(Number(label))}
                  contentStyle={chartTooltipContentStyle}
                  labelStyle={chartTooltipLabelStyle}
                  itemStyle={chartTooltipItemStyle}
                />
                <Legend {...legendProps} />
                <Line
                  type="monotone"
                  dataKey="preTaxCashflow"
                  stroke="#fbbf24"
                  strokeWidth={2.5}
                  dot={false}
                  name="Pre-tax cashflow"
                />
                <Line
                  type="monotone"
                  dataKey="afterTaxCashflow"
                  stroke="#34d399"
                  strokeWidth={2.5}
                  strokeDasharray="7 5"
                  dot={false}
                  name="After-tax cashflow"
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
          Annual figures per year, not cumulative. Nominal — not adjusted for inflation.
        </p>
      </section>
    </>
  );
}
