# Sprint 14 — Workstream 17: Performance

## Method

Ran a targeted audit across six categories known to be common,
concrete Next.js performance issues, following the same standard as
WS18's accessibility audit: point to exact file/line, verify the
mechanism, and explicitly rule out anything that turns out not to be a
real issue on closer inspection rather than padding the list with
speculative suggestions.

## Result: no genuine issues found

All six categories were checked and each came back clean:

1. **Waterfalled (sequential) data fetches.** Every server-component
   page with two or more independent data calls already uses
   `Promise.all` (`app/admin/page.tsx`, `app/research/data-status/page.tsx`,
   `app/research/suburb/[geographyCode]/page.tsx`,
   `app/research/postcode/[geographyCode]/page.tsx`). The pages with
   sequential `await`s (`app/research/scenario/[geographyCode]/page.tsx`,
   `app/research/copilot/[geographyCode]/page.tsx`) are genuine
   dependent chains — the second call needs `geo.geography_id` from the
   first — not a parallelisable pattern that was missed.
2. **Missing `next/image` usage.** Zero `<img>` tags found anywhere in
   `app/` or `components/`. This app renders no raster images at all
   (property research data, not photo galleries), so there is no
   optimisation gap to close.
3. **Oversized client components / code-splitting candidates.**
   Spot-checked the three largest client components
   (`AnalysePropertyClient.tsx`, `ScenarioLabClientV2.tsx`,
   `WatchlistClient.tsx`). No large, rarely-used top-level dependency
   was found that would be a safe, clear code-splitting win — the
   charting library is the only heavy dependency, and it renders as
   part of each page's primary view, not behind an infrequently-used
   toggle where deferred loading would help.
4. **Recharts import scope.** All three consumers
   (`AnalysePropertyClient.tsx`, `SavedReportClient.tsx`,
   `CompareProjectionCharts.tsx`) already use named/destructured
   imports (`{ LineChart, ResponsiveContainer, ... }`), the
   tree-shakeable pattern — not a broad `import * as Recharts`.
5. **Duplicate data fetching.** Checked whether any page fetches
   warehouse data server-side and then a child component re-fetches the
   same data client-side. Confirmed the suburb profile page fetches
   once and passes props down through `MarketSnapshotView` — no
   duplication found.
6. **`next.config.ts` settings.** No `images` remote-patterns config
   exists, but since the app has zero `next/image`/`<img>` usage
   anywhere, there's no missing-domains gap to flag. Compression is
   Next's default (`true`) already.

## What this means

This is a genuine "audited, nothing to fix" result, not a skipped
workstream — reported honestly rather than manufacturing a change to
justify the pass, consistent with this project's standing practice of
never padding a report with unverified or unnecessary work.

## What was deliberately not done

- No Lighthouse/Core Web Vitals measurement run against a live
  deployment — this audit was static code review, not a measured
  before/after performance comparison. A genuine performance
  *measurement* pass (not just a code-pattern audit) would need a
  deployed preview environment to test against, which this branch does
  not currently have (no Preview deployment configured this sprint —
  see the standing checkpoint known-issues list).
- No bundle-size analysis tooling was run (e.g. `@next/bundle-analyzer`)
  — this would be a reasonable follow-up if a future performance
  concern is actually observed in production, rather than something to
  add speculatively here.

## Database changes

None.
