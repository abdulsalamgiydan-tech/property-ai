# Sprint 13 Phase 2 — Accessibility & Mobile Pass (Workstream 15)

Focused on Phase 1/2's new components (the surface actually at risk this
sprint), verified live rather than assumed.

## Checked and confirmed clean (no fix needed)

1. **Button accessible names** — every button in `GeographySearchBox`,
   `ScenarioLabClientV2`, `CompareTable`, `WatchlistClient`,
   `AboutThisMetric` was audited: each has either visible text content
   (native accessible name) or an explicit `aria-label` (remove-scenario
   ✕, reorder ← →, remove-from-watchlist, mark-read).
2. **Range slider labelling** — live-verified via the accessibility tree
   (gstack `browse` `snapshot -i`), not just source-reading: every
   Scenario Lab slider across all 3 default cases exposes as
   `[slider] "Deposit (20%)": "20"` etc. — correct role, correct
   accessible name including live value, correct current value.
3. **Focus reachability** — tabbed through the page; focus correctly
   lands on real interactive elements with proper names (e.g. the nav's
   "Sign in / Get started" button).
4. **Mobile layout, 7-column bottom nav** (the WS2 change flagged as a
   layout risk in the Phase 1 final report) — screenshotted at 390x844
   (iPhone-class viewport): all 7 items (Home, Analyse, Strategy,
   Compare, Research, Watchlist, Portfolio) fit without overlap, icons
   and labels legible, active-page highlighting correct. The risk noted
   in Phase 1 did not materialise.
5. **Scenario Lab v2 mobile layout** — screenshotted at the same
   viewport: 3 scenario cards stack to a single column below the `sm`
   breakpoint (Tailwind responsive classes working as intended), all
   sliders full-width and usable, debt/equity tables render without
   horizontal overflow.
6. **Missing-data rendering on mobile** — same screenshot confirms
   "Net cash flow (pre-tax): Unavailable" and "Gross yield: Unavailable"
   render correctly (this suburb has no rent data) rather than a
   fabricated $0 or blank cell — the "never zero" rule holds visually,
   not just in unit tests.

## Not re-audited this pass (pre-existing surface, unchanged by Sprint 13)

Colour contrast, dark/light mode (this app is dark-mode-only, unchanged),
and reduced-motion handling on pre-existing components (analyse-property,
compare-properties, dashboard, portfolio) were not re-audited — Sprint 13
didn't touch their layouts, and a full-app contrast audit is a larger,
separable effort better scoped to a dedicated accessibility sprint than
squeezed into this one's remaining time budget. Flagged honestly as not
audited rather than claimed clean.
