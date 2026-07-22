# Sprint 12 Checkpoint

Stopping cleanly here after closing out Workstream 8 with a fully
committed, pushed, and independently verified result. All work below is
committed, pushed, and re-confirmed live against the branch — nothing is
left in a partial or unvalidated state.

## Branch and commit

- Branch: `feature/national-residential-research-platform-v1`
- Latest commit: `6942d79`
- GitHub Actions: **green on every pushed commit this session**, most
  recently `6942d79` (run 29904157581, watched to completion)
- Sprint 11 draft PR: [#4](https://github.com/abdulsalamgiydan-tech/property-ai/pull/4)
  (review-only, not merged)

## Completed this session (Foundation Block progress: 6 of 6 core + WS8 extra)

**Phase 0, WS1, WS2, WS4, WS3, WS6** — see prior checkpoint history in git
log; unchanged since the last checkpoint.

**WS8 — Field-level data lineage** (`6942d79`): Built
`meta.metric_lineage_registry` (migrations 030, 031) at
`(mart_table, metric_name, jurisdiction)` grain — the static "what source/
methodology" layer, pairing with each mart row's existing
`metric_provenance` jsonb (the dynamic per-row layer). Found and fixed a
real bug live: Postgres's `NULL <> NULL` uniqueness semantics meant the
original constraint didn't actually dedupe national-metric rows on
re-run — fixed with `unique nulls not distinct`, verified idempotent
across 3 consecutive runs. The completeness validator
(`validate_metric_lineage_completeness.mjs`) found a genuine,
previously-unknown data anomaly on its first run (86/88, 2 mandatory
gaps): a small number of QLD/ACT-range postcodes in
`mart.postcode_market_snapshot` carry `nsw_vg_sales` data at tiny volumes
(1-5 transactions) — investigated rather than blanket-registered,
documented as unresolved (genuine border catchment vs. a NSW geography-join
bug), flagged for WS9. Second run: 88/88 (100%). Built
`lineage_service.mjs`, the "About this metric" query function, and
live-smoke-tested it against the real branch. Full report:
`sprint12_ws8_data_lineage_report.md`.

## Validation status

- `npm run warehouse:check`: pass
- `npm test`: 98/98 pass (9 new this session for WS8)
- `npm run lint`: 0 errors, 6 warnings (all pre-existing, unrelated)
- `npm run build`: pass
- GitHub Actions: green on all 11 commits pushed this session
- Production: re-verified untouched
- No raw data or secrets committed
- Branch storage: ~2,672 MB, ~79% of the 3,375 MB (75%) Sprint 12 budget

## New migrations this session

025-029 (unchanged), plus 030 (metric_lineage_registry table), 031 (fixes
the NULL-jurisdiction uniqueness bug in 030).

## New files this session (WS8)

- `warehouse/scripts/lineage/build_metric_lineage_registry.mjs`
- `warehouse/scripts/lineage/validate_metric_lineage_completeness.mjs`
- `warehouse/scripts/lineage/lineage_service.mjs`
- `warehouse/scripts/lineage/lineage_service.test.ts`
- `warehouse/reports/sprint12_ws8_data_lineage_report.md`
- `warehouse/reports/metric_lineage_registry_build_report.json`
- `warehouse/reports/metric_lineage_completeness_report.json`

## Active process status

None. No running background processes, no open database transactions, no
lock files held.

## Unfinished files

None — every file touched this session is committed and pushed.

## Remaining Foundation Block workstreams (not started)

1. ~~WS4, WS3, WS6, WS8~~ ✅ all done
2. **WS9 — automated data-quality monitoring** (not started) — ~20 rule
   types. Should incorporate the future-reference-period rule WS1 already
   found justification for (2 rows with `reference_period=2032-01-01` in
   NSW sales), AND the new cross-border postcode attribution anomaly WS8
   found and registered but did not resolve — a genuinely good candidate
   first real rule (QLD/ACT-range postcodes carrying `nsw_vg_sales` data).
3. **WS10 — national refresh engine v3** (not started) — largest
   remaining engineering lift, depends on WS6/WS8/WS9 structures existing
   first.

## Exact next command

```bash
cat warehouse/reports/sprint12_ws8_data_lineage_report.md
```

## Exact resume prompt

> Continue Sprint 12 from the checkpoint in
> `warehouse/reports/sprint12_checkpoint.md`. Read it first. Resume with
> Workstream 9 (automated data-quality monitoring) — WS3, WS4, WS6, and
> WS8 are all complete. Build `meta.data_quality_rule/run/result`
> (`meta.data_quality_result` already exists from earlier sprints — extend,
> don't duplicate), `meta.data_freshness_status` (check if this already
> exists under a different name — `meta.dataset_freshness_status` was
> found during WS8's schema inspection and may already cover this),
> `meta.data_incident`, `meta.data_quarantine_summary`, and the ~20 rule
> types from the original Foundation Block mission. Incorporate the
> future-reference-period rule WS1 justified (2 rows with
> `reference_period=2032-01-01`) and the cross-border postcode attribution
> anomaly WS8 found (QLD/ACT-range postcodes carrying `nsw_vg_sales` data
> at 1-5 transaction volumes — e.g. 4380, 2611/2612/2618 — investigate
> whether this is a genuine border-catchment phenomenon or a geography-join
> bug). Quality failures must block promotion, preserve the prior valid
> mart version, and quarantine rather than silently publish partial
> replacement data. Commit WS9 independently, then continue autonomously
> through WS10, checkpointing again if context runs low.

## Known blockers

None blocking further work. TAS rent (Cloudflare-blocked), ABS internal
migration (stale latest-release), TAS/ACT/NT sales grain mismatch, QLD
postcode-grain rent, and the unresolved QLD/ACT cross-border postcode
sales anomaly are all genuine, documented gaps — none block WS9/WS10.
