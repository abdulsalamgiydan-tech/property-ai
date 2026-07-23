# Sprint 14 — Workstream 19: Analytics

## Scope delivered this pass

Sprint 13's analytics event contract (`lib/analytics/events.ts`) already
had 8 documented event shapes (now 9, after WS5 added
`research_copilot_answered`). Auditing every `trackEvent()` call site in
the codebase against the contract found one real, meaningful gap:
**`profile_opened` was declared in the type union and covered by
`events.test.ts`'s "accepts every documented event shape" test, but was
never actually fired anywhere** — every suburb/postcode profile view
went untracked, despite the event existing specifically to track them.

### Fix

- **`components/research/ProfileViewTracker.tsx`** (new) — a minimal
  client component (`"use client"`) whose only job is firing
  `profile_opened` once on mount via `useEffect`. Kept as a tiny
  separate leaf rather than converting `MarketSnapshotView.tsx` (a
  large, currently server-rendered component) to a client component,
  which would have forced every child of that component to hydrate
  client-side for no reason.
- **`components/research/MarketSnapshotView.tsx`** — renders
  `<ProfileViewTracker>` when a `geographyCode` is available. Does
  *not* fire for the "no data at all" early-return case (before this
  component's own `EmptyState` branch) — a page with zero recorded
  data for that geography isn't meaningfully a "profile view" in the
  product-analytics sense, consistent with the rest of this project's
  "descriptive, not speculative" framing.
- **`app/research/postcode/[geographyCode]/page.tsx`** — fixed a
  related, smaller gap while here: this page never passed
  `geographyCode` to `MarketSnapshotView` at all (the suburb page
  already did), even though `geo.geography_code` was already available
  from the existing `resolveGeographyByCode()` call. Without this fix,
  `ProfileViewTracker` would never have fired on postcode pages
  specifically.

## Testing

- No new `.test.ts` file — this codebase has no React component-testing
  setup (`@testing-library/react` is not a dependency; every existing
  test is a pure-function `.test.ts`, confirmed by checking for any
  `.test.tsx` file — none exist), so a new test harness wasn't
  introduced for one small client component, matching the established
  convention of verifying UI behaviour live rather than via component
  tests.
- `lib/analytics/events.test.ts` already exercises the `profile_opened`
  event shape (pre-existing test, unchanged) — the contract-level
  coverage was already correct; only the wiring was missing.
- Full suite: 401/401 passing (unchanged from the last checkpoint — no
  new pure-function logic was added in this workstream).
- `npx eslint`: clean.
- `npm run build`: passes.
- **Live browser verification** (via the `browse` tool, dev server):
  navigated to a real postcode page (`/research/postcode/2000`) and
  confirmed the console log
  `[analytics] profile_opened {geographyType: postcode, geographyCode: 2000}`
  fires correctly; navigated to a real suburb page
  (`/research/suburb/10030`) and confirmed the same for
  `geographyType: suburb`.

## What was deliberately not done

- No new analytics *events* were introduced — this workstream closed an
  existing contract gap rather than expanding the contract, keeping to
  the same "no invasive tracking, no new PII, dev-mode-only logger
  until a provider is approved" guardrail already governing this file.
- No analytics dashboard, aggregation, or export of these events exists
  — `trackEvent()` remains a development-mode `console.debug` call
  only, per its own documented design (the seam a future approved
  provider would be wired into, not built here).
- No audit of every OTHER product surface for missing tracking beyond
  this one real gap — a full audit would be a larger effort; this pass
  fixed the one concrete, verifiable gap found.

## Database changes

None.
