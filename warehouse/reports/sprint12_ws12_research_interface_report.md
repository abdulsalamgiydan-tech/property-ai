# Sprint 12, Workstream 12 — Research Interface Rebuild

## Scope decision

Rather than a ground-up rebuild of `/research`'s routing/layout (high risk,
no clear justification for regressing a working UI), WS12 focused on
**closing two real, concrete gaps** the earlier Foundation Block
workstreams left between the backend and what the UI actually shows —
found by reading the existing component, not assumed.

## Finding 1: population growth was invisible in the UI despite existing in the data

`components/research/MarketSnapshotView.tsx` carried a hardcoded
paragraph: *"Population growth 2016→2021 is not available — 2016 and
2021 Census suburb/postcode boundaries do not align cleanly for direct
comparison."* This was true **before** Sprint 12 WS4 — false since. The
real reason it stayed invisible: `public.get_market_snapshot_v2()` (the
RPC the UI actually calls) never selected
`population_growth_2016_2021_pct` in its `RETURNS TABLE`, even though
WS6 had already rolled the real figure into
`mart.suburb_market_snapshot`/`postcode_market_snapshot` for 10,935 +
2,596 rows. The `MarketSnapshot` TypeScript type already had the field
(inherited by `MarketSnapshotV2` too) — nothing on the frontend needed a
type change, only the RPC and the component.

**Fixed**: migration 034 drops and recreates `get_market_snapshot_v2()`
with the column added (Postgres requires DROP+CREATE for a `RETURNS
TABLE` signature change — `CREATE OR REPLACE` cannot alter it).
Live-verified: `SELECT population_growth_2016_2021_pct FROM
get_market_snapshot_v2('SAL_12348_ASGS3_2021')` → `11.77`. Added a new
`MetricCard` in the Demographics section and corrected the stale
copy to accurately describe the real methodology (99.80% national
reconciliation accuracy, ±0.5% documented tolerance) instead of the
outdated "not available" claim.

## Finding 2 (the WS8/WS11 integration the mission asked for): no UI ever showed lineage

WS8 built field-level lineage; WS11 exposed it via
`/api/v1/metrics/.../lineage`. Nothing in the UI called it. Built
`components/research/AboutThisMetric.tsx` — a small client component
(fetches on first expand, not on page load, so it doesn't add an
N-metric-cards × 1-request burst to every snapshot page view) — and wired
it into the 4 metrics where lineage is most likely to matter to a reader:
median sale price (`sales`), median weekly rent (`rent`), gross yield
(`yield`), and the newly-visible population growth
(`population_growth`).

## Live verification (browser, not just build-time)

Started the dev server, navigated to `/research/suburb/12348` (Lindfield)
with `PUBLIC_API_V1_ENABLED=true`:
- Page renders correctly, no console errors.
- **Confirms WS9's fix is visible in the actual rendered UI**: median sale
  price shows `A$2,623,500` (the corrected 2026 figure), not the
  quarantined 2032 bug.
- Clicked "About this metric" under Median sale price → panel expands
  with real content: *"Source: NSW Valuer General Property Sales
  Information (NSW Valuer General), Dataset: NSW VG PSI — full state,
  2001-current, Method: direct_load (direct), Licence: CC BY 4.0, View
  source ↗"* — the full WS8→WS11→WS12 chain working end-to-end through a
  real browser session, not just a curl test.
- "Population growth (2016→2021)" card now shows `11.8%` with its own
  working "About this metric" link.
- Postcode page (`/research/postcode/2070`) also verified — loads
  cleanly, no console errors.

**Investigated and ruled out as a false alarm**: the median sale price
card shows "insufficient confidence" even though `sales_volume_12m` is
68. Checked the underlying monthly breakdown — the $2,623,500 figure is
specifically the **detached-house** median (2 transactions in 2026,
genuinely insufficient sample size), while the 68 total combines
detached + apartment transactions. The confidence label correctly
describes the displayed price's own sample size, not the combined
transaction count — matches the original Sprint 9 `buildSnapshot` design
intent, not a bug introduced by WS9's quarantine fix.

## Validation

- `npm test`: 157/157 pass (no new tests this workstream — UI changes
  verified via live browser testing per this project's convention for
  frontend work, not unit tests of React components, which this codebase
  has no established pattern for).
- `npm run build`: passes, all routes compile.
- `npm run lint`: 0 errors, 6 pre-existing warnings.
- Production (`oshquaxsloolqucwvigc`): re-confirmed no new schema objects.

## Files

- `supabase/migrations/034_market_snapshot_v2_population_growth.sql`
- `components/research/AboutThisMetric.tsx` (new)
- `components/research/MarketSnapshotView.tsx` — new prop
  (`geographyId`), population growth card + corrected copy, 4
  `AboutThisMetric` integrations
- `app/research/suburb/[geographyCode]/page.tsx`,
  `app/research/postcode/[geographyCode]/page.tsx` — pass `geographyId`

## Exact next workstream

WS13 — export and reproducibility.
