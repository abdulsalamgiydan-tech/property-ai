# Sprint 14 — Workstream 11: Report Builder Generalization

## Scope delivered this pass

Sprint 13 (WS16) built one report export path: `lib/export/researchReport.ts`
combined an area snapshot and Scenario Lab cases into a downloadable
CSV/JSON/print report, but it was only ever wired into the Scenario Lab
(`ResearchReportExportButtons` on `ScenarioLabClientV2.tsx`), and its
`buildResearchReportBundle()` required an `area` (a warehouse-linked
geography snapshot) as a mandatory input. The Deal Analyser
(`AnalysePropertyClient.tsx`) had a completely separate, database-backed
"save report" mechanism (`SaveReportButton` → `/reports/[id]`) with no
downloadable export at all.

This workstream generalizes the report bundle into a real, reusable
report builder rather than a Scenario-Lab-only feature:

1. **`area` is now optional**, and a new `propertyAnalysis` section was
   added (`ReportPropertyAnalysis` type + `bundle.propertyAnalysis`).
   `buildResearchReportBundle()`'s three inputs — `area`, `scenarios`,
   `propertyAnalysis` — are each independently optional, so the same
   bundle builder now serves both use cases:
   - Scenario Lab: `area` + `scenarios` (as before, unchanged output).
   - Deal Analyser: `propertyAnalysis` alone — no linked warehouse
     geography exists for a manually-entered property, so requiring
     `area` would have made this integration impossible without
     fabricating one.
2. **`reportBundleToCsv()`** now renders the area section only when
   `area` is present, and a new "# Property analysis (your own entered
   assumptions, not sourced data)" section when `propertyAnalysis` is
   present — clearly labelled as user-entered, not warehouse-sourced,
   consistent with the existing scenario-cases section's framing.
3. **Wired `ResearchReportExportButtons` into `AnalysePropertyClient.tsx`**
   (Deal Analyser), next to the existing "Compare with another property"
   action — a user can now download their deal analysis as CSV/JSON or
   print/save-as-PDF, which did not exist before this workstream. This
   is additive to (not a replacement for) the existing database-backed
   "Save report" feature — the two serve different purposes (persistent
   saved history vs. one-off download/share).

## Why this scope, and what was deliberately not done

The brief's execution plan explicitly named this as "generalizes it
into a real report builder" rather than a from-scratch new system —
the existing bundle/CSV/JSON/print infrastructure was already solid
(formula-injection-safe via `csvCell`, tested, used in production);
the gap was that it was hard-coded to one call site. Generalizing the
existing types was lower-risk than building a second parallel export
system.

Not implemented in this pass, stated explicitly:
- No true "custom report builder" UI (pick-your-own-sections,
  drag-and-drop, multi-property batch reports) — that would be a much
  larger surface than one workstream justifies. What shipped is: the
  same underlying bundle format now serves two tools instead of one,
  which is the concrete, testable slice of "generalization" the
  execution plan called for.
- Comparison-tool reports (`/compare-properties`) still have no export
  path — out of scope for this pass.
- The Scenario Lab v2 WS7 "extra repayments" scenario type (added
  earlier this session) is not yet reflected in `ReportScenarioCase` /
  the exported CSV — noted as a known gap in the WS7 report, unchanged
  here.

## Testing

- `lib/export/researchReport.test.ts`: +6 tests — a bundle built from
  `propertyAnalysis` alone (no `area`) is valid and has zero
  area-derived limitations; the area-derived source line is correctly
  omitted (and a property-analysis-specific source line included)
  when there's no area; area + propertyAnalysis + scenarios can all
  coexist in one bundle; the CSV renders a "# Property analysis"
  section only when present; a CSV built from `propertyAnalysis` alone
  omits the "# Area snapshot" section entirely and still produces a
  correctly-titled, usable document.
- Full suite: 350/350 passing (up from 345 after WS7).
- `npx eslint components/analyse/AnalysePropertyClient.tsx
  lib/export/researchReport.ts`: clean.
- `npm run build`: passes.

## Database changes

None. This workstream is entirely a type/function generalization plus
a new client-side wiring point — no new table, RLS surface, or API
route.

## Risk / correctness notes

- Existing Scenario Lab callers pass `area` unchanged, so their CSV/
  JSON output is byte-for-byte identical to before this workstream —
  verified by the pre-existing test suite still passing without
  modification to those specific assertions.
- `depositPercent` in the Deal Analyser's exported `propertyAnalysis`
  section is read from the raw form string state (parsed via the
  file's existing `parseNumber` helper) rather than from
  `PropertyAnalysisResult`, since the result type does not carry
  deposit percent as a field — this mirrors how the rest of the
  component already treats `depositPercent` as form-only state.
