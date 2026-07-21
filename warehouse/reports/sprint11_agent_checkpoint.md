# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 00:35 Australia/Sydney (superseded by
an update at 2026-07-22 01:45 Australia/Sydney after Workstream 4
completed — this file reflects the update)

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `2746fb4`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- All commits through `2746fb4` have been pushed to origin — confirmed
  via `git push` immediately after this update. No push needed on resume
  unless new local commits exist.

## Supabase target

- Validation branch: `warehouse-validation`, ref **`lzonauinzatmtytyoems`**
  — the only allowed write target.
- Production ref **`oshquaxsloolqucwvigc`** — must remain untouched.
  Confirmed zero warehouse schemas at checkpoint time.
- Branch DB size: 2,359 MB. No new Sprint 11 migrations applied yet.

## What's done (Workstreams 0-3)

1. **WS0** — Sprint 10 preserved and re-verified (48/48 tests, build,
   lint at baseline, warehouse:check all pass). New branch
   `feature/australia-property-intelligence-v3` created and pushed.
   **Sprint 10 draft PR was NOT created** — `gh` CLI unavailable, no
   token. User explicitly approved skipping this and continuing (not a
   sprint blocker). Manual creation instructions are in
   `warehouse/reports/sprint10_pr_handover.md`.
2. **WS1** — Capacity audit. Corrected finding: Supabase org is on the
   **Pro plan (8,192 MB included storage)**, not the 4,500 MB previously
   assumed — kept 4,500 MB as the working safety margin anyway. All 5
   comparison-API interfaces measured live (4-101ms, comfortable margin).
   One optimisation candidate (ILIKE search has no index) documented for
   WS17, not fixed yet.
3. **WS2** — National source discovery for QLD/SA/WA/TAS/ACT/NT,
   live-verified (not search-snippet-only). **Key finding: free bulk
   SALES data doesn't exist in any of the 6 states** — all paid or
   blocked. **RENT is free for QLD, SA, and WA** (WA needs extra
   in-house median-computation work since its source is raw lodgements,
   not pre-aggregated). TAS got lighter (search-only) verification,
   flagged for follow-up. ACT and NT both confirmed zero results on
   their official portals — national-context-only this sprint.
4. **WS3** — `jurisdiction_coverage.yml` + contract doc, built directly
   from WS2. Key finding: supply/demographic context is already national
   for all 8 jurisdictions (confirmed, not assumed). `land_values`,
   `vacancy`, `planning_pipeline` are honestly documented as unavailable
   **everywhere**, including NSW/VIC — a genuine national gap, not
   jurisdiction-specific.

5. **WS4** — Cross-Census 2016-2021 population harmonisation, COMPLETE.
   Downloaded (verified live, not assumed) the official ABS 2016->2021
   correspondence files (SA1/SA2/LGA/POA/SAL — SA1/SA2/LGA downloaded but
   not yet used, reserved for WS9) and the 2016 Census G01 population
   table at SSC/POA grain. Built a population-weighted conversion,
   reconciling to **100.00%** of Australia's true 2016 population for
   both SAL and POA. Loaded to the branch as a pure UPDATE of the
   existing (previously always-NULL) `population_2016` /
   `population_growth_2016_2021_pct` columns — no schema change, no new
   rows, no DELETE, zero storage growth. 15,333/15,334 SAL and 2,641/2,641
   POA rows now have `population_2016`; 10,935 SAL and 2,596 POA have a
   publishable growth rate (suppressed below a 50-person base).
   Independently re-verified via a separate read-only query after commit.

## What's NOT done (Workstreams 5-22)

Nothing has been started on the national ERP/Regional Population layer
(WS5), the actual jurisdiction adapters (QLD/SA/WA/TAS rent sources are
*selected* but not *built or loaded* — WS6), SA2/LGA-level marts (WS9,
though the correspondence files needed for it are already downloaded),
research indicators, the map explorer, the expanded comparison workspace,
export functionality, the refresh engine v2, GitHub Actions schedules,
the data-status console expansion, security/performance hardening beyond
WS1's measurement pass, new feature flags, comprehensive testing, any
Sprint 11 migrations, further documentation, or the final report/PR.

This is a **large amount of remaining work** — treat Workstreams 5-22 as
a fresh multi-session effort, not something to rush.

## Unresolved blockers (none sprint-wide)

- Sprint 10 PR: documented, user-approved skip.
- Tasmania: verification incomplete, flagged for WS6 follow-up.
- WA sales: licence (`Personal Use License`) compatibility unclear,
  correctly not proceeded past — needs human judgement if ever revisited.

None of these block the rest of the sprint.

## Commands that must NOT be repeated

- Don't re-run WS0's full Sprint 10 test/build/lint verification as a
  first resume action — it already passed, nothing has changed.
- Don't re-download the QLD/SA rent probe files again for verification —
  their structure is already documented in the manifests. Only download
  for real when building the WS6 adapter, to a permanent
  `warehouse/data/raw/` location.
- Don't attempt `gh pr create` without first confirming `gh` is installed
  and authenticated.
- Don't re-run `build_cross_census_harmonisation.mjs` or
  `load_cross_census_harmonisation_to_branch.mjs` — WS4 is complete,
  verified, and committed. The 5 correspondence CSVs and the 2016 Census
  SSC/POA zips are already downloaded to
  `warehouse/data/raw/abs_correspondence/` and
  `warehouse/data/raw/census_2016/` (gitignored, but present on disk —
  don't re-download unless doing a fresh environment setup).

## Exact next command

```bash
git status --short && git log --oneline -3
```

(Confirm clean tree and current HEAD before starting new work — all
commits through `2746fb4` are already pushed, no push needed unless this
resume session created new local commits since.)

## Exact next task

Begin **Workstream 5** (task #47): national population-demand layer.
Add official ABS population context beyond the static 2021 Census —
target datasets: Estimated Resident Population (ERP), Regional Population.
First step: WebSearch + live verification (same pattern as WS2/WS4) of
the current ABS ERP/Regional Population product page and its actual
geography grain (national ERP is typically published at SA2 grain, not
suburb/postcode — verify, don't assume, before committing to a build
approach). Do not use population *projections* in historical metrics —
only observed ERP.

## Resume verification checklist

Before doing anything else on resume:

1. `git status --short` — confirm still on
   `feature/australia-property-intelligence-v3`, clean.
2. Confirm HEAD is `72a71cb` (or later if this checkpoint file itself
   shows a newer commit — always trust the actual git log over this
   document if they ever disagree).
3. Confirm no interrupted database transaction (no Sprint 11 migrations
   have been applied yet, so there's nothing to check here specifically
   — but always verify before any future migration work).
4. Confirm `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` still points at
   `lzonauinzatmtytyoems`, never `oshquaxsloolqucwvigc`.
5. Push the 3 unpushed commits (see "exact next command" above).
6. Resume Workstream 4.

## Scheduled resume

**2026-07-22 01:10 Australia/Sydney**, via the `ScheduleWakeup` tool,
called immediately after this checkpoint was written.
