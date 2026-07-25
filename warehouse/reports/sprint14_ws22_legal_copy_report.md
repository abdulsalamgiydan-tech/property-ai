# Sprint 14 — Workstream 22: Legal / Disclosure Copy

## Scope decision (checked with the user before proceeding)

There was no Terms of Service or Privacy Policy anywhere in the app —
only scattered, consistent "not financial, tax or legal advice"
disclaimer fragments across several components (`DisclaimerFooter.tsx`,
`app/research/layout.tsx`, `ExportButtons.tsx`, `ScenarioLabClientV2.tsx`,
and others). Drafting real, contractual Terms of Service or a
compliance-grade Privacy Policy is a task with genuine legal
consequence for a product with real user accounts — not something to
generate as boilerplate without professional review. I asked the user
how to scope this workstream before writing anything; they chose:
**consolidate the existing disclaimer language into one page, plus a
factual (not legally-binding) "about your data" section describing
only what the code actually does, with an explicit note that real
ToS/Privacy Policy need legal review before public launch.**

## Scope delivered

1. **`app/legal/page.tsx`** (new) — a single "Legal & Disclosures" page
   with four sections: what Propellect is/isn't (consolidates the
   "descriptive research, not advice" language already used
   consistently elsewhere), private beta status, "about your data"
   (factual, code-verified statements — see below), and a contact
   pointer. The page states explicitly, in its own first paragraph,
   that it is *not* a Terms of Service or Privacy Policy and that those
   require legal review before public launch — this framing is load-
   bearing, not decorative.
2. **`components/design/DisclaimerFooter.tsx`** — added a "Legal &
   disclosures" link next to the existing one-line disclaimer. Since
   `DisclaimerFooter` is already rendered site-wide via `AppShell` and
   `app/research/layout.tsx`, this makes the new page reachable from
   every page that already shows the disclaimer, with one change.

## A real inaccuracy caught before publishing

My first draft of the "about your data" section claimed "nothing is
currently sent to any analytics provider" in production. Before
finalizing, I checked `app/layout.tsx` and `package.json` directly
rather than relying on my own assumption — and found `@vercel/analytics`
is in fact wired into the root layout (`<Analytics />`, present on
every page). The claim was false. Fixed to accurately state that
Vercel Analytics (cookieless, first-party, no cross-site tracking) is
used for aggregate page-view/performance metrics, distinct from the
separate first-party `trackEvent()` event system (which genuinely is
dev-console-only in production, confirmed by reading
`lib/analytics/events.ts` directly). This is exactly the kind of
mistake informal, unreviewed legal-adjacent copy can make — caught here
by verifying against the actual code rather than assumption, but it's
also a concrete argument for why a real Privacy Policy needs a proper
review pass, not just careful drafting.

## Every other factual claim on the page, and how it was verified

- "Sign-in and account data... handled by Supabase" — confirmed via
  `lib/supabase/*` throughout this session's work (auth, RLS-scoped
  tables).
- "data is stored... scoped to your account, and readable only by you
  (enforced at the database level)" — this is the RLS guarantee this
  project has verified via `warehouse:rls:check` all sprint; not an
  aspirational claim.
- "Strategy tool and Research Copilot... send... to Anthropic's Claude
  API" — confirmed via `lib/strategy/claudeClient.ts` and this sprint's
  own `lib/research/copilotClient.ts` (WS5).
- "No other third-party AI provider is used" — confirmed by searching
  the codebase for any other LLM/AI SDK; none found.
- "We do not sell your data to any third party" — a factual statement
  about current behaviour verifiable from the absence of any
  data-export/sale integration anywhere in this codebase.

## What was deliberately not done

- No Terms of Service, no formal Privacy Policy, no cookie-consent
  banner, no GDPR/CCPA-specific compliance language — all explicitly
  out of scope per the user's chosen option, and flagged as needing
  professional legal review before public launch.
- No legal review of the page's own wording by a qualified
  professional — this is disclosure copy describing current product
  behaviour, not a substitute for that review.

## Testing

- No automated test — this is a static content page with no logic to
  test, matching the pattern of other static informational pages in
  this codebase (e.g. `/research/sources`).
- Full suite: 401/401 passing (unchanged).
- `npx eslint`: clean.
- `npm run build`: passes; `/legal` route confirmed present in build
  output.
- **Live browser verification** (via the `browse` tool, dev server):
  the page renders with all four sections and correct copy; the
  "Legal & disclosures" footer link is present and correctly reachable
  from `/research` (and, by construction, every other page using
  `DisclaimerFooter`).

## Database changes

None.
