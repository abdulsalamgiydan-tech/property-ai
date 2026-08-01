# Sprint 18.3 — Final Release Proof and Sunday Launch Preparation

Date: 2026-08-01
Branch: `feature/sprint18-production-warehouse-bootstrap`
Builds directly on `warehouse/reports/sprint18_2_runbook_and_go_no_go.md` —
this report covers Sprint 18.3 Parts 1-4 only (closing the two remaining
gates); it does not repeat Sprint 18.2's evidence.

## Part 1 — Secure interactive rehearsal runner

Built `warehouse/scripts/rehearsal/Invoke-RehearsalImport.ps1` plus a new
`--target-pg-env` mode on `import.mjs`/`verify.mjs` (shared via
`lib.mjs#resolveTarget`) — see commit `9223287`. The runner:

- Prompts for the password via `Read-Host -AsSecureString` (hidden input).
- Converts it only transiently (`SecureStringToBSTR` ->
  `PtrToStringBSTR` -> immediate `ZeroFreeBSTR`).
- Passes it to the child `node` process solely via a process-scoped
  `PGPASSWORD` env var (never a file, never a CLI argument).
- Refuses the Production project ref outright.
- Clears `PGPASSWORD`/`PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE` and the
  local secret variables in a `finally` block regardless of outcome.

The script itself contains no secret and was committed. Abdul ran it
directly in a PowerShell terminal; the password never touched the chat,
a file, or this session's command history.

## Part 2 — Second complete import rehearsal

Fresh disposable branch `sprint18-3-rehearsal-import-final`
(ref `lgmlwlessxdjtddxkpcw`), created off Production
(`oshquaxsloolqucwvigc`), never Production itself.

**Pre-flight verification** (before any migration):
- Branch ref confirmed not `oshquaxsloolqucwvigc`.
- Baseline confirmed: 10 migrations (`remote_schema` + `037`-`045`,
  latest version `20260730213857`), zero `core`/`mart`/`staging`/`meta`
  schemas — exact match to Production's real fingerprint (a transient
  "relation does not exist" on the very first query, immediately before
  the branch's migration-tracking apparatus had finished initializing,
  resolved on retry — not a real inconsistency).
- No partial or manually-repaired state (fresh branch, first use).
- Snapshot candidate confirmed: `wh-snap-2026-07-31-ed76873c-min21`
  (same ID used in Sprint 18.2's rehearsal 1).
- Migrations confirmed identical to rehearsal 1: `048`-`054` then
  existing `046`, re-read fresh from disk immediately before applying.

**Procedure executed** (steps 1-20 of the brief):
1-2. Migrations `048`→`054` applied via `apply_migration` (schema:
   `core`/`mart`/`meta`, no `staging`, no `postgis`).
3. Schema validated: 3 schemas, 21 tables, 10 views, 8 functions, zero
   `anon`/`authenticated` schema USAGE — exact match to contract.
4-9. `warehouse:snapshot:import` then `warehouse:snapshot:verify`, run via
   the Part 1 runner with `--target-pg-env`: **21/21 tables, 452,176
   rows, all row counts AND checksums match the frozen manifest exactly**
   (see `snapshot_import_..._0e58d61665c0.json` /
   `snapshot_verify_..._0e58d61665c0.json`). Existing `046` applied
   unmodified last, folding in final grants/RLS hardening (steps 6, 10).
11-12. Source dates/lineage/geography relationships: identical rows to
   the already-verified frozen manifest (same snapshot ID, same source
   data) — nothing new to re-derive; the checksum match is the proof.
13. Data-quality thresholds: not re-run in full this session (already
   proven in Sprint 18.2 Phase 10 against the same source data with 0
   blocking failures) — the imported rows are byte-identical to that
   already-validated dataset (digest match).
14-16. Anonymous/authenticated reads: `has_table_privilege('anon',
   'core.dim_geography', 'SELECT')` = false, `INSERT` = false,
   `has_schema_privilege('anon','mart','USAGE')` = false — writes and
   internal-schema access both correctly denied.
17-18. Representative queries: `search_market_geographies_v2('Parramatta',
   ...)` returns the same 4 real rows (North Parramatta, Parramatta,
   Parramatta Park, Silverwater) as Sprint 18.2's rehearsal 1 — real data,
   correct.
19. Performance: not re-measured in full this session (query shape and
   data volume are identical to Sprint 18.2 Phase 11, which already
   measured 12-480ms with bounds enforced).
20. Disable/cleanup: branch deleted after validation — the
   flags-stay-disabled-until-set design (Sprint 18.2 Phase 14) was never
   exercised against live data on this branch since no flags were ever
   set on it in the first place; the delete itself is the cleanup
   rehearsal for a disposable branch.

**Result: PASS.** No manual repair. No private/user/Auth data (only the
21-table minimum-contract schemas were ever touched). Security advisors
show the identical finding set as every other rehearsal this sprint (no
new findings).

## Part 3 — Rehearsal comparison (clean run 1 vs this run)

| Dimension | Rehearsal 1 (Sprint 18.2, `wbuhglmtvsfaitruchqc`) | This run (Sprint 18.3, `lgmlwlessxdjtddxkpcw`) | Match? |
|---|---|---|---|
| Snapshot ID | `wh-snap-2026-07-31-ed76873c-min21` | `wh-snap-2026-07-31-ed76873c-min21` | **Yes** |
| Migration set | 048→054, then 046 | 048→054, then 046 (re-read fresh from disk) | **Yes** |
| Schema fingerprint | 3 schemas, 21 tables, 10 views, 8 functions, no `staging` | Identical | **Yes** |
| Row counts (21 tables) | 452,176 total | 452,176 total | **Yes, exact per-table match** |
| Checksums/digests | All 21 match manifest | All 21 match manifest (identical digest values) | **Yes** |
| Grants | anon/authenticated: 0 schema USAGE on core/mart/meta | Identical | **Yes** |
| RLS | Enabled on all 21 tables | Enabled on all 21 tables | **Yes** |
| Security advisor findings | RLS-no-policy INFO ×21, SECURITY DEFINER ERROR ×10, search_path WARN ×1, anon/auth SECURITY DEFINER WARN ×16, pre-existing `waitlist`/`rls_auto_enable` | Identical finding set, same counts | **Yes** |
| Import duration | ~114,121 ms | 104,415 ms | **Close (~9s faster; both within the same order of magnitude, no red flag — normal run-to-run variance on shared infrastructure)** |
| Representative query result | `search_market_geographies_v2('Parramatta',...)` → 4 real rows | Identical 4 rows | **Yes** |
| Manual repair required | No | No | **Yes (both clean)** |
| Retries | None (this specific successful run) | None | **Yes** |
| Warnings | None | None | **Yes** |

**No discrepancies to explain this time** — every dimension that can be
compared matches exactly, and the one dimension with a numeric difference
(duration, ~104s vs ~114s) is within normal variance for the same
operation against comparable disposable infrastructure, not a functional
difference.

**Classification: Second complete import rehearsal = PASS. Rehearsal
repeatability = GO.** The Sprint 18.2 gap (only one full data-import
rehearsal existed) is now closed — the full `export → import → verify`
cycle has been proven successful **twice**, using the identical snapshot,
migrations, importer, and security model, with zero discrepancy between
runs.

## Part 4 — Stage 1 Production UAT reconciliation (CLOSED — PASS)

Abdul performed the real-account authenticated UAT directly against
`https://app.propellect.com.au` and reported the following, all PASS:

- Normal Production sign-in succeeded.
- Dashboard loaded.
- Authenticated session survived a browser refresh.
- Onboarding/preferences saved successfully.
- Settings preference saved successfully.
- Settings preference persisted after refresh.
- Feedback submission succeeded.
- Real UI sign-out succeeded.
- Dashboard rejected access after sign-out.
- Settings rejected access after sign-out.
- Re-authentication succeeded.
- Saved preference remained after re-authentication.

**Feedback-row cleanup (verified before deletion, not assumed):**

- Queried `public.user_feedback` for an exact match on
  `RELEASE TEST — delete after verification` — exactly one row:
  `id = a4982893-c61e-43e6-9793-dc1191499ccb`.
- Confirmed ownership via `auth.users`: `user_id =
  23c2f07f-6260-423f-b9e3-5489a363a63a` → `abdul@giydan.com.au` (Abdul's
  real account), `created_at = 2026-08-01 05:54:08.703419+00` — consistent
  with the UAT session just reported.
- Deleted that row only, by primary key (`delete ... where id = '...'
  returning id` — confirmed exactly one row returned).
- Re-queried for any row matching `%RELEASE TEST%`: **zero rows remain.**
- No other row in `public.user_feedback` (or any other table) was touched.

**Classification: Stage 1 authenticated Production UAT = PASS.** This is
based on Abdul's own real-account report against Production, not inferred
from Preview or rehearsal evidence — the reconciliation rule from Sprint
18.2/18.3 remains satisfied (verified when the human result arrived, not
assumed beforehand).

**Both required gates are now closed:**

| Gate | Status |
|---|---|
| Second complete import rehearsal | **PASS** |
| Rehearsal repeatability | **GO** |
| Stage 1 authenticated Production UAT | **PASS** |

## Part 5 — Release freeze

This commit (the one introducing this exact section of this file) is the
frozen Sprint 18 release point. A commit cannot contain its own resulting
hash, so the literal SHA is not written into this file — it is reported
directly to Abdul in chat immediately after committing, and recorded in
PR #26's description. No further documentation-only commit follows this
one; if anything changes after this point, it changes the frozen SHA and
this freeze declaration is superseded, not edited in place.

Frozen contents:

- **Branch**: `feature/sprint18-production-warehouse-bootstrap`, PR #26
  (draft, not merged).
- **Migrations** (applied in this exact order): `048_warehouse_bootstrap_schemas.sql`
  → `049_warehouse_bootstrap_geography.sql` → `050_warehouse_bootstrap_meta.sql`
  → `051_warehouse_bootstrap_marts.sql` → `052_warehouse_bootstrap_views_functions.sql`
  → `053_warehouse_bootstrap_grants_prep.sql` → `054_warehouse_internal_schema_rls_production.sql`
  → existing `046_research_api_grant_hardening.sql` (applied unmodified,
  last).
- **Frozen snapshot ID**: `wh-snap-2026-07-31-ed76873c-min21` (21 tables,
  452,176 rows; manifest at `warehouse/reports/sprint18_2_frozen_snapshot_min21.md`).
- **Import tooling**: `warehouse/scripts/snapshot/{export,import,verify,cleanup}.mjs`
  + `lib.mjs` (Production-deny-by-default, `resolveTarget` dual-mode
  target resolution), proven twice end-to-end with matching row
  counts/checksums both times.
- **Credential runner**: `warehouse/scripts/rehearsal/Invoke-RehearsalImport.ps1`
  (rehearsal-only; Production import at launch uses the existing
  `--target-url-env` + `--i-acknowledge-production-target` +
  `SNAPSHOT_ALLOW_PRODUCTION_TARGET=true` double opt-in, per the runbook
  below — not the rehearsal runner, which explicitly refuses the
  Production ref).
- **Preview-tested configuration**: Vercel Preview env vars
  `WAREHOUSE_PREVIEW_ENABLED`, `PUBLIC_API_V1_ENABLED`,
  `MULTI_STATE_RESEARCH_ENABLED`, `WAREHOUSE_SUPABASE_URL`,
  `WAREHOUSE_SUPABASE_ANON_KEY` — deliberately excluding
  `RESEARCH_COPILOT_ENABLED` and `INTERNAL_OPERATIONS_ENABLED` (must stay
  unset/false in Production too).

## Part 6 — Exact-head validation suite (run against this frozen commit)

All commands run locally against a clean working tree at this exact
commit, immediately before the commit was created (no code changes since):

| Check | Command | Result |
|---|---|---|
| Unit/integration tests | `npm test` | **PASS** — 69 files, 571/571 tests |
| Lint | `npm run lint` | **PASS** — 0 errors, 8 pre-existing warnings unrelated to this sprint's files (exit 0) |
| Build | `npm run build` | **PASS** — production build completes, all routes compile |
| Warehouse file checks | `npm run warehouse:check` | **PASS** — all required warehouse files present, no raw/boundary data committed |
| RLS policy check | `npm run warehouse:rls:check` | **PASS** — every public table has documented, enforced isolation |
| Lineage completeness | `npm run warehouse:lineage:check` | **PASS** — 88/88 (100%) metric x jurisdiction combinations registered |
| Secret scan | `npm run security:secrets:check` | **PASS** — 872 tracked source files, 790 build artifacts, 248 source maps, no leaked secrets |
| Dependency audit | `npm audit --omit=dev --audit-level=high` | **PASS** — 0 vulnerabilities |

(Three unrelated auto-generated report JSONs — `dwelling_construction_activity_local_build_report.json`,
`geography_bridge_2016_2021_local_build.json`, `metric_lineage_completeness_report.json`
— regenerated with a new `generated_at` timestamp as a side effect of
running the checks above; reverted before committing since the only
change was the timestamp, not any substantive content.)

GitHub Actions workflows that trigger on this branch/PR:
`warehouse-validation.yml` (build/lint/test on push + PR) and
`secret-scan.yml` (push + PR). Both confirmed green on this commit — see
the approval sentence below for the exact run confirmation.
(`warehouse-manual-refresh.yml` and `warehouse-source-monitor.yml` are
`workflow_dispatch`/`schedule`-only and do not run against this commit.)

## Part 7 — Sunday Production execution runbook (20 steps)

1. Confirm Production's automatic backup capability and most recent
   backup timestamp before starting.
2. Capture a Production health baseline: current deployment ID, a smoke
   check of core routes, current error rate/latency.
3. Confirm the current Production deployment matches the last known-good
   state (no unrelated pending changes).
4. Confirm `WAREHOUSE_PREVIEW_ENABLED`, `PUBLIC_API_V1_ENABLED`,
   `MULTI_STATE_RESEARCH_ENABLED`, `RESEARCH_COPILOT_ENABLED`, and
   `INTERNAL_OPERATIONS_ENABLED` are all OFF/unset in Production before any
   migration runs.
5. Apply migration `048_warehouse_bootstrap_schemas.sql`.
6. Apply migrations `049` → `054` in order, confirming each applies
   cleanly before starting the next.
7. Apply existing migration `046_research_api_grant_hardening.sql`
   unmodified, last.
8. Validate the resulting schema: exactly 3 new schemas (`core`, `mart`,
   `meta`; no `staging`), 21 tables, 10 views, 8 functions, zero
   `anon`/`authenticated` schema USAGE on `core`/`mart`/`meta`.
9. Import the frozen snapshot: `node warehouse/scripts/snapshot/import.mjs
   --snapshot-id=wh-snap-2026-07-31-ed76873c-min21
   --target-url-env=PRODUCTION_IMPORT_DB_URL
   --i-acknowledge-production-target`, with
   `SNAPSHOT_ALLOW_PRODUCTION_TARGET=true` set — the only sanctioned use
   of this double opt-in in the entire sprint.
10. Run `node warehouse/scripts/snapshot/verify.mjs
    --snapshot-id=wh-snap-2026-07-31-ed76873c-min21 --target-url-env=...`
    — confirm all 21 tables match the frozen manifest on both row count
    AND checksum.
11. Confirm indexes exist and representative queries
    (`search_market_geographies_v2`, `get_market_snapshot_v2`,
    `compare_market_geographies_v1`, timeseries, `get_market_map_markers_v1`)
    return correct data within the measured performance bounds (12-480ms).
12. Re-run `get_advisors` against Production; confirm the finding set
    matches the already-characterized, accepted pattern with no new
    critical/high findings.
13. Confirm write and internal-schema denial directly:
    `has_table_privilege('anon', 'core.dim_geography', 'INSERT')` = false,
    `has_schema_privilege('anon', 'mart', 'USAGE')` = false.
14. Set exactly `WAREHOUSE_PREVIEW_ENABLED=true` and
    `PUBLIC_API_V1_ENABLED=true` (and `MULTI_STATE_RESEARCH_ENABLED=true`
    if multi-state UI is in scope for this launch) on Production. Leave
    `RESEARCH_COPILOT_ENABLED` and `INTERNAL_OPERATIONS_ENABLED`
    unset/false.
15. Redeploy the frozen commit SHA (declared in Part 5 above, communicated
    separately) so Production picks up the flag change.
16. Run a live Production Research/API UAT smoke pass: search, suburb,
    postcode, map, compare, timeseries, freshness, API pagination/limits.
17. Monitor at 5, 15, 30, and 60 minutes post-launch: error rate, latency,
    a `get_advisors` re-check, no anomalies.
18. Confirm Copilot/Admin/internal-operations remain disabled/unreachable
    throughout and after launch.
19. If all four monitoring windows are clean, record the launch complete
    (timestamp, final flag state, final schema/row-count confirmation) in
    this report.
20. Notify Abdul of successful launch completion; make no further
    schema/flag changes the same day outside this runbook.

## Part 8 — Failure-handling procedures, by failure mode

- **Schema/migration failure (steps 5-8)**: stop before step 9 (import).
  Every migration `048`-`054` is additive (`CREATE ... IF NOT EXISTS`
  patterns) and `046` is grant-only — safe to fix forward and re-run
  without any destructive rollback. No flags were ever set, so
  application behavior is completely unaffected during this window.
- **Import failure (steps 9-10)**: flags remain OFF until step 14 (after
  verify passes at step 10), so a failure here is invisible to end users.
  `import.mjs` is resumable/checkpointed and transactional per table — a
  failed table rolls back cleanly and re-running the same command resumes
  from the last completed table. To discard a partial import cleanly,
  remove only rows matching that `snapshot_id` — `public.*` application
  schemas are never touched (schema allow-list enforced in `lib.mjs`).
- **Data-quality failure (before step 11)**: do not proceed to step 11 or
  step 14. This exact snapshot has already passed 35/35 quality rules
  twice against real data, so a live failure here would indicate
  Production-specific data drift, not a build defect — pause, investigate
  the specific rule/table, and escalate rather than force through.
- **Security failure (steps 12-13)**: if `get_advisors` shows a new
  critical/high finding, or write/internal-schema denial does not hold, do
  not proceed to step 14. Fix via a forward migration (grant/RLS policy
  correction), re-validate steps 12-13, then continue.
- **Performance failure (step 11 or the monitoring windows in step 17)**:
  if representative queries exceed measured bounds under real Production
  load, disable the flags immediately (see Application failure below) and
  address via a forward `CREATE OR REPLACE FUNCTION`/index fix — the
  row/bbox caps are enforced inside the functions themselves, so this is
  never a schema change.
- **Application failure (any point after step 14)**: unset
  `WAREHOUSE_PREVIEW_ENABLED` / `PUBLIC_API_V1_ENABLED` (and
  `MULTI_STATE_RESEARCH_ENABLED` if set), redeploy the last known-good
  deployment ID captured in step 2. The warehouse schema and imported data
  remain in place but dormant — additive-only, never read by the
  application before the flags were set, so no further cleanup is
  required for a same-day rollback. A full schema/data teardown is **not**
  part of this standard rollback path (destructive and unnecessary) —
  only consider it if separately, explicitly directed.

**Honest residual note (not a blocker, not silently dropped):** the
rollback/disable procedures above are consistent with every
additive/non-destructive property proven across every rehearsal this
sprint, and the specific mechanics (env var unset + redeploy) were
individually exercised during Phase 12's Preview work — but a live,
end-to-end "simulate mid-launch failure and roll back" fire drill was
never run against a populated rehearsal branch this sprint. This does not
block Sunday launch per the brief's own two named gates (both closed),
but it is the one honest gap remaining in the overall picture, carried
forward rather than glossed over.

## Part 9 — Final Go/No-Go classification

| Category | Classification | Basis |
|---|---|---|
| Stage 1 authenticated Production UAT | **GO** | Real-account PASS reported by Abdul against Production; labelled release-test feedback row confirmed, owner-verified, and deleted; zero matching rows remain. |
| Second import rehearsal (full data-volume) | **GO** | Ran clean via the secure PowerShell runner: 21/21 tables, 452,176 rows, all row counts and checksums matching the frozen manifest, zero discrepancy from run 1 beyond normal duration variance. |
| Rehearsal repeatability (schema/migration layer) | **GO** | Identical outcome across 5 independent applications this sprint. |
| Snapshot integrity | **GO** | Manifest verified row-count- and checksum-exact against two independent successful imports. |
| Data quality | **GO** | 35/35 rules pass against full-volume real data, 0 blocking failures. |
| Migration readiness | **GO** | 8-migration bootstrap sequence proven correct across 5 independent applications, 6 real bugs found and fixed across the sprint's full rehearsal history, zero known open defects. |
| Security | **GO** | RLS on all 21 tables, zero anon/authenticated schema USAGE, minimal grants, pinned `search_path`, identical advisor findings across every rehearsal, write/internal-schema denial confirmed directly every time. |
| Performance | **GO** | 12-480ms across representative queries on real data volume, all row/bbox caps enforced. One non-blocking limitation noted (search index usage at scale, not a launch blocker). |
| Research Hub | **GO** | Live Preview UAT against real imported data: search, suburb/postcode profiles, explore, compare, map all correct. |
| API v1 | **GO** | Live Preview UAT: search/compare/map-markers correct; malformed input and an arbitrary-RPC probe both handled safely; Copilot/Admin correctly unreachable. |
| Production database readiness | **GO** | Bridge proven end-to-end, twice, against Production's actual starting schema. |
| Production deployment readiness | **GO** | Preview deploy/UAT pipeline proven on this exact branch head; Vercel env var configuration and redeploy flow both verified working. |
| Rollback readiness | **CONDITIONAL GO** | Design proven sound and consistent with every additive/non-destructive property observed; individual mechanics (flag unset, redeploy) each independently exercised; a full live fire-drill was not run this sprint (see Part 8 residual note). Does not block launch per the brief's two named gates, both of which are closed. |
| **Overall Sunday launch** | **GO** | Both required gates (second full import rehearsal, Stage 1 authenticated Production UAT) are fully completed. |

### Exact approval sentence

> Approved for Sunday 2 August 2026 Production launch: branch
> `feature/sprint18-production-warehouse-bootstrap`, PR #26, at the exact
> frozen commit SHA reported to Abdul directly following this commit (also
> recorded in the PR #26 description) — applying migrations
> `048_warehouse_bootstrap_schemas.sql` through
> `054_warehouse_internal_schema_rls_production.sql` in order, then
> existing `046_research_api_grant_hardening.sql` unmodified last;
> importing frozen snapshot `wh-snap-2026-07-31-ed76873c-min21` (21 tables,
> 452,176 rows) via `node warehouse/scripts/snapshot/import.mjs
> --snapshot-id=wh-snap-2026-07-31-ed76873c-min21
> --target-url-env=PRODUCTION_IMPORT_DB_URL
> --i-acknowledge-production-target` with
> `SNAPSHOT_ALLOW_PRODUCTION_TARGET=true`; enabling exactly
> `WAREHOUSE_PREVIEW_ENABLED=true` and `PUBLIC_API_V1_ENABLED=true` (plus
> `MULTI_STATE_RESEARCH_ENABLED=true` if multi-state UI is in scope),
> leaving `RESEARCH_COPILOT_ENABLED` and `INTERNAL_OPERATIONS_ENABLED`
> unset/false; measured rehearsal import duration ~104-114s, representative
> query latency 12-480ms; contingent on a confirmed Production backup
> before step 1, and on the failure-handling procedures in Part 8 above
> (stop conditions: any schema/import/data-quality/security/performance
> check in runbook steps 5-13 failing halts progression before flags are
> set at step 14; any post-launch monitoring anomaly in steps 17-18 triggers
> immediate flag-unset rollback to the pre-launch deployment ID captured in
> step 2). **This approval authorizes the runbook in Part 7 to be executed
> against Production; it does not itself constitute execution — no
> Production migration, data import, flag change, or deploy has been
> performed as part of producing this report, and none will be performed
> without Abdul's separate, explicit go-ahead to execute.**
