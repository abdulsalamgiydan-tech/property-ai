# Sprint 12 — Final Delivery Report

**All 18 workstreams complete.** This report supersedes
`sprint12_foundation_block_report.md` (which covered only WS3/4/6/8/9/10,
written mid-sprint) as the authoritative final record.

## Branch and commit range

- Branch: `feature/national-residential-research-platform-v1`
- Base: `b3913e1` (Sprint 11's final green commit)
- Final commit: `f05a0bc`
- 24 commits (Phase 0 + WS1-17 + 5 checkpoints)
- GitHub Actions: **green on every single pushed commit**, watched to
  completion individually for every workstream this session (not
  assumed from a single final run)

## Workstream status — all 18 complete

| WS | Title | Commit |
|---|---|---|
| Phase 0 | Branch, PR, capacity plan | `cebec8d` |
| 1 | National coverage audit | `d7fc2fd` |
| 2 | TAS/ACT/NT onboarding | `1862981` |
| 3 | National demand/supply context | `6d6e17e` |
| 4 | 2016-2021 boundary reconciliation | `83db10e` |
| 5 | Research evidence catalogue | `766d061` |
| 6 | National canonical market mart rollup | `1ef0dcf` |
| 7 | Scenario Lab | `0be07b7` |
| 8 | Field-level data lineage | `6942d79` |
| 9 | Automated data-quality/freshness monitoring | `45077ce` |
| 10 | National refresh engine v3 | `8b2ebac` |
| 11 | Versioned public API v1 | `42b3816` |
| 12 | Research interface rebuild | `27df613` |
| 13 | Export and reproducibility | `9556e18` |
| 14 | Security, RLS and access model | `c556e1a` |
| 15 | Performance and storage hardening | `828bff7` |
| 16 | Testing and clean-clone reproduction | `7e39aa0` |
| 17 | Documentation and operations | `f05a0bc` |

## Final live metrics (independently re-queried, not read from a report)

| Metric | Value |
|---|---|
| Quality rules | 44 total (35 active, 9 legacy-preserved) |
| Open incidents | 3 (all advisory, all documented — cross-border postcode anomaly, geography weight reconciliation, source-URL-health false positive) |
| Quarantined rows | 2 (preserved, never deleted) |
| Lineage registry rows | 35 |
| Lineage completeness | 100% (88/88) |
| Registered sources / datasets | 13 / 41 |
| Internal tables (core/mart/meta/staging) | 53 |
| Public views / functions | 11 / 10 |
| Branch storage | 2,679.4 MB (59.5% of the 4,500 MB ceiling; 79.4% of Sprint 12's own 75% budget) |
| Tests | 163 (up from 85 at session start — 78 new) |

## Final validation sweep (this workstream, WS18)

Run fresh, in order, on the final commit:

```
npm ci                                          → pass
npm run warehouse:check                         → pass
node run_quality_check.mjs --execute            → 35 rules, 0 blocking failures
node validate_metric_lineage_completeness.mjs   → 100% (88/88), PASSED
node check_freshness.mjs --execute              → 7 datasets updated
node refresh_engine_v3.mjs --dry-run            → 25 datasets planned, zero writes
npm run lint                                    → 0 errors, 6 pre-existing warnings
npm test                                        → 163/163 pass
npm run build                                   → pass, 40+ routes compile
git diff --check                                → clean
git status --short                              → only regenerated report JSON files
```

Plus a **third, final clean-disposable-clone reproduction** (separate
from the working session, at the exact final commit `f05a0bc`): `npm ci`
→ `warehouse:check` → `test` (155/163 pass, 8 correctly skipped — no
gitignored raw data in a fresh clone) → `lint` → `build`, all green.

## Confirmations

- **Production touched: NO** — re-verified as literally the last database
  action of this entire session: `list_tables` on `oshquaxsloolqucwvigc`
  for `core`/`mart`/`meta`/`staging` returns zero tables, exactly as it
  has after every single commit this session.
- **`main` merged: NO** — this branch was never merged; Sprint 11's PR #4
  remains open and draft.
- **Paid infrastructure added: NO**.
- **Raw data committed: NO** — confirmed via `warehouse:check` and a
  fresh clone containing no `warehouse/data/` directory at all.
- **Secrets committed: NO** — only `.env.example` (a placeholder) is
  tracked.

## What this session actually built, in one paragraph

Starting from a Foundation Block continuation prompt, this session closed
6 core data-layer workstreams (national demand/supply, boundary
reconciliation, canonical mart rollup, field-level lineage, automated
quality monitoring, refresh engine v3), then continued through the full
remaining Sprint 12 scope: a versioned public API exposing that lineage
and quality data for the first time, a research UI that actually surfaces
it (including fixing a real, previously-invisible bug where WS4's
population-growth work was silently never displayed), a reproducible
export system, a security re-audit that found and fixed a real CORS gap,
a performance pass that found and fixed a measured 1000x-slow query, a
dedicated clean-clone testing pass, a documentation consolidation, and
this final validation. Along the way, multiple genuine, previously-unknown
defects were found and **actually fixed**, not just logged: the exact
future-dated-sales bug WS1 flagged was traced to corrupting two live
published mart rows and repaired; a Postgres `NULL <> NULL` uniqueness
gap silently broke idempotency in the lineage registry; a refresh-engine
id-namespace mismatch would have made `--stale` selection permanently
return zero results; a 477ms quality-rule query was found and sped up
over 1,000x.

## Exact recommended next steps (Sprint 12 mission complete)

Sprint 12's full 18-workstream mission is now delivered. Recommended next
steps for a human to consider, none started or assumed here:

1. **Merge review** — this branch has never been merged to `main`; review
   and decide when/whether to do so (still draft-review-only per this
   project's standing rule).
2. **Enable `PUBLIC_API_V1_ENABLED`/`SCENARIO_LAB_ENABLED` in a real
   deployment** if the new public API and Scenario Lab are ready for
   wider use — both are currently disabled by default.
3. **A real, human-supervised `refresh_engine_v3.mjs --execute
   --branch-load` run** — every dataset has been individually validated,
   but no dataset has completed a full tracked orchestrator execution yet
   (`meta.dataset_freshness_status` still shows `manual_review` for all 7
   tracked datasets, honestly).
4. **Root-cause the cross-border postcode anomaly** (WS8/WS9) with access
   to street-level NSW VG source records, if that data becomes available.
5. **`npm audit fix`** review (12 pre-existing vulnerabilities, unrelated
   to this sprint's own dependency additions — none were added this
   sprint).
