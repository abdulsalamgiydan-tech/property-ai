# Sprint 18.2 — Production Runbook, Rollback Strategy, and Go/No-Go

Date: 2026-08-01
Branch: `feature/sprint18-production-warehouse-bootstrap`
Head at time of writing: `9d0f8e4` (PR #26, draft, not merged)

## Phase 13 — Sunday Production runbook

Exact migrations, applied in this order (proven twice on disposable branches
forked from Production's real state — see Phase 9 evidence below):

1. `048_warehouse_bootstrap_schemas.sql` — creates `core`, `mart`, `meta` (no
   `staging`, no `postgis`)
2. `049_warehouse_bootstrap_geography.sql` — `core.dim_geography` (no `geom`)
3. `050_warehouse_bootstrap_meta.sql` — 11 `meta.*` tables
4. `051_warehouse_bootstrap_marts.sql` — 9 `mart.*` tables
5. `052_warehouse_bootstrap_views_functions.sql` — 10 views + 8 functions,
   byte-accurate from warehouse-validation
6. `053_warehouse_bootstrap_grants_prep.sql` — schema-level access hardening
7. `054_warehouse_internal_schema_rls_production.sql` — RLS on the 21 new
   tables
8. `046_research_api_grant_hardening.sql` (existing, applied unmodified) —
   final grant normalization; now guards its `staging` revoke so it applies
   cleanly regardless of whether `staging` exists

`047_warehouse_internal_schema_rls.sql` is **not** part of the Production
sequence — it targets warehouse-validation's full 53-table shape; `054` is
its Production-scoped equivalent.

Runbook steps (per the brief's 16-step structure):

1. Verify Production backup/restore capability (Supabase automatic backups —
   confirm most recent backup timestamp before starting).
2. Capture Production health baseline (current deployment
   `dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf`, core routes, error rate).
3. Confirm current Production deployment unchanged.
4. Confirm Research/API flags remain OFF in Production env vars.
5. Apply migrations 048→054, then 046, via the same `apply_migration`
   mechanism used in rehearsal (or `supabase db push` if the CLI is set up
   for Production by then).
6. Validate schema: expect exactly 3 new schemas, 21 tables, 10 views, 8
   functions, zero `anon`/`authenticated` USAGE on `core`/`mart`/`meta`
   (all confirmed reproducible in Phase 9).
7. Import frozen snapshot `wh-snap-2026-07-31-ed76873c-min21`:
   `node warehouse/scripts/snapshot/import.mjs --snapshot-id=wh-snap-2026-07-31-ed76873c-min21 --target-url-env=PRODUCTION_IMPORT_DB_URL --i-acknowledge-production-target` with `SNAPSHOT_ALLOW_PRODUCTION_TARGET=true` — **the only time in this entire sprint this double opt-in is intentionally exercised.**
8. Validate row counts/checksums against the frozen manifest (452,176 rows /
   21 tables — see `sprint18_2_frozen_snapshot_min21.md`).
9. Validate indexes and run the representative queries exercised in Phase 11.
10. Apply final grants/RLS hardening (already folded into 053/054/046 above
    — no separate step needed).
11. Validate security: re-run `get_advisors` against Production; expect the
    same finding set already characterized in Phase 9 (RLS-no-policy INFO,
    SECURITY DEFINER view/function WARN/ERROR — the pre-existing, deliberate
    Sprint 9 curated-access pattern, not a new issue).
12. Set exactly `WAREHOUSE_PREVIEW_ENABLED=true`, `PUBLIC_API_V1_ENABLED=true`
    (and `MULTI_STATE_RESEARCH_ENABLED=true` if the multi-state UI is in
    scope for this launch) on Production. Leave `RESEARCH_COPILOT_ENABLED`
    and `INTERNAL_OPERATIONS_ENABLED` unset/false.
13. Redeploy the validated main commit if a redeploy is required to pick up
    the flags.
14. Run live Production Research/API UAT (search, suburb, postcode, map,
    compare, timeseries, freshness, API pagination/limits).
15. Monitor at 5, 15, 30, 60 minutes (error rate, latency, Supabase advisor
    re-check).
16. Confirm Copilot/Admin/operations remain disabled throughout.

## Phase 14 — Rollback / disable strategy

- **Application failure**: unset `WAREHOUSE_PREVIEW_ENABLED` /
  `PUBLIC_API_V1_ENABLED`, redeploy `dpl_AtHt2b5xLV7o6YDVsrVdS1LWA2Gf` (the
  current healthy deployment). Warehouse schema stays in place but dormant —
  it is additive-only and was never read before the flags were set.
- **Import failure**: flags stay disabled (never set until step 12, after
  import succeeds). `import.mjs` is resumable/checkpointed
  (`ProgressCheckpoint`) and transactional per table — a failed table rolls
  back cleanly, re-running the same command resumes from the last completed
  table. If a specific snapshot needs to be discarded, remove only rows
  matching that `snapshot_id`'s import — core/user `public.*` schemas are
  never touched by this tool (schema allow-list enforced in `lib.mjs`).
- **Grant failure**: flags stay disabled. Apply a targeted forward-fix
  migration (`055_*`) rather than restoring broad grants — exactly the
  pattern already used for the `046` staging-guard fix this session.
- **Performance failure**: disable flags, retain data, fix indexes/bounds
  via a reviewed forward migration (all row/bbox caps are enforced inside
  the functions themselves, so a bound fix is a function `CREATE OR REPLACE`,
  not a schema change).
- **Schema failure** (steps 5-6): stop before step 7 (import). Every
  migration 048-054 is `CREATE ... IF NOT EXISTS` / additive-only — safe to
  re-run after a fix without a destructive rollback. `046` is grant-only.

None of these paths were exercised against a real disposable branch this
session (see NO-GO blockers below) — the design is sound and consistent with
every additive/non-destructive property already proven in Phase 9, but is
not yet itself rehearsed end-to-end.

## Evidence summary (this session)

| Gate | Status |
|---|---|
| Phase 0 sync + validation suite | **PASS** — 560/560 tests, lint, build, audit (0 vuln), secret scan, warehouse:check/rls:check/lineage:check all clean |
| Phase 8 migrations 048-054 | **PASS** — committed, all `.test.ts` green |
| Phase 9 migration/schema rehearsal | **PASS (twice)**, on two independent disposable branches forked from Production's real state. 2 real bugs found and fixed (`050` GENERATED column, `046` staging-schema guard). Post-fix: exact object counts match contract, zero anon/authenticated schema USAGE, advisors show only the already-accepted Sprint 9 pattern. |
| Phase 9 full-volume data import rehearsal | **NOT DONE** — blocked on a branch DB credential; user explicitly chose to defer this to Sunday with real Production credentials rather than continue troubleshooting. Snapshot data itself is exported and ready (`warehouse/data/snapshots/wh-snap-2026-07-31-ed76873c-min21/`, 452,176 rows, local-only, gitignored). |
| Phase 10 data quality | **PASS** — 35/35 rules against warehouse-validation, 0 blocking failures, 3 pre-existing advisories unrelated to the minimum contract. Coverage confirmed uneven-but-honest (NSW/VIC full, QLD/SA/WA rent-only, ACT/NT/TAS geography-only) and correctly reflected via `confidence_label`/`coverage_status`/`missing_metric_reasons`. |
| Phase 11 performance | **PASS with one noted limitation** — representative `EXPLAIN ANALYZE` on warehouse-validation's real data volume: 12-480ms across 5 functions, all row/bbox caps enforced correctly. `search_market_geographies_v2`'s leading-wildcard `ILIKE` cannot use the name btree index (scans ~20k rows via the type index then filters) — acceptable at current volume, flagged for a future `pg_trgm` index, not a launch blocker. |
| Phase 12 Preview deploy + UAT | **NOT DONE** — Vercel MCP tools are unauthenticated for this session (no linked account) and the Vercel CLI is not installed locally. No protected Preview was deployed or tested. App-code drift check (independent verification): the app's Research/API routes use *exactly* the 18 granted objects, no direct schema access, zero drift. |
| Phase 1 Stage 1 UAT | **PENDING** — checked `public.user_feedback` for a labelled release-test row (none found); this requires Abdul's manual authenticated testing, not something completable from this session. |

## Phase 15 — Go/No-Go

**NO-GO for Sunday 2 Aug 2026 as of this report.**

This is not a quality or security gate failure — every gate that was
actually run passed cleanly, including catching and fixing two real bugs
that would have broken the Production deployment. It is an **incompleteness**
gate: three required proofs are not yet done, and the brief is explicit that
thresholds are not to be lowered to hit the date.

### Precise blockers

1. **Full-volume snapshot import has not been rehearsed end-to-end.** The
   schema/migration bridge is proven; the 452k-row COPY-based import against
   a Production-equivalent target is not. Blocked this session on a branch
   database credential that could not be resolved after several attempts
   (see below) — deferred by explicit user decision, not a technical
   dead-end.
2. **No Production-like Preview has been deployed or UAT'd.** Vercel access
   is not currently available to this session (MCP unauthenticated, CLI not
   installed). The Research/API UAT checklist (search, suburb, postcode,
   map, compare, timeseries, security isolation) has not been executed
   against a live deployment this sprint.
3. **Stage 1 authenticated Production UAT is still outstanding**, per the
   brief's own Phase 1 requirement — this was already known to be pending
   Abdul's manual testing and does not block engineering work, but it does
   block the final Sunday approval sentence.

### Work completed and safe to rely on

- The Option D migration-ordering strategy is not just designed but
  **proven twice** against Production's actual (not idealised) starting
  schema, with two real defects found and fixed as a direct result of that
  rehearsal — this is the single highest-risk item in the whole sprint and
  it is now solid.
- Data quality and performance are validated against real, full-volume data
  (via warehouse-validation, which is a structural superset of what
  Production will hold).
- The application code has zero drift from the exact object surface the
  migrations create.
- Nothing here required lowering RLS, grants, test coverage, or
  data-quality thresholds.

### Smallest remaining plan to reach GO

1. Obtain a working Supabase branch DB password (the credential-handoff
   issue this session was a URL-encoding/copy artifact, now understood and
   fixable), create one disposable branch, run the full import → validate →
   rollback-rehearsal sequence twice, record real durations.
2. Connect Vercel to this session (or install the CLI) and deploy one
   protected Preview from this branch head with the frozen snapshot, flags
   on for Research/API only; run the full UAT checklist from the brief.
3. Receive Abdul's Stage 1 authenticated Production UAT results.
4. Re-run this Go/No-Go with all three gates closed.

None of steps 1-3 require new design work — the tooling, migrations, and
snapshot are already built and proven at the schema level. This is
execution-and-verification remaining, not open engineering risk.
