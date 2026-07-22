# Sprint 12 Checkpoint — Foundation Block + WS11-13 COMPLETE

Foundation Block (WS3/WS4/WS6/WS8/WS9/WS10) plus WS11 (public API v1),
WS12 (research interface), and WS13 (export/reproducibility) are all
done, committed, pushed, CI-green, and independently re-verified.

## Branch and commit

- Branch: `feature/national-residential-research-platform-v1`
- Latest commit: `9556e18`
- GitHub Actions: green on every pushed commit this session

## Completed this extended session

1. WS4 — 2016-2021 boundary reconciliation (`83db10e`)
2. WS3 — national demand/supply context (`6d6e17e`)
3. WS6 — national canonical market mart rollup (`1ef0dcf`)
4. WS8 — field-level data lineage (`6942d79`)
5. WS9 — automated data-quality/freshness monitoring (`45077ce`)
6. WS10 — national refresh engine v3 (`8b2ebac`)
7. WS11 — versioned public API v1 (`42b3816`)
8. WS12 — research interface rebuild (`27df613`)
9. WS13 — export and reproducibility (`9556e18`)

## What WS11-13 added (beyond the Foundation Block)

- `/api/v1/*` — 10 route handlers (search, snapshot, timeseries, compare,
  map-markers, metrics/.../lineage, quality, freshness, export, discovery
  root), gated behind a new `PUBLIC_API_V1_ENABLED` flag, consistent
  `{data,meta}`/`{error,meta}` envelope.
- 2 new public views + 2 new/modified RPCs
  (`v_metric_lineage_v1`, `v_quality_summary_v1`, `get_metric_lineage_v1`,
  `get_market_snapshot_v2` extended with `population_growth_2016_2021_pct`).
- UI: "About this metric" lineage panels + a newly-visible population
  growth metric card (a real gap found and fixed — the data existed since
  WS4/WS6 but was never selected by the RPC the UI actually calls) +
  "Export CSV"/"Export JSON" links, all live-verified via a real browser
  session and live curl tests, not just build-time checks.

## Final validation

- 161/161 tests pass locally (37 new across WS9-WS13).
- `npm run build`/`lint`/`warehouse:check`: all pass, 0 lint errors, 6
  pre-existing warnings (unchanged).
- Live-verified via real dev-server sessions: quality/freshness/lineage/
  export API endpoints all curled for real; the Lindfield suburb page
  browser-tested end-to-end (About-this-metric panel, population growth
  card, no console errors).
- Production (`oshquaxsloolqucwvigc`): zero warehouse schema objects,
  re-confirmed as the final action of this session.
- No raw data or secrets tracked.

## Real defects found and fixed this extended session (not just detected)

- WS9: the exact 2032-future-date bug WS1 flagged was actively corrupting
  2 published wide-snapshot rows — quarantined and recomputed from real data.
- WS9: an overly-tight population-growth threshold was corrected after
  verifying flagged suburbs were genuine growth-corridor developments.
- WS9: a Postgres `NULL <> NULL` uniqueness gap in the lineage registry.
- WS10: a silent id-namespace mismatch that would have made `--stale`
  selection permanently return zero results.
- WS10: 5 real Sprint-12 datasets had zero orchestrator awareness.
- WS12: population growth data existed in the mart since WS4/WS6 but was
  invisible in the UI because the RPC never selected the column.

## What's next

Remaining Sprint 12 workstreams not covered this session: WS5 (research
evidence catalogue), WS7 (Scenario Lab), WS14 (security/RLS/access model),
WS15 (performance/storage hardening), WS16 (testing/clean-clone
reproduction — partially covered ad hoc by WS9/WS10/WS11's clean-clone
and live verification, but not a dedicated workstream pass), WS17
(documentation/operations), WS18 (final validation/delivery).

## Known blockers

None. See `sprint12_foundation_known_gaps.md` for the full, still-current
list of external data-availability limits and tracked-but-advisory
anomalies.
