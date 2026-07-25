# Sprint 14 — Workstream 18: Accessibility

## Method

Sprint 13's accessibility pass (`sprint13_phase2_accessibility_report.md`)
live-verified buttons, slider labelling, and mobile layout as clean, and
explicitly did not audit color contrast or reduced-motion. Rather than
re-run that same ground, this pass audited every component built or
modified during Sprint 14 (WS9, WS6, WS7, WS11, WS5, WS2, WS3/WS4,
WS19) plus checked whether any established accessible pattern already
in this codebase was inconsistently applied.

**Established pattern confirmed**: `role="tablist"` / `role="tab"` /
`aria-selected` is already used correctly in
`components/compare/CompareProjectionCharts.tsx`. Any new tab UI should
match this pattern rather than reinvent one — this is exactly what one
of the fixes below does.

## Issues found and fixed

1. **`components/analyse/AnalysePropertyClient.tsx` — new "Stress
   test" tab group had no tab semantics at all.** The Analysis/Compare
   scenarios/Stress test buttons (the third tab was added this sprint
   in WS6) had only visual (background colour) selected-state, with no
   `role="tablist"` on the wrapper and no `role="tab"`/`aria-selected`
   on the buttons — directly inconsistent with the working pattern
   already in `CompareProjectionCharts.tsx`. Fixed to match that
   pattern exactly. Live-verified: the accessibility tree now reports
   `[tab] "Analysis" [selected]`.
2. **`components/research/ResearchCopilotClient.tsx` — the answer
   region had no `aria-live`.** When an answer (or the "not grounded"
   warning) appears after asking a question, a screen reader user got
   no announcement — they'd have to manually discover it. Added
   `aria-live="polite"` to the answer container.
3. **`components/watchlist/WatchlistClient.tsx` — the "What changed?"
   panel had no `aria-live`.** New this sprint (WS9): the "Check now"
   button triggers a loading → result state change with no
   announcement. Added `aria-live="polite"` to the swapping content
   region (loading spinner / event list / empty message), scoped
   tightly to that region rather than the whole panel (which also
   contains the unrelated digest-preference controls).
4. **`components/design/EmptyState.tsx` — new `linkHref`/`linkLabel`
   link (added this sprint for WS3/WS4) had no visible focus state.**
   The existing `CTAButton` rendered one line above it already has
   `focus-visible:ring-4`; the new plain link had nothing, an
   inconsistency within the same component. Fixed to match.
5. **`components/onboarding/OnboardingClient.tsx` — selected state was
   colour-only.** The goal buttons and state chips (new this sprint,
   WS2) already use `aria-pressed` correctly for screen readers, but
   sighted users relied entirely on a violet background/border to tell
   selected from unselected — no non-colour cue for colour-blind or
   low-vision users. Added a `✓` glyph (`aria-hidden`, since
   `aria-pressed` already covers the screen-reader announcement) to
   both the goal buttons and the state chips.

## Investigated and confirmed NOT an issue

- `ScenarioLabClientV2.tsx`'s new "Extra repayments" slider (WS7)
  follows the exact same accessible `<label>`-wrapped pattern as the
  other five sliders in the same component, which Sprint 13 already
  verified — no new gap introduced.
- The Deal Analyser stress-test table's red/green cashflow colouring
  is not a color-only violation: `formatAud()` uses
  `Intl.NumberFormat` with `style: "currency"`, which prefixes
  negative values with a `-` sign automatically — the colour is
  reinforcing information already conveyed by the sign, not the sole
  indicator.

## Testing

- No new automated test — this codebase has no React
  component-testing setup (confirmed: no `@testing-library/react`
  dependency, no `.test.tsx` files anywhere), so every change here was
  verified live rather than via a new test harness, matching the
  established convention.
- Full suite: 401/401 passing (unchanged — no pure-function logic
  changed in this workstream).
- `npx eslint` across every modified file: clean.
- `npm run build`: passes.
- **Live browser verification** (via the `browse` tool, dev server):
  confirmed the Deal Analyser's tab group now reports correct
  `role="tab"`/`aria-selected` in the accessibility tree.

## What was deliberately not done

- No colour-contrast audit (explicitly out of scope per Sprint 13's
  own stated limitation, and this pass's time budget was spent on the
  concrete, verifiable issues above rather than a full contrast sweep).
- No reduced-motion audit (same reasoning).
- No screen-reader session recording/testing with an actual assistive
  technology (NVDA/VoiceOver) — verification here relied on the
  accessibility tree the `browse` tool exposes, which reflects the
  same ARIA semantics a real screen reader would consume, but is not a
  substitute for testing with real assistive technology.

## Database changes

None.
