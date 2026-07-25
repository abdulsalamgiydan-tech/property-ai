# Feature Flags & Preview Readiness (Sprint 11, Workstream 18)

Reviewed every flag name that had accumulated across WS9-13 documentation
against what actually exists in `lib/warehouse/env.ts` and is actually
checked by a route. Two names in the user's original spec —
`NATIONAL_RESEARCH_ENABLED` and `NATIONAL_MAP_ENABLED` — turned out to be
aspirational references in earlier reports, never implemented as real env
vars. `RESEARCH_EXPORT_ENABLED` doesn't exist anywhere either (export
buttons render unconditionally on whatever page they're placed on, gated
only by that page's own flag).

## Flags as of this workstream

| flag | status | gates | default |
|---|---|---|---|
| `WAREHOUSE_PREVIEW_ENABLED` | existing | `/research/*` (parent layout, all routes) | disabled |
| `MULTI_STATE_RESEARCH_ENABLED` | existing | `/research/explore`, `/research/map`, `/research/compare` | disabled |
| `DATA_OPERATIONS_ENABLED` | **new this workstream** | `/research/data-status` | disabled |
| `SCENARIO_LAB_ENABLED` | **new this workstream** | `/research/scenario` (Sprint 12 Part C — route doesn't exist yet) | disabled |

All flags: production-safe by default (absent or any value other than the
exact string `"true"` → disabled), independent of each other, checked with
`vi.stubEnv` unit tests in `lib/warehouse/env.test.ts` (14 tests, all
passing).

## Decisions made, not just flags added

1. **`NATIONAL_MAP_ENABLED` deliberately not created.** The map route
   (`app/research/map/page.tsx`) currently reuses
   `MULTI_STATE_RESEARCH_ENABLED` and says so in an inline comment written
   in WS11. Re-reviewed that decision here: the map has no behaviour today
   that diverges from the rest of multi-state research (same data sources,
   same jurisdiction coverage, same preview-readiness level) — a dedicated
   flag would let an operator enable/disable it independently for no
   present reason. Kept the reuse, documented the reasoning in
   `.env.example` instead of adding an unused flag.
2. **`NATIONAL_RESEARCH_ENABLED` deliberately not created**, same
   reasoning — `MULTI_STATE_RESEARCH_ENABLED` already covers the entire
   "national" (multi-jurisdiction) research surface; a second flag with
   identical effect would be redundant, not defense-in-depth.
3. **`RESEARCH_EXPORT_ENABLED` deliberately not created.** CSV/JSON/print
   export (WS13) is a client-side rendering detail of pages that are
   already flag-gated (compare, map, snapshot) — there is no separate
   server capability or data exposure to gate; a page-level flag already
   controls whether the export buttons are ever reachable.
4. **`DATA_OPERATIONS_ENABLED` added and wired into
   `app/research/data-status/page.tsx`** (previously gated by
   `WAREHOUSE_PREVIEW_ENABLED` alone) — this console exposes operational
   detail (refresh-run history, storage consumption in MB) that a reviewer
   may reasonably want to preview independently of the rest of `/research`.
5. **`SCENARIO_LAB_ENABLED` added ahead of the route's existence** (the
   Scenario Lab is Sprint 12 Part C, not yet built) so staging/preview
   configuration doesn't need a later env var addition mid-sprint. Unused
   until that route exists; defaults to disabled, has no effect today.

## What this workstream did not do

- No new preview/staging *infrastructure* was created — no new Vercel
  project, no new Supabase branch. "Preview/staging config using existing
  free infrastructure only" is satisfied by the existing Vercel preview
  deployment pattern (env vars set per-environment in the Vercel dashboard,
  unchanged process) plus these new flags being off by default everywhere
  until explicitly set.
- No production alias or domain configuration was touched.

## Files changed

- `lib/warehouse/env.ts` — added `isDataOperationsEnabled()`,
  `isScenarioLabEnabled()`.
- `lib/warehouse/env.test.ts` — 8 new tests (absent/invalid/valid ×
  independence check, for each new flag).
- `app/research/data-status/page.tsx` — now requires both
  `WAREHOUSE_PREVIEW_ENABLED` and `DATA_OPERATIONS_ENABLED`.
- `.env.example` — documented all four flags (previously only
  `WAREHOUSE_PREVIEW_ENABLED` was documented; `MULTI_STATE_RESEARCH_ENABLED`
  existed in code but was undocumented until now).
