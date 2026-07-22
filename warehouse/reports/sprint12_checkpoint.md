# Sprint 12 Checkpoint

Stopping cleanly here per this project's context-checkpoint protocol, after
closing out Workstream 6 with a fully committed, pushed, and independently
verified result. All work below is committed, pushed, and re-confirmed live
against the branch — nothing is left in a partial or unvalidated state.

## Branch and commit

- Branch: `feature/national-residential-research-platform-v1`
- Latest commit: `1ef0dcf`
- Base: Sprint 11's final commit `b3913e1`
- GitHub Actions: **green on every pushed commit this session**, most
  recently `1ef0dcf` (run [29902750018](https://github.com/abdulsalamgiydan-tech/property-ai/actions/runs/29902750018),
  watched to completion — Build, lint, test, warehouse checks all passed)
- Sprint 11 draft PR: [#4](https://github.com/abdulsalamgiydan-tech/property-ai/pull/4)
  (review-only, not merged)

## Completed this session (Foundation Block progress: 5 of 6 workstreams)

**Phase 0, WS1, WS2, WS4, WS3** — see prior checkpoint history in git log;
unchanged since the last checkpoint.

**WS6 — National canonical market mart rollup** (`1ef0dcf`): Live inspection
showed `mart.suburb_market_snapshot`/`postcode_market_snapshot` already had
a schema comprehensive enough for the national mission — this was a
completeness and bug-fix exercise, not a rebuild. Found and fixed two real
defects (population_growth_2016_2021_pct hardcoded to NULL in the build
script despite WS4 computing the real figure; jurisdiction never populated
outside NSW/VIC). Found and closed a third, previously undocumented gap:
QLD/SA/WA have substantial real rent data (211k/28k/20k rows, loaded Sprint
11) that had never been rolled up into the wide snapshot/timeseries marts —
now rolled up additively without touching NSW/VIC's existing values.
TAS/ACT/NT deliberately excluded (GCCSA-grain sales can't map into
SAL/POA-grain marts without fabricating a cross-grain match) — documented,
not worked around. Full report: `sprint12_ws6_national_market_marts_report.md`.

## Validation status

- `npm run warehouse:check`: pass
- `npm test`: 89/89 pass (4 new this session for WS6: postcode-heuristic
  correctness/malformed-input handling, rollup script safety pattern,
  rent-null-only overwrite guard)
- `npm run lint`: 0 errors, 6 warnings (all pre-existing, unrelated)
- `npm run build`: pass
- GitHub Actions: green on all 9 commits pushed this session
- Production: re-verified untouched (zero warehouse schema tables via
  `list_tables` on `oshquaxsloolqucwvigc`)
- No raw data or secrets committed
- Branch storage: 2,634.1 MB (Phase 0) → 2,672 MB (now) — +37.9 MB across 5
  real data workstreams, 79.2% of the 3,375 MB (75%) Sprint 12 budget,
  59.4% of the 4,500 MB hard ceiling

## New migrations this session

025, 026, 027, 028, 029 (unchanged since WS3/WS4 — WS6 needed no schema
changes, every column it populated already existed).

## New/changed data this session (cumulative)

Unchanged from the prior checkpoint, plus WS6's rollup:
- `mart.suburb_market_snapshot`: jurisdiction +7,843 rows, population_growth
  +10,935 rows, rent +2,540 rows (QLD/SA/WA)
- `mart.postcode_market_snapshot`: jurisdiction +1,334 rows, population_growth
  +2,596 rows, rent +1,119 rows (QLD/SA/WA)
- `mart.suburb_market_timeseries`: +22,515 new `metric_family='rent'` rows
  (QLD/SA/WA, correctly source-labelled per state, trailing 24 months)

## New files this session (WS6)

- `warehouse/scripts/market_intelligence/rollup_national_market_snapshot.mjs`
- `warehouse/scripts/market_intelligence/rollup_national_market_snapshot.test.ts`
- `warehouse/scripts/lib/postcode_to_state.mjs` (extracted shared module —
  also now imported by `build_national_coverage_registry.mjs`)
- `warehouse/reports/sprint12_ws6_national_market_marts_report.md`
- `warehouse/reports/sprint12_ws6_national_snapshot_rollup_report.json`

## Active process status

None. No running background processes, no open database transactions, no
lock files held.

## Unfinished files

None — every file touched this session is committed and pushed.

## Remaining Foundation Block workstreams (not started)

1. ~~WS4, WS3, WS6~~ ✅ all done
2. **WS8 — field-level data lineage** (not started) — machine-queryable
   lineage entities (source/dataset/file/retrieval/checksum/load-run/
   transformation/correspondence/observation/derived-metric/mart-row/
   quality-result), a lineage query service, completeness percentages.
   Should build on the real lineage columns WS4 already added to the
   demographic profile marts as a proof of pattern. **Open design question
   for WS8 to resolve**: WS6 confirmed those 4 lineage columns exist only on
   `mart.suburb_demographic_profile_2021`/`postcode_demographic_profile_2021`,
   NOT on the wide snapshot marts — per-metric lineage columns on every wide
   mart would not scale to dozens of metrics; WS8 should likely design a
   separate, generic lineage table keyed by (mart, row, metric) instead of
   replicating WS4's column-per-metric pattern everywhere.
3. **WS9 — automated data-quality monitoring** (not started) — ~20 rule
   types. Should incorporate the future-reference-period rule WS1 already
   found justification for, AND the new anomaly WS6 observed (a handful of
   `mart.postcode_rent_quarterly` rows joining to POA geographies with
   abnormal non-4-digit `geography_code` values, e.g. `10102100701` —
   flagged but not investigated, a good candidate first real rule to write).
4. **WS10 — national refresh engine v3** (not started) — largest remaining
   engineering lift, depends on WS6/WS8/WS9 structures existing first.

## Exact next command

```bash
# Read the WS6 report first, then start WS8.
cat warehouse/reports/sprint12_ws6_national_market_marts_report.md
```

## Exact resume prompt

> Continue Sprint 12 from the checkpoint in
> `warehouse/reports/sprint12_checkpoint.md`. Read it first. Resume with
> Workstream 8 (field-level data lineage) — WS3, WS4, and WS6 are all
> complete. Build machine-queryable lineage entities (source/dataset/file/
> retrieval-event/checksum/load-run/transformation/correspondence/
> observation/derived-metric/mart-row/quality-result), a lineage query/
> service suitable for a future "About this metric" panel, and
> completeness-percentage validation. Build on the real lineage columns WS4
> already added to the demographic profile marts as a proof of pattern —
> WS6 confirmed those columns exist only on the demographic marts, not the
> wide snapshot marts, which is a real design question WS8 should resolve
> (per-metric lineage columns vs a separate lineage table joined by
> mart-row-id). "No mart metric may be considered publishable if mandatory
> lineage is absent" is a blocking requirement. Commit WS8 independently,
> then continue autonomously through WS9 and WS10 per the original
> Foundation Block mission, checkpointing again if context runs low.

## Known blockers

None blocking further work. TAS rent (Cloudflare-blocked), ABS internal
migration (stale latest-release), TAS/ACT/NT sales grain mismatch with
SAL/POA-grain marts, and QLD postcode-grain rent (source appears SAL-only)
are all genuine, documented gaps — none block WS8/WS9/WS10.
