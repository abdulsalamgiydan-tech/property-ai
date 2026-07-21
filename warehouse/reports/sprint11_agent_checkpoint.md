# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 ~05:00 Australia/Sydney (supersedes the
previous update, written after Workstream 6 — this file now reflects
Workstreams 7 and 8 completed)

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `8076643`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- All commits through `8076643` have been pushed to origin.

## Supabase target

- Validation branch: `warehouse-validation`, ref **`lzonauinzatmtytyoems`**
  — the only allowed write target.
- Production ref **`oshquaxsloolqucwvigc`** — must remain untouched.
- Branch DB size: 2,359 MB. **Zero branch writes this session** (WS7 and
  WS8 are both entirely local-only — no Supabase connection made by any
  script in either workstream).

## What's done (Workstreams 0-8)

Summary of 0-6 (see prior checkpoint commits for full detail): Sprint 10
preserved; capacity audit; national source discovery (QLD/SA/WA/TAS/ACT/NT);
coverage contract; 2016-2021 Census harmonisation (loaded to branch);
national SA2 population layer (local only); QLD/SA/WA rent adapters built
and validated (local only), TAS rent confirmed Cloudflare-blocked.

7. **WS7** — Local-first national data lake catalogue, COMPLETE. Three
   read-only scripts (`audit_local_storage.mjs`, `plan_local_cleanup.mjs`,
   `verify_gitignored_data.mjs`), none of which write or delete anything.
   Inventoried `warehouse/data/`: 9,865.89 MB total. Identified 6,374.55 MB
   of `warehouse/data/processed/` as safe-to-delete scratch space (raw/
   sources still on disk, so re-derivable) — **a pending human-approved-
   only decision, not executed**. See `local_cleanup_plan.md` for the exact
   `rm` commands. Found/fixed two real bugs while building it: a double-MB-
   conversion display bug, and a stack-overflow crash walking the 149k-file
   NSW sales processed tree (switched to an iterative traversal).

8. **WS8** — NSW historical sales backfill (1990-2000), COMPLETE. All 11
   archived annual PSI files downloaded via the `gstack /browse` skill in
   **headed** mode (headless got stuck on Cloudflare's JS challenge; plain
   curl still 403s, unchanged since Sprint 5). Found the format PDF had
   moved to the consolidated `nsw.gov.au` domain (old URL now 404s) and
   located the working copy live rather than guessing. Verified every
   field position against the official fact sheet before parsing. Built
   and validated a local store: 1,917,667 transaction rows. Dwelling-type
   classification is necessarily coarser than 2001-current (no
   `nature_of_property` field in this format) — uses `zone_code='A'`
   (verified against the official Zone Codes fact sheet as the genuine
   residential-zone signal) plus a strata-plan text pattern for ~23%
   medium-confidence `apartment_unit` rows. Found and documented a real
   data-quality characteristic: 1990's `zone_code` NULL rate is 58.3%,
   declining to ~7-9% by the late 1990s — an honest undercount in the
   earliest year, not a defect. Annual median price cross-check ($109k in
   1990 to $205k in 2000) matches known NSW market history. Also evaluated
   (not built) a genuine VIC backfill candidate — Valuer-General Victoria's
   20-year annual Time Series dataset, live-verified and documented for a
   future workstream. **Branch promotion deliberately deferred** — would
   touch the already-live `core.fact_residential_sales_summary` that
   existing comparison APIs read from.

## What's NOT done (Workstreams 9-22)

Nothing has been started on: canonical SA2/LGA marts (WS9 — this is where
WS4's correspondence files, WS5's SA2 population layer, WS6's QLD/SA/WA
rent local stores, AND now WS8's NSW archive local store all get consumed
and promoted to the branch — a substantial, multi-part workstream),
research indicators (WS10), map explorer (WS11), expanded comparison
workspace (WS12), export functionality (WS13), refresh engine v2 (WS14),
GitHub Actions schedules (WS15), data-status console expansion (WS16),
security/performance hardening beyond WS1's measurement pass (WS17), new
feature flags (WS18), comprehensive testing (WS19), any Sprint 11
migrations (WS20), further documentation (WS21), or the final report/PR
(WS22). Also the pending VIC 20-year sales backfill (evaluated, not built)
and the NSW/QLD/SA/WA branch promotions are all queued behind WS9's schema
decisions.

## Unresolved blockers (none sprint-wide)

- Sprint 10 PR: documented, user-approved skip.
- TAS sales: still only search-verified (low priority, likely paid regardless).
- WA sales licence unclear: documented, needs human judgement if revisited.
- WS7's 6.3GB cleanup plan: written, not executed — human decision pending.

## Commands that must NOT be repeated

- Don't re-run WS0's Sprint 10 re-verification suite as a first resume action.
- Don't attempt `gh pr create` without confirming `gh` is installed/authenticated.
- Don't re-run `build_cross_census_harmonisation.mjs`, `load_cross_census_harmonisation_to_branch.mjs`,
  or `build_national_population_layer.mjs` — WS4/WS5 complete and committed.
- Don't re-run `build_qld_rents_local_store.mjs`, `build_sa_rents_local_store.mjs`,
  `download_sa_rents.mjs`, or `build_wa_rents_local_store.mjs` — WS6 complete and committed.
- Don't attempt a TAS rent adapter or re-check CBOS/DOJ Tasmania — confirmed Cloudflare-blocked.
- Don't re-run `audit_local_storage.mjs`/`plan_local_cleanup.mjs` unless new data has been
  added since — re-run is cheap but the existing reports are current as of this checkpoint.
- Don't re-run `build_nsw_sales_archive_local_store.mjs` — WS8 is complete and committed.
  Raw files already on disk (gitignored): `warehouse/data/raw/nsw_sales_archive/` (11 zips
  + 2 format-guide PDFs). Query `warehouse/data/local/nsw_sales_archive.duckdb` directly
  when WS9 needs it.
- Don't run the WS7 cleanup plan's `rm -rf` commands without explicit human approval first.

## Exact next command

```bash
git status --short && git log --oneline -3
```

## Exact next task

Begin **Workstream 9** (task #51): canonical national market marts extended
to SA2/LGA levels. This is the largest consolidation workstream so far — it
needs to design and build the schema for `sa2_market_snapshot` and
`lga_market_snapshot` mart tables, then promote (via safe INSERT/UPDATE,
one migration) the four local-only datasets that have been waiting for it:
WS4's SA1/SA2/LGA correspondence files, WS5's SA2 population layer, WS6's
QLD/SA/WA rent local stores, and WS8's NSW 1990-2000 sales archive. Given
its size, consider whether to split it into sub-passes (e.g. schema design
+ SA2 population first, then QLD/SA/WA rent, then NSW archive extension of
the existing `core.fact_residential_sales_summary`) rather than one single
pass — this decision is left to whoever picks this up next.

## Resume verification checklist

1. `git status --short` — confirm still on
   `feature/australia-property-intelligence-v3`, clean.
2. Confirm HEAD is `8076643` (trust actual git log over this doc if they disagree).
3. No Sprint 11 migrations exist yet and WS7/WS8 made zero branch writes —
   nothing to check for interrupted transactions, but verify before any
   future migration/branch-write work (which WS9 will be the first to do).
4. Confirm `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` still points at
   `lzonauinzatmtytyoems`, never `oshquaxsloolqucwvigc`.
5. Resume Workstream 9.

## Scheduled resume

Scheduled via the `ScheduleWakeup` tool immediately after this checkpoint
was written — see the tool call result for the exact time.
