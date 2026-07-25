# Sprint 12 Foundation Block — Capacity Report

## Branch storage (`lzonauinzatmtytyoems`, validation branch)

| Checkpoint | Size (MB) | % of 4,500 MB ceiling | % of 3,375 MB (75%) Sprint 12 budget |
|---|---|---|---|
| Phase 0 (session start) | 2,634.1 | 58.5% | 78.0% |
| After WS1/WS2/WS4/WS3 | 2,663.8 | 59.2% | 78.9% |
| After WS6 | 2,672.0 | 59.4% | 79.2% |
| After WS8 | 2,672.0 | 59.4% | 79.2% |
| After WS9 | 2,673.0 | 59.4% | 79.2% |
| **After WS10 (final)** | **2,673.0** | **59.4%** | **79.2%** |

Total growth across the entire Foundation Block (WS3/WS4/WS6/WS8/WS9/WS10):
**+38.9 MB** — driven almost entirely by WS3's 6,390-row dwelling
construction activity table and WS6's 22,515-row timeseries rollup; WS8/
WS9/WS10 added only small metadata tables (lineage registry, quality
rules/runs/incidents/quarantine — all well under 1 MB combined).

**Never approached the 90% code-enforced refusal threshold** (4,050 MB) at
any point this session. Every write script's own pre-flight capacity check
(`refresh_engine_v2.mjs`/`v3.mjs`'s `checkCapacity()`,
`load_market_intelligence_to_branch.mjs`'s `MAX_SAFE_DB_MB` guard) remained
untriggered throughout.

## Local storage (gitignored, `warehouse/data/local/`)

**2.1 GB** — raw downloaded source files and parsed local DuckDB/JSON
stores across every Sprint 2-12 dataset. Never committed (verified: a
fresh clone of this branch has no `warehouse/data/` directory at all).

## Production (`oshquaxsloolqucwvigc`)

**Zero warehouse schema tables** (`core`/`mart`/`meta`/`staging` all
empty) — re-confirmed independently after every single commit this
session (Phase 0 through WS10), not just at the end.

## Headroom assessment

At 59.4% of the internal working ceiling and 79.2% of Sprint 12's own
75%-of-ceiling budget, there is real remaining headroom for further
Sprint 12 workstreams (WS5/WS7/WS11-WS18) without requiring a capacity
review — but the 75% Sprint 12 budget itself is now the binding
constraint (79.2% used against it), not the 90% hard ceiling. A future
workstream doing another large data load (e.g. a genuine GCCSA-grain
snapshot mart, or ACT/NT/TAS's missing rent sources if ever found) should
re-check capacity before proceeding, not assume the same headroom persists.
