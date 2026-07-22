# Sprint 13 Execution Plan — Propellect Private Beta Launch

**Workstream 0 output.** Written after direct inspection of the repository, git
history, Sprint 11/12 reports, migrations, tests, build, and Vercel/GitHub
state — not from the reports alone. Where a prior report's claim could not be
independently verified in this pass, it is marked "reported, not
re-verified" rather than restated as fact.

## 0. Reconciliation summary — what is actually true right now

- **Branch**: `feature/national-residential-research-platform-v1`, clean
  working tree, in sync with `origin` at `b9eb798`. `main` is a strict
  ancestor (95 commits behind) — there is no divergent history to reconcile.
- **CI**: GitHub Actions "Warehouse Validation" is green on `b9eb798` and on
  every commit in recent history.
- **Local checks, re-run in this session**:
  - `npm run lint` → 0 errors, 6 pre-existing warnings (unused-var lint rule,
    not Sprint 13 blockers).
  - `npm run test` → **163/163 passed**, 16 test files, 13.8s.
  - `npm run warehouse:check` → all warehouse files/migrations/metadata
    sanity checks pass, including "no raw data committed."
  - `npm run build` (`next build`) → compiles clean, 29 static/dynamic routes
    generated. One deprecation warning: Next 16 wants `proxy` instead of the
    `middleware` file convention — cosmetic, not a build failure, worth a
    Sprint 13 cleanup item.
  - Repo size: `.git` is 11MB; no `.parquet`, no `*_local/` raw data, no `.db`
    files tracked. Largest tracked files are JSON metadata registers (a few
    hundred KB each), not datasets.
  - Working tree had two incidental `generated_at` timestamp diffs in
    `warehouse/reports/*_local_build*.json` produced as a side effect of
    running the test suite — reverted, tree is clean again.

- **The product already exists further than the brief assumes.** This is the
  single most important correction to the brief's "current position" summary:
  the app is not just a research/warehouse backend — it is branded
  **Propellect** (propellect.com.au), has Supabase-auth magic-link sign-in
  already wired (`middleware.ts`, `app/auth/*`, `components/auth/AuthProvider.tsx`),
  and already ships a deal-analysis product (`app/analyse-property`,
  `app/compare-properties`, `app/dashboard`, `app/portfolio`, `app/reports/[id]`,
  `app/watchlist`, `app/strategy`) backed by real, substantial client code and
  four RLS-protected Postgres tables (`waitlist`, `property_reports`,
  `property_comparisons`, `watchlist_items`) defined in
  `supabase/migrations/001_propellect_schema.sql`. These are not stubs: e.g.
  `components/analyse/AnalysePropertyClient.tsx` is ~2,500 lines,
  `components/dashboard/DashboardClient.tsx` ~410, `components/watchlist/WatchlistClient.tsx`
  ~270, all with real Supabase queries. (One research subagent this session
  initially reported these as "empty scaffolds" after only reading the
  11-line page.tsx wrappers without following the import into the Client
  component — flagged and corrected by direct inspection; recorded here as a
  caution about trusting single-pass summaries, including this session's own.)
  Separately, `app/research/*` (explore, map, compare, postcode/suburb
  profiles, scenario, sources, data-status) is the Sprint 9–12 warehouse-driven
  research surface, gated behind `WAREHOUSE_PREVIEW_ENABLED` +
  per-route flags, all defaulting to `false`.
  **Sprint 13's real job is to merge these two existing product lines (deal
  tools + research warehouse) into one coherent private-beta IA, not to build
  either from scratch.**

- **Vercel 403 root cause (Workstream 1)**: diagnosed, not a permissions
  problem. `.vercel/project.json` links `projectId prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`
  under org `team_C9DDb5QQbFOdDkAMH76e8z3c` ("zeebusiness93-2304's
  projects"). The Vercel MCP connector's stored session token is stale/invalid
  for that scope (confirmed: `vercel whoami` also failed with "token not
  valid" before a fresh interactive device-code login). After a clean
  `npx vercel login` (device flow, no credentials printed), the CLI
  successfully listed the team, the linked `property-ai` project (production
  URL `app.propellect.com.au`), recent deployments, and env var **names**
  (`ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL` — all scoped to
  Preview+Production, none warehouse-specific). **This is a stale-credential
  problem in the MCP connector, not a missing entitlement, and must not be
  reported as a failed application build.** Minimal human action to fix the
  MCP connector itself (separate from the CLI, which now works): re-authorize
  the Vercel MCP integration from Claude's connector settings so it picks up
  a session with access to team `zeebusiness93-2304s-projects`. No further
  action is required to keep working locally/via CLI in this session.
  Full diagnosis recorded in Workstream 1's deployment-access report (next
  artifact, not yet written).

- **Data coverage (from `warehouse/config/jurisdiction_coverage.yml`,
  spot-checked, consistent with Sprint 11/12 reports)**: NSW and VIC have
  real sales+rent; QLD/SA/WA have rent only (sales is paid/restricted at
  source, honestly marked `official_source_paid` / `official_source_restricted`);
  TAS/ACT/NT have GCCSA-grain sales only, no rent, no yield. Population
  growth, dwelling stock, building approvals, demographics, income, tenure
  are genuinely national. Land values, vacancy, and planning pipeline are
  unavailable everywhere — an honest, documented national gap, not a bug.

- **Branch storage**: Sprint 12's final report states 2,679.4 MB / 4,500 MB
  ceiling (59.5%) on the warehouse-validation Supabase branch. **Reported,
  not re-verified in this session** (no destructive or even read query was
  run against the branch in Workstream 0 to keep this pass side-effect-free);
  Workstream 21's final audit must independently query this rather than
  re-quote the report.

## 1. Existing capability (reusable as-is or with light extension)

| Area | State | Where |
|---|---|---|
| Auth (magic link, Supabase) | Real, working | `middleware.ts`, `app/auth/*`, `components/auth/AuthProvider.tsx`, `lib/auth/access.ts` |
| Saved deal reports | Real, RLS-protected | `property_reports` table, `app/reports/[id]`, `app/dashboard` |
| Saved comparisons (2-property deal compare) | Real | `property_comparisons`, `app/compare-properties` |
| Watchlist (suburbs/postcodes + notes) | Real | `watchlist_items`, `app/watchlist` |
| Deal/scenario calculator (cashflow, tax, depreciation) | Real, ~2,500 lines | `components/analyse/AnalysePropertyClient.tsx` |
| Portfolio tracking | Real | `app/portfolio`, `components/portfolio/PortfolioClient.tsx` |
| National geography backbone (ASGS SA1-SA4, SAL, POA, LGA) | Real | `supabase/migrations/003-005`, `core.dim_geography` |
| Multi-jurisdiction sales/rent/yield/affordability marts | Real, coverage varies by state (see above) | `mart.*`, `warehouse/config/jurisdiction_coverage.yml` |
| Confidence + field-level lineage | Real, 100% coverage validated (reported) | `meta.metric_lineage_registry`, `warehouse/scripts/lineage/*`, `components/research/AboutThisMetric.tsx` |
| Public API v1 (search/snapshot/timeseries/compare/map-markers/metrics/quality/freshness/sources/export) | Real, 10 routes | `app/api/v1/*` |
| National map + up-to-10-area comparison | Real (research-side) | `app/research/map`, `app/research/compare`, migration `021_compare_up_to_10.sql` |
| Scenario Lab (affordability, deposit/rate/term) | Real, narrower than Sprint 13's WS6 spec (single scenario, not 3-way base/conservative/stress with equity path) | `app/research/scenario/[geographyCode]`, `components/research/ScenarioLabClient.tsx` |
| Refresh engine v3 + quality gates + freshness | Real, tested, but **no dataset has completed a full tracked production/branch execution yet** (all show `manual_review`) | `warehouse/scripts/orchestration/refresh_engine_v3.mjs` |
| Feature-flag mechanism | Real, env-boolean, centralized, tested, defaults all `false` | `lib/warehouse/env.ts`, `lib/warehouse/env.test.ts` |
| Data-ops/freshness console | Real, gated by `DATA_OPERATIONS_ENABLED` | `app/research/data-status` |
| Strategy Generator (Claude-backed) | Real, separate feature, rate-limited | `app/strategy`, `app/api/strategy/generate` |

## 2. Missing capability (genuine Sprint 13 build work)

1. **Unified IA/navigation** merging deal-tools nav and research nav into one
   coherent product (WS2) — today they are two adjacent surfaces, not
   contradictory but not unified either.
2. **National search with disambiguation** across duplicate suburb names,
   keyboard nav, recent-searches for anon users (WS3) — `app/api/v1/search`
   exists but the polished front-end search UX described in WS3 is not yet
   built to spec.
3. **Suburb/postcode profile depth** — some sections (dwelling-type breakdown
   visibility, explicit "data gaps and limitations" panel) need auditing
   against the WS4 checklist; likely partial gaps rather than a full rebuild.
4. **Scenario Lab v2**: 3-way base/conservative/stress comparison, equity
   path, interest-rate stress, break-even — current Scenario Lab is a
   single-scenario affordability tool, not the multi-scenario comparator
   WS6 specifies. This is additive work on top of a real foundation, not a
   rebuild.
5. **Saved suburbs/postcodes as first-class objects distinct from
   property_reports**, plus **tags** — `watchlist_items` covers "saved
   locations + notes" partially; explicit tags and a clean "saved
   comparisons of areas" (as opposed to saved 2-property deal comparisons)
   are not yet modeled. Needs a small additive migration, not a new subsystem.
6. **Watchlist change-detection / "What changed?" panel** (WS9) — does not
   exist yet; the refresh engine's freshness tracking is the right foundation
   to build event generation on top of.
7. **Entitlement/tier schema** (Free/Research/Investor Pro/Professional) —
   not present; `hasFullToolAccess()` is a single boolean gate today, not a
   tiered model. WS11 asks for schema only, not billing.
8. **Cross-user access tests, feature-flag-bypass tests** — need to confirm
   these exist for the *new* saved-research objects; existing RLS tests
   should be audited for coverage, not assumed complete.
9. **Report export (WS16)** — CSV/JSON export exists for `/research/compare`;
   a combined property+area+confidence+sources investment-research PDF/print
   export does not yet exist as a single artifact.
10. **Product analytics event contract** (WS17) — not found in code; needs a
    lightweight internal logger, no third-party tracker.
11. **Production refresh graduation** — Sprint 12 left every dataset in
    `manual_review`; a supervised `--branch-load` execution against the
    validation branch (not production) would let Sprint 13 demonstrate real
    freshness data end-to-end. Requires explicit approval before running
    since it's a database-writing action, even on the validation branch.

## 3. Dependencies

- WS3 (search) and WS4 (profiles) depend on the existing `/api/v1/search`,
  `/api/v1/snapshot` contracts — extend, don't replace.
- WS6 (Scenario Lab v2) depends on WS5 (Analysis Engine v2) formula set for
  shared assumption/sensitivity logic — build the calculation core once,
  reuse in both.
- WS8 (saved workspace) depends on auditing existing RLS on
  `property_reports`/`property_comparisons`/`watchlist_items` before adding
  new tables, so new objects follow the same proven pattern.
- WS9 (watchlist change detection) depends on WS12 freshness data actually
  being populated — currently `manual_review` only, so a supervised refresh
  run (with approval) is a soft dependency for a *meaningful* demo, though
  the event-model code can be built and tested against synthetic freshness
  changes without it.
- WS19 (preview deployment) depends on WS1's Vercel MCP re-auth (human
  action) OR can proceed via the already-working Vercel CLI in this
  environment, and depends on adding the missing `WAREHOUSE_*` /
  `*_ENABLED` env vars to the Preview environment (currently absent —
  meaning research routes would 404 on any existing preview today).
- WS21 (final audit) depends on independently re-querying the validation
  branch rather than trusting Sprint 12's quoted storage numbers.

## 4. Risk

- **Highest risk**: accidentally treating `app/analyse-property` /
  `app/compare-properties` / `app/dashboard` as out-of-scope "legacy" and
  building parallel research-only equivalents — this would directly violate
  the "prefer extending existing architecture" guardrail. Mitigation: WS2's
  IA must explicitly map every Sprint 13 required product area onto an
  existing route/component before creating anything new.
  Note this environment previously showed both agent behaviours in the same
  session (one agent almost certified these features didn't exist); every
  workstream implementer should re-confirm a component is actually thin
  before rebuilding it.
- **Vercel scope confusion**: the CLI and the MCP connector authenticate
  independently; a re-auth of one does not fix the other. Must not assume
  MCP re-auth is unnecessary just because the CLI now works, nor vice versa.
- **Preview env vars**: adding `WAREHOUSE_SUPABASE_URL` /
  `WAREHOUSE_SUPABASE_ANON_KEY` / feature flags to Vercel's Preview
  environment is required for a meaningful WS19 preview, and must use the
  **validation branch's** anon key only, scoped to Preview, never Production.
- **Refresh engine execution**: running `--execute --branch-load` writes to
  the validation database. Even though it is not production, it is a
  database-writing action and requires explicit user approval per the
  guardrails before Sprint 13 runs it.
- **Scope size**: 21 workstreams is more than one sprint's worth of
  autonomous work without checkpoints; will checkpoint per the autonomy rule
  (commit+push+report at ~85-90% context) rather than attempt all 21 in one
  pass.

## 5. Expected branch-database growth

- Schema-only additions expected this sprint: a small number of new tables
  (saved-location objects if `watchlist_items` proves insufficient, tags,
  change-event log, entitlement/tier reference table) — estimated low
  hundreds of KB of schema + indexes, negligible versus the existing 2.68GB
  branch.
- No new bulk datasets are in scope for Sprint 13 (no new jurisdiction
  onboarding requested); growth is from operational metadata (change
  events, analytics events if persisted server-side) which should be
  bounded and periodically prunable.
- Any `--branch-load` refresh run graduates existing `manual_review`
  datasets to tracked status — this rewrites freshness metadata, not new
  raw data volume.

## 6. Expected local-storage growth

- New local test fixtures, migration files, and reports are text
  (SQL/TS/MD/JSON), consistent with the current 11MB `.git`. No raw
  datasets, Parquet, or `.db` files will be added, per guardrails and
  existing `.gitignore` patterns (`*.parquet`, gitignored `local/` build
  outputs already in place and working, as seen in the two incidental
  timestamp diffs reverted above).

## 7. Test strategy

- Keep the existing 163-test vitest suite green; add tests alongside every
  new workstream (RLS/cross-user tests for new saved-research tables,
  feature-flag-bypass tests for any new flags, contract tests for any new
  `/api/v1` additions, export-content tests for the new report export).
- Add a small number of live-process tests for anything touching the
  refresh engine or freshness console, following the existing pattern in
  `refresh_engine_v3.test.ts` / `refresh_engine_v2.test.ts` (real subprocess
  invocation, not mocked).
- Do not weaken `warehouse:check`, `warehouse:lineage:check`, or any
  quality-rule assertions to make new features pass.
- Add browser/E2E smoke tests only against the preview deployment once it
  exists (WS18/19), using real validation-branch data, per the guardrail
  against fabricated fixtures for these smoke tests.

## 8. Preview-deployment strategy

- Continue using the already-linked Vercel project/CLI session in this
  environment for `vercel deploy` (no `--prod`), producing Preview
  deployments only, tied to a dedicated `sprint13/*` branch — never
  `main`.
- Before first deploy, add the missing warehouse env vars
  (`WAREHOUSE_SUPABASE_URL`, `WAREHOUSE_SUPABASE_ANON_KEY`,
  `WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`,
  `DATA_OPERATIONS_ENABLED`, `SCENARIO_LAB_ENABLED`, `PUBLIC_API_V1_ENABLED`)
  to the Preview environment only, using validation-branch values, with
  explicit confirmation before writing (env var changes are visible/shared
  state, so treated as a checkpoint-worthy action, not a silent one).
- Never promote a deployment to Production; never touch the `Production`
  environment variable scope.
- Separately fix the Vercel MCP connector's stale token (human action,
  documented in the Workstream 1 report) so future sessions don't need the
  CLI device-flow workaround.

## 9. Rollback strategy

- All Sprint 13 work lands on a new dedicated branch off
  `feature/national-residential-research-platform-v1`
  (e.g. `feature/sprint13-private-beta`), never on `main`, never merged
  without explicit approval.
- Every migration is additive (`create table if not exists`, new columns
  with defaults, no destructive `DROP`/`TRUNCATE`/`DELETE`), matching the
  existing migration style verified in `warehouse:check`'s sanity rules —
  rollback is "stop deploying/using the new tables," not a down-migration,
  consistent with how Sprint 9-12 handled additive changes.
  a `--branch-load` refresh execution, if run, only touches the validation
  branch; rollback there is re-running `--dry-run`/`--plan` or restoring
  from the branch's own point-in-time recovery if Supabase offers it for
  branches — to be confirmed before that action is taken, not assumed.
- Preview deployments can simply be deleted/superseded; no rollback risk to
  Production since Production is never targeted.

## 10. Workstream sequence (this sprint's plan, subject to context-budget checkpointing)

1. WS0 — reconciliation (this document). **Done.**
2. WS1 — Vercel deployment-access diagnosis report (separate artifact,
   next).
3. WS2 — IA and navigation model mapping existing routes + gaps.
4. WS3 → WS4 — search and profile depth, extending `/api/v1` and existing
   research pages.
5. WS5 → WS6 — Analysis Engine v2 + Scenario Lab v2, sharing one
   calculation core.
6. WS7 — comparison tool upgrade (extend `research/compare`, not rebuild).
7. WS8 → WS9 — saved workspace audit/extension + watchlist change
   detection.
8. WS10 — metric explainability (extend `AboutThisMetric.tsx`).
9. WS11 — beta access/entitlement schema (flags + schema only).
10. WS12 — extend `data-status` console.
11. WS13 → WS15 — security, performance, accessibility passes across
    everything built so far.
12. WS16 → WS17 — report export + analytics event contract.
13. WS18 — release-candidate test suite.
14. WS19 — preview deployment (pending env var approval).
15. WS20 → WS21 — operating pack + final audit/handoff.

Checkpointing per the autonomy rule applies throughout: at ~80% context,
stop starting new workstreams; by ~85-90%, finish the current atomic task,
commit, push to the Sprint 13 branch, update
`warehouse/reports/sprint13_checkpoint.md`, and hand off with the exact
resume instruction.
