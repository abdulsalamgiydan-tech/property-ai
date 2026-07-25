# Multi-State Research UI Report (Sprint 10, Phase 12)

Generated: 2026-07-21

## Feature flags

- `WAREHOUSE_PREVIEW_ENABLED` — unchanged, still gates the whole `/research`
  tree, disabled by default.
- `MULTI_STATE_RESEARCH_ENABLED` — **new this sprint**, gates
  `/research/explore` and `/research/compare` specifically, disabled by
  default. Both flags must be `true` for the new routes to render.

## Routes delivered

| route | status |
|---|---|
| `/research` | extended — VIC-aware copy, Explore/Compare links, StateBadge on results |
| `/research/explore` | new — state + geography-type filters, no default ranking, 2-5 multi-select feeding Compare |
| `/research/compare` | new — side-by-side metric table via `compare_market_geographies_v1` |
| `/research/suburb/[geographyCode]` | upgraded in place to v2 queries — URL unchanged |
| `/research/postcode/[geographyCode]` | upgraded in place to v2 queries — URL unchanged |

## Route not delivered as originally planned

`/research/suburb/[stateCode]/[geographyCode]` (and the postcode
equivalent) could not be added alongside the existing
`/research/suburb/[geographyCode]` route: Next.js App Router requires every
dynamic segment at a given URL position to share one slug name across the
whole route tree. Adding a second, differently-named dynamic segment at the
same position crashes the dev server (verified live: `You cannot use
different slug names for the same dynamic path ('geographyCode' !==
'stateCode')`).

Since `geography_code` is already globally unique (NSW postcodes
1000-2999, VIC 3000-3999 with no overlap; ASGS SAL codes are nationally
unique), a state-prefixed path segment wasn't functionally required for
correct routing — only a URL-aesthetics nicety. Given the direct conflict
with "preserve compatibility with existing URLs," the existing
single-segment routes were upgraded to be jurisdiction-aware in place
(StateBadge, v2 queries) instead of introducing a redundant,
framework-incompatible URL shape.

## What's new

- `components/research/StateBadge.tsx` — explicit NSW/VIC badge, prevents
  same-name-suburb confusion (e.g. "Richmond" exists in multiple states).
- `components/research/ExploreFilterForm.tsx` / `ExploreResultsList.tsx` —
  state/type filters and a 2-5 checkbox multi-select feeding Compare.
- `lib/warehouse/queries.ts` — `searchGeographiesV2`, `getMarketSnapshotV2`,
  `compareMarketGeographies`, `getTimeseriesV2`, wrapping the four new
  Phase 11 RPCs.

No rankings, no scores, no buy/pass output anywhere in the new UI.

## Charts

`recharts` is installed but unused (existing and new pages render trends
as tables, matching the pre-existing pattern). Not added this pass — out
of scope for the time budget. Tables already satisfy the "label mismatched
periods, don't interpolate missing observations" requirement: every row
shows its own period and confidence explicitly, and the query layer never
interpolates.

## Browser testing (real branch data, gstack /browse)

All 9 tests pass — see `multi_state_research_ui_report.json` for the full
list. Highlights:

- VIC-filtered explore search returns real VIC suburbs with correct
  StateBadge.
- Checkbox selection correctly generates a `/research/compare?ids=...`
  link with real `SAL_..._ASGS3_2021` geography IDs.
- **Cross-state comparison** (1 NSW + 1 VIC suburb) renders real data with
  correctly non-aligned sales/rent periods shown per geography (2026-01 NSW
  vs 2025-10/2025-07 VIC) — never forced into a false alignment.
- Compare page's out-of-range inputs (0 or 1 geography) show an empty
  state, never a crash.
- `npm run build` succeeds with all 5 routes compiled; TypeScript clean
  (only 2 pre-existing, unrelated errors in `contracts.test.ts`).

Production untouched throughout. Both feature flags remain disabled by
default in the codebase (only set to `true` in local `.env.local` for this
testing session).
