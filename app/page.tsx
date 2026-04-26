import Link from "next/link";

const tools = [
  {
    title: "Analyse a Property",
    caption:
      "Already found a property? Test cashflow, tax, depreciation and long-term projections.",
    href: "/analyse-property",
    cta: "Try the analyser",
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
    title: "Suburb Intelligence",
    caption: "Understand the investment profile of Australian suburbs — yields, vacancy, and growth.",
    href: "/suburb-intelligence",
    cta: "Explore suburbs",
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
  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-12 sm:px-6 sm:py-16">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">
            AUSTRALIA
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Property Investment Analyser
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-base text-violet-200/80">
            Data-backed tools for Australian property investors.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Analyse a property, test cashflow, estimate tax impact, and model long-term outcomes before
            you buy.
          </p>
          <div className="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/analyse-property"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-violet-950/50 transition hover:bg-violet-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/40 sm:flex-initial sm:min-w-[11rem]"
            >
              Try the analyser
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-zinc-600/80 bg-zinc-900/80 px-5 py-3.5 text-sm font-semibold text-zinc-100 shadow-inner shadow-black/20 transition hover:border-zinc-500 hover:bg-zinc-800/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/30 sm:flex-initial sm:min-w-[11rem]"
            >
              View dashboard
            </Link>
          </div>
          <p className="mx-auto mt-5 max-w-xl text-xs leading-relaxed text-zinc-500">
            Run the tools on a real deal — you&apos;ll see a preview instantly, then you can unlock the full
            analysis with free early access.
          </p>
        </header>

        <section className="mt-14" aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="sr-only">
            Tools
          </h2>
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

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs leading-relaxed text-zinc-500">
          Built for Australian residential investors. Illustrative modelling only. Not financial, tax, or
          legal advice.
        </p>
      </main>
    </div>
  );
}
