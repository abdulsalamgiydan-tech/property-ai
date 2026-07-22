# Sprint 12 — National Data Foundation Block — Final Report

## Scope

The "Foundation Block" comprises Workstreams 3, 4, 6, 8, 9, and 10 of the
Sprint 12 "National Residential Property Research Platform" mission — the
data-layer work that everything else (public API, UI rebuild, exports)
depends on. **All 6 are complete.**

## Branch and commit range

- Branch: `feature/national-residential-research-platform-v1`
- Base: `b3913e1` (Sprint 11's final green commit)
- Latest: `8b2ebac`
- 14 commits (6 workstream commits + Phase 0 + WS1/WS2 + 4 checkpoints)
- GitHub Actions: **green on every single pushed commit**, most recently
  watched to completion on `8b2ebac` (run `29912780903`,
  `Build, lint, test, warehouse file checks` — all steps passed)

## Workstream status

| WS | Title | Status | Commit |
|---|---|---|---|
| Phase 0 | Branch, PR, capacity plan | ✅ | `cebec8d` |
| 1 | National coverage audit | ✅ | `d7fc2fd` |
| 2 | TAS/ACT/NT onboarding | ✅ | `1862981` |
| **4** | **2016-2021 boundary reconciliation** | ✅ | `83db10e` |
| **3** | **National demand/supply context** | ✅ | `6d6e17e` |
| **6** | **National canonical market mart rollup** | ✅ | `1ef0dcf` |
| **8** | **Field-level data lineage** | ✅ | `6942d79` |
| **9** | **Automated data-quality/freshness monitoring** | ✅ | `45077ce` |
| **10** | **National refresh engine v3** | ✅ | `8b2ebac` |

## Foundation Block metrics (live, independently re-queried)

| Metric | Value |
|---|---|
| Quality rules registered | 44 total (35 active, 9 legacy-preserved) |
| Blocking rules | 28 |
| Advisory rules | 7 |
| Open incidents | 3 (all advisory, all documented) |
| Quarantined rows | 2 (preserved, never deleted) |
| Lineage completeness | 100% (88/88) |
| Sales confidence-label completeness | 100% |
| Rent confidence-label completeness | 100% |
| Datasets with a tracked freshness status | 7/7 (all `manual_review` — honest, not fabricated) |
| Refresh registry entries | 25 (20 pre-existing + 5 registered this Foundation Block) |
| New database migrations | 025-032 (8 migrations) |
| Tests passing | 148/148 (locally); 140/148 + 8 correctly-skipped from a clean disposable clone |
| Branch storage | 2,673.0 MB (59.4% of the 4,500 MB ceiling; 79.2% of Sprint 12's own 75% budget) |
| Local storage (gitignored) | 2.1 GB |

## Cross-workstream findings (the value of doing these together, in order)

- WS6 found that WS4's population-growth fix, though correctly applied to
  `mart.suburb_demographic_profile_2021`, had never propagated to the
  primary `mart.suburb_market_snapshot` table — fixed.
- WS8's completeness validator found a genuine cross-border postcode
  attribution anomaly that WS9 then turned into a standing, automated
  detection rule (16 cases now caught on every run, vs. WS8's original
  5-postcode manual sample).
- WS9's `future_dated_sales` rule rediscovered and, this time, actually
  **fixed** (not just re-flagged) the exact bug WS1 found and deferred —
  including the previously-unknown fact that it was actively corrupting 2
  published wide-snapshot rows.
- WS10 found that Sprint 12's own datasets (WS2/WS3/WS4/WS6/WS8) had never
  been registered in the orchestrator at all, and that a silent id-
  namespace mismatch meant `--stale` selection would never have worked.

## Final validation (this report)

- `npm ci`, `warehouse:check`, `warehouse:quality:check`,
  `warehouse:lineage:check`, `warehouse:freshness`,
  `warehouse:refresh:dry-run`, `lint`, `test`, `build`, `git diff --check`,
  `git status --short` — all run and passing on the working tree.
- **Re-validated from a completely clean, disposable git clone** (not the
  working session's own checkout): `npm ci` → `warehouse:check` → `test`
  (140/148 pass, 8 correctly skipped — the local-raw-data-dependent
  integration tests, which have no gitignored data to find in a fresh
  clone) → `lint` (0 errors) → `build` — all green.
- All 36 tracked migrations (`003` through `032`, including the pre-
  Sprint-2 remote schema) applied sequentially with no gaps, confirmed via
  `list_migrations` — the branch's entire schema is reconstructible from
  this history.
- Lineage completeness 100%, confidence-label completeness 100% (both
  independently re-queried, not read from a script's own report).
- Freshness: all 7 tracked datasets have a populated status (honest
  `manual_review`, not fabricated `current`).
- `refresh_engine_v3.mjs --dry-run` performs zero database writes
  (verified by a live test asserting the run-state file is unchanged).
- Production connection-string rejection verified via both v2's and v3's
  existing/new tests.
- No raw data tracked (confirmed via `warehouse:check` AND the fact a
  fresh clone has no `warehouse/data/` directory at all).
- No secrets tracked (only `.env.example`, a placeholder, is tracked).
- Production (`oshquaxsloolqucwvigc`): zero warehouse schema tables,
  re-confirmed after every commit this session including this final check.

## Confirmations

- **Production touched: NO**
- **`main` merged: NO**
- **Paid infrastructure added: NO**
- **Raw data committed: NO**
- **Secrets committed: NO**

## Known gaps

See `warehouse/reports/sprint12_foundation_known_gaps.md` — every gap is
documented with its cause and, where applicable, which future workstream
should address it. None block considering this Foundation Block complete.

## Exact recommended next workstream

Per the original Sprint 12 mission's own numbering, the data-layer
Foundation Block (WS3/4/6/8/9/10) is done. The next workstreams
(WS5 research evidence catalogue, WS7 Scenario Lab, WS11 versioned public
API, WS12 research interface rebuild, WS13 exports, WS14-18 security/
performance/testing/docs/final delivery) build ON TOP of this foundation
and were explicitly out of scope for this mission. Recommended starting
point: **WS11 (versioned public API v1)** — it is the natural next
dependency for WS12 (UI rebuild) and WS13 (exports), and this Foundation
Block's lineage/quality/freshness infrastructure (WS8/WS9) is exactly what
a versioned public API should expose per-metric ("About this metric"
provenance, confidence, freshness) rather than treating as internal-only.
