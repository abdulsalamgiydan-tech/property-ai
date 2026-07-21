# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 ~03:15 Australia/Sydney (supersedes the
previous update, written after Workstream 5 — this file now reflects
Workstream 6 completed)

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `b9dce51`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- All commits through `b9dce51` have been pushed to origin — confirmed
  via `git push` immediately after this update. No push needed on resume
  unless new local commits exist.

## Supabase target

- Validation branch: `warehouse-validation`, ref **`lzonauinzatmtytyoems`**
  — the only allowed write target. Re-confirmed live via `list_branches`
  during Workstream 6.
- Production ref **`oshquaxsloolqucwvigc`** — must remain untouched.
  Confirmed zero warehouse schemas at checkpoint time.
- Branch DB size: 2,359 MB. No new Sprint 11 migrations applied yet.
  Workstream 6 made **zero branch writes** (all rent adapters this
  workstream stopped at the local-store stage; branch promotion is
  Workstream 9's job).

## What's done (Workstreams 0-6)

1. **WS0** — Sprint 10 preserved and re-verified. New branch
   `feature/australia-property-intelligence-v3` created and pushed.
   Sprint 10 draft PR NOT created (`gh` CLI unavailable, user approved
   skipping).
2. **WS1** — Capacity audit. Supabase Pro plan confirmed (8,192 MB
   included storage), 4,500 MB kept as the working safety margin. All 5
   comparison-API interfaces measured live (4-101ms).
3. **WS2** — National source discovery for QLD/SA/WA/TAS/ACT/NT,
   live-verified. Free bulk SALES data doesn't exist in any of the 6
   states. RENT is free for QLD, SA, WA (with extra complexity for WA).
4. **WS3** — `jurisdiction_coverage.yml` + contract doc built from WS2.
5. **WS4** — Cross-Census 2016-2021 population harmonisation, COMPLETE
   and loaded to the branch (15,333 SAL + 2,641 POA rows, 100.00%
   reconciliation).
6. **WS5** — National population-demand layer, COMPLETE (61,335 SA2×year
   observations, 2001-2025). Deliberately NOT promoted to the branch —
   deferred to WS9.
7. **WS6** — Remaining jurisdiction rent adapters, COMPLETE:
   - **QLD**: RTA Bond Statistics workbook (single stable URL). Local
     store built and validated — 341,712 rows, suburb/LGA/postcode grain,
     Sep 2017-Jun 2026. Found and fixed a real bug (an "Other"
     bond-count-only dwelling category was silently merging into
     unlabelled null rows).
   - **SA**: Housing Trust Private Rent Report. All 71 quarterly CKAN
     resources (2008-06 to 2026-03) downloaded in full, but only the
     current-format era (2024-09 to 2026-03, 7 quarters) parsed — the
     workbook layout has 3 incompatible eras across that span (legacy
     binary `.xls` pre-2012, then two different modern-xlsx column
     layouts) and this pass deliberately does not fabricate a single
     parser across them. Found and fixed two real bugs: postcode labels
     are numeric cells (were silently producing zero postcode rows), and
     3 of 258 postcodes appear twice per quarter with different values (a
     Metro/Country split) — now quarantined as unresolved.
   - **WA**: DMIRS Rental Bonds Data, structurally different from every
     other source — publishes only RAW individual bond-lodgement records,
     no pre-computed median anywhere. Computed suburb/postcode medians
     in-house from 246,759 raw lodgements across 39 months (Mar 2023-May
     2026), correctly labelled `direct_or_derived='derived'`. A safe
     " WA"/", WA" state-suffix strip recovered 53 otherwise-unresolved
     suburb labels; genuine typos/address fragments (211 of 993 labels)
     correctly left unresolved.
   - **TAS**: rent live-verified as **blocked_access** (not just
     unresearched) — both identified official candidates (CBOS Rental
     Bond Statistics, DOJ Rental Bonds Output Data) return HTTP 403 behind
     Cloudflare bot protection, which this project's guardrails forbid
     bypassing. No adapter will be built for TAS rent.
   - **ACT/NT**: no adapter — confirmed zero sources exist (WS2).
   - All three built adapters (QLD/SA/WA) validated with zero
     duplicate/negative/invalid-period gate failures. **None promoted to
     the branch** — deferred to Workstream 9 per this sprint's
     established scope discipline (same pattern as WS4/WS5).

## What's NOT done (Workstreams 7-22)

Nothing has been started on: local-first data lake catalogue (WS7),
historical sales backfill (WS8), SA2/LGA-level canonical marts (WS9 — the
correspondence files from WS4, the SA2 population layer from WS5, AND now
the QLD/SA/WA rent local stores from WS6 are all ready and waiting on
WS9's schema decisions), research indicators (WS10), map explorer (WS11),
expanded comparison workspace (WS12), export functionality (WS13),
refresh engine v2 (WS14), GitHub Actions schedules (WS15), data-status
console expansion (WS16), security/performance hardening beyond WS1's
measurement pass (WS17), new feature flags (WS18), comprehensive testing
(WS19), any Sprint 11 migrations (WS20), further documentation (WS21), or
the final report/PR (WS22).

This is a **large amount of remaining work** — treat Workstreams 7-22 as
a fresh multi-session effort.

## Unresolved blockers (none sprint-wide)

- Sprint 10 PR: documented, user-approved skip.
- WA sales: licence (`Personal Use License`) compatibility unclear,
  correctly not proceeded past.
- TAS sales: still only search-verified (not live-downloaded) — separate
  from the now-fully-resolved TAS rent finding above.

None of these block the rest of the sprint.

## Commands that must NOT be repeated

- Don't re-run WS0's full Sprint 10 test/build/lint verification as a
  first resume action — it already passed, nothing has changed.
- Don't attempt `gh pr create` without first confirming `gh` is installed
  and authenticated.
- Don't re-run `build_cross_census_harmonisation.mjs` or
  `load_cross_census_harmonisation_to_branch.mjs` — WS4 is complete,
  verified, and committed.
- Don't re-run `build_national_population_layer.mjs` — WS5 is complete
  and committed. Query `warehouse/data/local/national_population.duckdb`
  directly when WS9 needs it.
- Don't re-run `build_qld_rents_local_store.mjs`,
  `build_sa_rents_local_store.mjs`, `download_sa_rents.mjs`, or
  `build_wa_rents_local_store.mjs` — all three are complete, validated,
  and committed. Raw files already on disk (gitignored):
  `warehouse/data/raw/qld_rents/`, `warehouse/data/raw/sa_rents/` (all 71
  quarters), `warehouse/data/raw/wa_rents/`. Query
  `warehouse/data/local/{qld,sa,wa}_rents.duckdb` directly when WS9 needs
  them.
- Don't attempt to build a TAS rent adapter or re-check CBOS/DOJ
  Tasmania's sites — both are confirmed Cloudflare-blocked, bypassing
  which is forbidden by this project's guardrails.

## Exact next command

```bash
git status --short && git log --oneline -3
```

(Confirm clean tree and current HEAD before starting new work — all
commits through `b9dce51` are already pushed, no push needed unless this
resume session created new local commits since.)

## Exact next task

Begin **Workstream 7** (task #49): local-first national data lake
catalogue. Per the sprint spec this needs
`warehouse/scripts/storage/audit_local_storage.mjs`,
`plan_local_cleanup.mjs`, and `verify_gitignored_data.mjs` — an inventory
of everything now sitting in `warehouse/data/raw/` and
`warehouse/data/local/` across all workstreams so far (ASGS boundaries,
Census/correspondence files, SA2 population, QLD/SA/WA rent raw+local
stores), confirming total local disk usage, gitignore correctness, and a
documented retention/cleanup policy. This is a smaller, largely
mechanical workstream — a good one to knock out before the larger WS8
(historical sales backfill) or WS9 (canonical marts) efforts.

## Resume verification checklist

Before doing anything else on resume:

1. `git status --short` — confirm still on
   `feature/australia-property-intelligence-v3`, clean.
2. Confirm HEAD is `b9dce51` (or later if this checkpoint file itself
   shows a newer commit — always trust the actual git log over this
   document if they ever disagree).
3. Confirm no interrupted database transaction (no Sprint 11 migrations
   have been applied yet, and WS6 made zero branch writes — nothing to
   check here specifically, but always verify before any future
   migration/branch-write work).
4. Confirm `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` still points at
   `lzonauinzatmtytyoems`, never `oshquaxsloolqucwvigc`.
5. Resume Workstream 7.

## Scheduled resume

Scheduled via the `ScheduleWakeup` tool immediately after this checkpoint
was written — see the tool call result for the exact time.
