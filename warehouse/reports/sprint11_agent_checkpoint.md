# Sprint 11 Agent Checkpoint

**Sprint**: Australian Residential Property Intelligence V3 (National
Coverage, Historical Harmonisation, Research Indicators, Automated
Operations and Production Candidate)

**Checkpoint written**: 2026-07-22 ~07:35 Australia/Sydney (supersedes the
previous update, written after Workstream 8 — this file now reflects the
first Workstream 9 sub-pass: QLD/SA/WA rent promoted to the branch)

## Git state

- Branch: `feature/australia-property-intelligence-v3`
- Commit: `1926c35`
- Working tree: **clean**
- Base: Sprint 10's `feature/deal-analyser-budget-2026` HEAD (`599beae`),
  preserved unmodified, no commits rewritten
- All commits through `1926c35` have been pushed to origin.

## Supabase target

- Validation branch: `warehouse-validation`, ref **`lzonauinzatmtytyoems`**
  — the only allowed write target. Re-confirmed live via `list_branches`
  at the start of this resume.
- Production ref **`oshquaxsloolqucwvigc`** — confirmed zero warehouse
  schema tables at this checkpoint (re-verified live).
- Branch DB size: **2,629 MB** (was 2,359 MB before this session) — grew
  from this session's first real branch write (QLD/SA/WA rent + migration
  018). Comfortably under the 4,500 MB internal working ceiling.
- **Migration 018 applied**: `mart.lga_rent_quarterly` (new table).

## What's done (Workstreams 0-8, plus WS9 sub-pass 1)

Summary of 0-8 (see prior checkpoint commits for full detail): Sprint 10
preserved; capacity audit; national source discovery; coverage contract;
2016-2021 Census harmonisation (loaded to branch); national SA2
population layer (local only); QLD/SA/WA rent + NSW 1990-2000 sales
archive all built and validated locally; local data lake catalogue.

**Workstream 9, sub-pass 1 — QLD/SA/WA rent branch promotion, COMPLETE.**
Migration 018 added `mart.lga_rent_quarterly` (mirrors the existing
suburb/postcode pattern). Building it surfaced and **corrected** a wrong
initial assumption: the 48,024 pre-existing LGA-grain fact rows were
assumed to be VIC's, but are actually **NSW DCJ's own dormant LGA rent
data from Sprint 6** — unqueryable until this migration. VIC has zero
rows in `core.fact_rental_market_summary` at all (its rent lives in
`mart.suburb_market_snapshot` via a separate pipeline). Promoted all
three Workstream 6 local stores: 402,971 fact rows added (QLD 187,952
SAL + 23,345 LGA + 123,088 POA; SA 27,798 SAL + 12,752 POA; WA 19,794 SAL
+ 8,242 POA), plus 78,202 + 33,426 + 13,931 rows across the three
quarterly rent marts. Found and fixed two real bugs: a spread-over-large-
array stack overflow (same class as Workstream 7's) and a missed
expression-based unique index (migration 010's NULL-safe coalesce) the
initial `ON CONFLICT` clause didn't target. Post-load gates all pass (0
duplicates, 0 nulls, 0 negative rents, 0 orphans). QLD/SA/WA rent is now
genuinely queryable for the first time. `jurisdiction_coverage.yml`
updated accordingly.

## What's NOT done — remaining Workstream 9 sub-passes, then 10-22

Per `warehouse/reports/sprint11_ws9_rent_promotion_report.md`'s "What's
still NOT done" section:
- **Yield marts** for QLD/SA/WA — not possible, none of the three has any
  sales data (Workstream 2's finding).
- **`mart.suburb_market_snapshot` / `mart.postcode_market_snapshot`**
  (wide per-geography snapshot tables) not yet extended with QLD/SA/WA —
  requires replicating the fuller NSW/VIC snapshot-assembly logic.
- **NSW's 1990-2000 sales archive** (Workstream 8) not yet promoted.
- **SA2/LGA Census marts** — a promising discovery for the next sub-pass:
  `core.fact_dwelling_stock` and `core.fact_household_tenure` **already
  contain real SA2 and LGA rows** (loaded natively from the same ABS
  Census GCP DataPacks already used for SAL, in an earlier sprint) — this
  likely needs only new mart VIEWS (mirroring
  `mart.suburb_dwelling_stock_2021`/`suburb_demographic_profile_2021`),
  not a new data load.

Then Workstreams 10-22 (research indicators, map explorer, comparison
workspace, export, refresh engine v2, GitHub Actions, data-status
console, security hardening, feature flags, testing, remaining
migrations, docs, final report/PR) are entirely untouched.

## Unresolved blockers (none sprint-wide)

- Sprint 10 PR: documented, user-approved skip.
- TAS sales: still only search-verified (low priority).
- WA sales licence unclear: documented, needs human judgement if revisited.
- WS7's 6.3GB local cleanup plan: written, not executed — human decision pending.

## Commands that must NOT be repeated

- Don't re-run WS0's Sprint 10 re-verification suite as a first resume action.
- Don't attempt `gh pr create` without confirming `gh` is installed/authenticated.
- Don't re-run any WS4/5/6/8 local-store build scripts — all complete and committed.
- Don't attempt a TAS rent adapter or re-check CBOS/DOJ Tasmania — confirmed Cloudflare-blocked.
- **Don't re-run `load_qld_sa_wa_rents_to_branch.mjs --execute`** — already committed to the
  branch. Re-running is technically safe (ON CONFLICT DO NOTHING makes it idempotent) but
  unnecessary and wastes time re-reading 400k+ local rows.
- Don't run the WS7 cleanup plan's `rm -rf` commands without explicit human approval.
- Don't assume `core.fact_rental_market_summary`'s pre-existing LGA rows are VIC's — they are
  NSW's (corrected finding this session, documented in the WS9 report and the live table comment).

## Exact next command

```bash
git status --short && git log --oneline -3
```

## Exact next task

Continue **Workstream 9, sub-pass 2**: build `mart.sa2_dwelling_stock_2021`
and `mart.lga_dwelling_stock_2021` (mirroring
`mart.suburb_dwelling_stock_2021`'s construction exactly) plus the wide
`mart.sa2_demographic_profile_2021` / `mart.lga_demographic_profile_2021`
snapshot tables (mirroring `mart.suburb_demographic_profile_2021`), all
from `core.fact_dwelling_stock` / `core.fact_household_tenure` rows that
**already exist** at SA2/LGA grain on the branch — verify this by
re-querying `select geography_type, count(*) from core.fact_dwelling_stock
f join core.dim_geography g on g.geography_id=f.geography_id group by 1`
before starting, in case anything has changed. This should be achievable
without any new data download — purely new mart-view migrations + INSERT
... SELECT from existing fact data.

## Resume verification checklist

1. `git status --short` — confirm still on
   `feature/australia-property-intelligence-v3`, clean.
2. Confirm HEAD is `1926c35` (trust actual git log over this doc if they disagree).
3. Confirm no interrupted transaction: query
   `select count(*) from core.fact_rental_market_summary` and confirm it
   reads 660,911 (this checkpoint's known-good post-commit value) before
   assuming the last transaction landed cleanly.
4. Confirm `WAREHOUSE_VALIDATION_DB_URL` in `.env.local` still points at
   `lzonauinzatmtytyoems`, never `oshquaxsloolqucwvigc`.
5. Resume Workstream 9, sub-pass 2.

## Scheduled resume

Scheduled via the `ScheduleWakeup` tool immediately after this checkpoint
was written — see the tool call result for the exact time.
