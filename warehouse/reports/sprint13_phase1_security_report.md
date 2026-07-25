# Sprint 13 Phase 1 — Security Report

Scope: Workstreams 2-8's new surface only (nav, search, profiles,
analyse-property integration, Scenario Lab v2, comparison v2, watchlist
linking). Full Sprint 13 security hardening (Workstream 13) is a later
phase; this report covers what Phase 1 actually touched and tested, not
a repo-wide audit.

## RLS — tested, not just asserted

- New table `scenario_lab_cases` and the additive columns on
  `watchlist_items` both follow the exact `auth.uid() = user_id` shape
  already proven on `property_reports`/`property_comparisons`/
  `portfolio_properties`.
- `npm run warehouse:rls:check` (new this phase, `check_rls_policies.mjs`)
  statically verifies every `public.*` table has RLS enabled and the
  correct predicate on every required operation, by parsing the actual
  migration SQL — not narrative claims. 16 unit tests
  (`check_rls_policies.test.ts`) cover both fixture SQL (well-formed,
  missing-RLS, missing-predicate, prefix-name-collision cases) and the
  real migration corpus, asserting all 7 real tables pass, including the
  two legitimate documented exceptions (`waitlist`, `strategy_generations`).
- **What this does NOT prove**: runtime enforcement against a live
  database with two real users. Per an explicit decision made with the
  user this phase (no safe non-production Supabase branch exists for the
  main app schema, unlike the warehouse-validation branch), live
  cross-user integration tests are out of scope for Phase 1 and remain a
  known gap — see `sprint13_phase1_known_limitations` note in the final
  report.

## Feature-flag enforcement — server-side, tested

- New flag checks (`WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`)
  are checked server-side in every new route (`search-suggest`,
  `suburb-suggestions`) before any query runs, returning a plain 404 —
  the same pattern as every existing `/research/*` route and
  `/api/research/map-markers`. Verified by tests exercising both flags
  independently (`route.test.ts` for each new route: flag-off → 404,
  flag-on → real data).
- No new client-only hiding: the Research nav link's visibility
  (`shouldShowResearchNav`) is a display convenience computed from a
  server-passed boolean, not the enforcement boundary — the underlying
  `/research/*` routes and new API routes independently 404 regardless
  of what the client renders.

## No service-role or secret exposure

- Every new Supabase call from a client component
  (`lib/supabase/scenarioLabCases.ts`, extended
  `lib/supabase/watchlist.ts`) uses `createBrowserSupabaseClient()` (the
  anon-key client, already used by every existing deal-tools save
  action) and always takes `user_id` from `supabase.auth.getUser()`
  server-side session, never from client input — matching the existing
  `watchlist.ts`/`reports.ts` pattern exactly, not a new pattern.
- New server routes (`search-suggest`, `suburb-suggestions`) use
  `createWarehouseClient()`, the existing server-only warehouse client —
  confirmed no new env var was introduced that could leak into the
  browser bundle (checked: no `NEXT_PUBLIC_` prefix added anywhere this
  phase).
- Grepped the Phase 1 diff for secret-shaped strings
  (`sk-ant-`, `service_role` as a credential, private-key headers,
  Postgres connection strings, AWS-style keys) — the only
  `service_role` matches are legitimate references to the Postgres role
  *name* inside RLS policy predicates and the RLS checker's own test
  fixtures, not credentials.

## Input validation / bounding

- `search-suggest`: query limited to 20 results max (mirrors `/api/v1/search`'s
  existing 100-cap pattern, tightened for an autocomplete use case).
- `suburb-suggestions`: state param strictly matched against `"NSW"|"VIC"`
  before any warehouse query runs; non-matching values short-circuit to
  `state_not_covered` without touching the database.
- Comparison reorder (`CompareTable`): `moveGeographyId` clamps to array
  bounds (tested: out-of-range index is a no-op, not a crash or
  out-of-bounds write).
- Scenario Lab v2 case count capped at `MAX_CASES = 4` client-side —
  server-side there's no unbounded-array risk since cases are only
  persisted one at a time via `saveScenarioCase`.

## Build/bundle check

- `npm run build`'s production bundle was inspected for the new routes
  list — all new API routes show as `ƒ` (server-rendered/dynamic), not
  statically embedded, confirming no server-only logic leaked into a
  static client chunk.

## Known gap carried into later phases

- Live cross-user RLS integration testing (see above).
- Rate limiting on the two new API routes: neither has its own rate
  limit yet (existing `/api/research/map-markers` and `/api/v1/*` also
  don't at this point in the codebase's history) — this is Workstream 13
  scope, not introduced or worsened by Phase 1, but also not fixed by it.
