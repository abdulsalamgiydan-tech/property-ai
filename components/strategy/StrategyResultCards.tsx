"use client";

import type { StrategyOutput } from "@/lib/strategy/strategyOutput";
import { formatAud } from "@/lib/formatCurrency";
import ReactMarkdown from "react-markdown";
import { strategyMarkdownComponents } from "@/components/strategy/StrategyMarkdown";

function FitBadge({ level }: { level: StrategyOutput["fit_confidence"] }) {
  const styles = {
    high: "border-emerald-500/40 bg-emerald-950/30 text-emerald-200",
    medium: "border-amber-500/40 bg-amber-950/30 text-amber-100",
    low: "border-zinc-600 bg-zinc-950/50 text-zinc-300",
  } as const;
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[level]}`}
    >
      {level} fit
    </span>
  );
}

export function StrategyResultCards({ output }: { output: StrategyOutput }) {
  const km = output.key_metrics;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-violet-500/35 bg-gradient-to-br from-violet-950/40 to-zinc-900/80 p-6 shadow-lg shadow-violet-950/20">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">
              Your archetype
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">{output.archetype_display_name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-zinc-300">{output.archetype_one_liner}</p>
          </div>
          <FitBadge level={output.fit_confidence} />
        </div>
        <p className="mt-4 text-sm leading-relaxed text-zinc-400">{output.fit_reasoning}</p>
        <p className="mt-4 text-sm leading-relaxed text-zinc-300">{output.strategy_summary}</p>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Key metrics</h3>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Target properties</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">{km.target_property_count}</p>
          </div>
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Purchase band</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {formatAud(km.target_purchase_price_band.min)} – {formatAud(km.target_purchase_price_band.max)}
            </p>
          </div>
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Min gross yield</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {km.target_gross_yield_min_percent.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Min growth (model)</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {km.target_growth_min_percent.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Max LVR</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {km.target_lvr_max_percent.toFixed(0)}%
            </p>
          </div>
          <div className="rounded-xl border border-zinc-700/50 bg-zinc-950/40 px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">First purchase window</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {km.expected_first_purchase_window_months.min}–{km.expected_first_purchase_window_months.max} mo
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Timeline</h3>
        <ul className="mt-4 space-y-3">
          {output.timeline.map((t, i) => (
            <li
              key={`${t.year}-${i}`}
              className="flex gap-4 rounded-xl border border-zinc-700/40 bg-zinc-950/35 px-4 py-3 text-sm"
            >
              <span className="shrink-0 font-semibold tabular-nums text-violet-300">Y{t.year}</span>
              <span className="text-zinc-300">{t.milestone}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Property profile</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-zinc-500">Type</dt>
            <dd className="mt-0.5 text-zinc-200">{output.property_profile.type}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Location profile</dt>
            <dd className="mt-0.5 text-zinc-200">{output.property_profile.location_profile}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Yield target</dt>
            <dd className="mt-0.5 text-zinc-200">
              {output.property_profile.yield_target_percent.toFixed(1)}% gross (indicative)
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Growth indicators</dt>
            <dd className="mt-0.5">
              <ul className="list-disc space-y-1 pl-5 text-zinc-300 marker:text-zinc-600">
                {output.property_profile.growth_indicators.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </dd>
          </div>
          <div>
            <dt className="text-zinc-500">Avoid</dt>
            <dd className="mt-0.5">
              <ul className="list-disc space-y-1 pl-5 text-zinc-300 marker:text-zinc-600">
                {output.property_profile.avoid_list.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Financing approach</h3>
        <div className="mt-3 text-sm leading-relaxed text-zinc-300 [&_p:first-child]:mt-0">
          <ReactMarkdown components={strategyMarkdownComponents}>{output.financing_approach}</ReactMarkdown>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Risks and mitigations</h3>
        <ul className="mt-4 space-y-4">
          {output.risks_and_mitigations.map((row, i) => (
            <li key={i} className="rounded-xl border border-zinc-700/40 bg-zinc-950/35 px-4 py-3">
              <p className="text-sm font-medium text-zinc-200">{row.risk}</p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{row.mitigation}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-5 sm:p-6">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Next steps</h3>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-500">
          {output.next_steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <footer className="rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-zinc-500">
          {output.disclaimers.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </footer>
    </div>
  );
}
