import Link from "next/link";
import { LogoMark } from "@/components/design/LogoMark";
import { HomeAccountCTA } from "@/components/home/HomeAccountCTA";

const baseTools = [
  {
    title: "Analyse a Property",
    caption:
      "Already found a property? Test cashflow, tax, depreciation and long-term projections.",
    href: "/analyse-property",
    cta: "Try the analyser",
    available: true,
  },
  {
    title: "Property Strategy",
    caption:
      "Get a personalised property investment strategy tailored to your goals and situation.",
    href: "/strategy",
    cta: "Get my strategy",
    available: true,
  },
  {
    title: "Compare Two Properties",
    caption: "Compare two deals side by side to see which stacks up better.",
    href: "/compare-properties",
    cta: "Compare 2 properties",
    available: true,
  },
  {
    title: "Portfolio Tracker",
    caption: "Track total value, debt, equity, and cashflow across your properties.",
    href: "/portfolio",
    cta: "View portfolio",
    available: true,
  },
] as const;

export default function HomePage() {
  // The legacy "Suburb Intelligence" tile (which linked to an unfinished
  // placeholder page) has been removed. The research experience lives entirely
  // under /research and is reached from the Research nav entry.
  const tools = baseTools;
  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 py-12 sm:px-6 sm:py-16">
        <header className="relative overflow-hidden rounded-3xl border border-zinc-700/70 bg-zinc-900/80 p-7 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-10">
          <div
            className="pointer-events-none absolute left-1/2 top-[-12rem] h-[30rem] w-[42rem] -translate-x-1/2 rounded-full"
            style={{ background: "radial-gradient(closest-side, rgba(124,58,237,0.25), transparent)" }}
          />
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <LogoMark size={30} />
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em] text-violet-300">
                Australian property analysis platform
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
                Investor-grade tools to analyse deals with clarity
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-300 sm:text-base">
                Model cashflow, tax impact, depreciation, stamp duty, and long-term projections using
                practical assumptions for Australian residential property.
              </p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
                See the numbers instantly, then unlock deeper guidance for key risks and what needs to
                improve.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link
                  href="/analyse-property"
                  className="inline-flex items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40"
                >
                  Analyse a property
                </Link>
                <Link
                  href="/strategy"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-900/85 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30"
                  aria-label="Property Strategy — Get a personalised property investment strategy tailored to your goals and situation."
                >
                  Get my strategy
                </Link>
                <Link
                  href="/compare-properties"
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-900/85 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30"
                >
                  Compare 2 properties
                </Link>
                <HomeAccountCTA />
              </div>
            </div>
            <div className="grid w-full max-w-sm grid-cols-2 gap-3">
              {[
                ["Green status", "The numbers are strong"],
                ["Amber status", "The assumptions are sensitive"],
                ["Red status", "The deal needs improvement"],
                ["Holding view", "The holding risk is elevated"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-zinc-700/75 bg-zinc-950/55 p-3 backdrop-blur-sm"
                >
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-200">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="mt-14" aria-labelledby="tools-heading">
          <div className="mb-6">
            <h2 id="tools-heading" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Explore the platform
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Each module is built for practical analysis, not generic calculators.
            </p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {tools.map((tool) => (
              <li key={tool.title}>
                <article
                  className={`relative flex h-full flex-col rounded-2xl border border-zinc-700/80 bg-zinc-900/80 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-7 ${
                    tool.available ? "transition hover:border-zinc-600/90" : "opacity-95"
                  }`}
                >
                  {!tool.available ? (
                    <span className="absolute right-4 top-4 rounded-full border border-violet-500/35 bg-violet-950/50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
                      Planned for Pro
                    </span>
                  ) : null}
                  <h3
                    className={`text-lg font-semibold text-white ${!tool.available ? "pr-[7.5rem] sm:pr-36" : ""}`}
                  >
                    {tool.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-400">{tool.caption}</p>
                  {tool.available ? (
                    <Link
                      href={tool.href}
                      className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40"
                    >
                      {tool.cta}
                    </Link>
                  ) : (
                    <div className="mt-6">
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-zinc-600/35 bg-zinc-950/80 px-4 py-3 text-sm font-semibold text-zinc-500 shadow-inner"
                      >
                        <svg
                          className="size-4 shrink-0 text-zinc-600"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                        >
                          <rect x="5" y="11" width="14" height="10" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        Open Tool
                      </button>
                      <p className="mt-2 text-center text-[11px] text-zinc-600">Not available yet</p>
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>

        <p className="mx-auto mt-12 max-w-3xl text-center text-xs leading-relaxed text-zinc-500">
          Built for Australian residential investors. Illustrative modelling only — not financial, tax or
          legal advice.
        </p>
      </main>
    </div>
  );
}
