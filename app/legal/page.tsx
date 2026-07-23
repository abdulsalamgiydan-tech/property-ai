import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal & Disclosures | Propellect",
  robots: { index: false, follow: false },
};

/**
 * Sprint 14 WS22 — a single, consolidated page for the disclaimer
 * language already used consistently across the app (DisclaimerFooter,
 * research/layout.tsx, ExportButtons, ScenarioLabClientV2, and others),
 * plus a factual "about your data" section describing only what this
 * codebase actually does today.
 *
 * Deliberately NOT a Terms of Service or a compliance-grade Privacy
 * Policy — those are contractual/legal documents that need review by a
 * qualified professional before this product's public launch. This
 * page states that explicitly rather than presenting informal
 * disclosure copy as if it were binding legal terms.
 */
export default function LegalPage() {
  return (
    <div className="min-h-full bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <Link href="/" className="text-xs font-medium text-violet-400/90 hover:text-violet-300">
          ← Back to Propellect
        </Link>

        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Legal &amp; Disclosures
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          This page consolidates the disclosure language already shown throughout Propellect into one place. It is
          not a Terms of Service agreement or a formal Privacy Policy — those documents require review by a
          qualified legal professional and will be published before any public launch. Until then, this page is the
          most complete, honest description of what this product is, what it isn&apos;t, and what happens to your
          data.
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">
            What Propellect is — and isn&apos;t
          </h2>
          <p className="text-sm leading-relaxed text-zinc-300">
            Propellect provides descriptive property research and illustrative modelling tools only. It is not
            financial, tax or legal advice, not a valuation, not a forecast, and not an investment recommendation.
            Every figure either comes from an independently-sourced official dataset (with a stated confidence
            level and source period — see the &quot;About this metric&quot; links throughout the research pages) or
            is a clearly-labelled assumption you entered yourself. Nothing in this product should be relied on as
            the sole basis for a property, financial, tax, or legal decision — always consult a qualified
            professional before acting.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">Private beta status</h2>
          <p className="text-sm leading-relaxed text-zinc-300">
            Propellect is currently in a private, invitation-based beta. Features, data coverage, and this
            disclosure page itself may change without notice as the product develops. Some features described
            elsewhere in the app may be gated behind a feature flag and not yet available to all users.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">About your data</h2>
          <p className="text-sm leading-relaxed text-zinc-300">
            This section describes, factually, what the product currently does — it is not a substitute for a
            formal Privacy Policy.
          </p>
          <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
            <li>
              Sign-in and account data (your email address and session) are handled by Supabase, our authentication
              and database provider.
            </li>
            <li>
              If you use a feature that saves data to your account — property reports, comparisons, a watchlist,
              portfolio entries, saved Scenario Lab cases, strategy reports, or notification preferences — that
              data is stored in our Supabase database, scoped to your account, and readable only by you (enforced
              at the database level, not just in the app).
            </li>
            <li>
              The Strategy tool and the Research Copilot (where enabled) send the inputs you provide, or evidence
              already shown to you on the relevant research page, to Anthropic&apos;s Claude API to generate a
              response. No other third-party AI provider is used.
            </li>
            <li>
              We use Vercel Analytics for aggregate, privacy-friendly page-view and performance metrics — it does
              not use cookies and does not track you individually across other sites. We do not use advertising
              trackers, ad networks, or session-recording tools. Separately, a first-party product-usage event
              system exists in the codebase but currently only logs to the browser console during development — in
              production, those specific events are not sent anywhere.
            </li>
            <li>
              We do not sell your data to any third party.
            </li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">Questions</h2>
          <p className="text-sm leading-relaxed text-zinc-300">
            If you have a question about this page, your data, or anything else, please contact us through the
            channel you used to request beta access.
          </p>
        </section>
      </div>
    </div>
  );
}
