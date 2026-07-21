# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 00:35 Australia/Sydney

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `72a71cb`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- **Only commit `41dbcc0` has been pushed to origin.** Commits `b902c9d`,
  `66215e5`, `72a71cb` are local-only — **push before doing anything else
  on resume.**

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

## What's NOT done (Workstreams 4-22)

Nothing has been started on cross-Census harmonisation, the national
population layer, the actual jurisdiction adapters (QLD/SA/WA/TAS rent
sources are *selected* but not *built or loaded*), SA2/LGA-level marts,
research indicators, the map explorer, the expanded comparison workspace,
export functionality, the refresh engine v2, GitHub Actions schedules,
the data-status console expansion, security/performance hardening beyond
WS1's measurement pass, new feature flags, comprehensive testing, any
Sprint 11 migrations, further documentation, or the final report/PR.

This is a **large amount of remaining work** — treat Workstreams 4-22 as
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

## Exact next command

```bash
git push origin feature/australia-property-intelligence-v3
```

(Syncs the 3 unpushed commits to the remote.)

## Exact next task

Begin **Workstream 4** (task #46): cross-Census 2016-2021 harmonisation.
First step: **re-verify** (don't assume) that the official ABS
correspondence files used in Sprint 2 are still accessible at their known
URLs before building on them.

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
