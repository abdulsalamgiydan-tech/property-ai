# Sprint 12, Workstream 6 — National Canonical Market Marts

## Starting finding: this was a completeness exercise, not a schema rebuild

Live inspection of `mart.suburb_market_snapshot` / `mart.postcode_market_snapshot`
showed the schema already covers the mission's full spec — identity, market,
supply, demand/demographics, affordability, and metadata/lineage columns all
already exist. The real problem was **data completeness**, confirmed by two
live queries before any code was written:

1. `population_growth_2016_2021_pct` was 0% populated in `suburb_market_snapshot`
   — for every jurisdiction, including NSW — despite Sprint 12 WS4 correctly
   computing and storing this figure (with full lineage) in
   `mart.suburb_demographic_profile_2021`. Root cause: the wide snapshot's
   build script (`load_market_intelligence_to_branch.mjs`) hardcodes this
   column to literal `NULL` on every insert and was never updated after WS4
   shipped.
2. `jurisdiction` was `NULL` for every state except NSW/VIC in both snapshot
   marts. Root cause (SAL grain): `jurisdiction` isn't even in that build
   script's INSERT column list — it was set by a separate, one-off process
   for NSW/VIC only. Root cause (POA grain): `core.dim_geography.state_code`
   is `NULL` for all postcodes (POA isn't a single-state ASGS geography), so
   no simple join was ever possible.
3. **New finding, not previously documented**: QLD/SA/WA have real,
   substantial rent data (211,297 / 27,798 / 19,794 rows in
   `core.fact_rental_market_summary`, loaded Sprint 11 WS9) that was never
   rolled up into the wide snapshot or timeseries marts. The build script
   that populates those marts already reads from the shared, multi-state
   `mart.suburb_rent_quarterly` table — it simply hasn't been re-run since
   QLD/SA/WA rent landed.

## What was built

`warehouse/scripts/market_intelligence/rollup_national_market_snapshot.mjs`
— a scoped, additive, idempotent rollup script (not a rebuild) that:

1. Backfills `jurisdiction` on `suburb_market_snapshot`/`_timeseries` via a
   join to `meta.jurisdiction` on `state_code` (SAL grain, where
   `state_code` is reliably present).
2. Backfills `jurisdiction` on `postcode_market_snapshot` via the Australia
   Post postcode-range heuristic already proven in WS1's coverage audit —
   extracted into a shared module, `warehouse/scripts/lib/postcode_to_state.mjs`,
   so both scripts use exactly one implementation.
3. Backfills `population_growth_2016_2021_pct` in both snapshot marts from
   the corresponding demographic-profile marts (WS4's output), only where
   currently `NULL`.
4. Rolls up QLD/SA/WA rent into the wide snapshot's rent columns
   (`median_weekly_rent_latest`, `_prev`, `annual_rent_change_pct`,
   `rent_confidence`, `latest_rent_period`) — **only where the cell is
   currently `NULL`**, so NSW/VIC's existing pipeline-computed values are
   never overwritten.
5. Rolls up QLD/SA/WA rent into `suburb_market_timeseries`/
   `postcode_market_timeseries` as `metric_family='rent'` rows (purely
   additive `ON CONFLICT DO NOTHING` inserts against the existing natural-key
   unique index), correctly labelled with each state's real source dataset
   (`qld_rta_bond_statistics` / `sa_private_rent_report` /
   `wa_dmirs_bond_lodgements`) rather than a generic or borrowed label.

## Deliberately not done (documented gaps, not silently worked around)

- **TAS/ACT/NT are not rolled into these marts.** Their only sales data
  (loaded WS2) is GCCSA-grain, a coarser `geography_type` than the strictly
  SAL/POA-grain `suburb_market_snapshot`/`postcode_market_snapshot`. Rolling
  a GCCSA figure into a SAL/POA row would be a fabricated cross-grain
  mapping. This is a real architecture gap for a future GCCSA-grain snapshot
  mart — recorded, not fixed here.
- **QLD/SA/WA yield is not computed.** All three have zero sales rows at any
  grain (confirmed live), so there is no price to pair with rent. This
  correctly matches their registered `meta.jurisdiction.status = 'rent_only'`.
- **QLD has 0 postcode-grain (`POA`) rent rows** in `mart.postcode_market_snapshot`,
  even though it has 634 suburb-grain (`SAL`) rows. Confirmed via live query
  that `mart.postcode_rent_quarterly` genuinely has no QLD-range rows at all
  — the RTA source data appears to have only ever been geocoded to SAL, not
  POA. Not a rollup-script bug; recorded as an open source-coverage gap.
- **A pre-existing, unrelated data-quality anomaly was observed** (not
  introduced by this workstream): a handful of `mart.postcode_rent_quarterly`
  rows join to `core.dim_geography` POA rows with abnormal, non-4-digit
  `geography_code` values (e.g. `10102100701`). The postcode-range heuristic
  correctly returns `null` for these (never guesses), so they were left
  unresolved rather than mismapped. Flagged for WS9's future data-quality
  rule set — not investigated further here (out of WS6's scope).

## Results (independently re-queried against the committed branch)

`mart.suburb_market_snapshot` (SAL grain, 15,335 total rows):

| Jurisdiction | Rows | Has rent (before → after) | Has population growth (before → after) |
|---|---|---|---|
| NSW | 4,542 | 504 → 504 (untouched) | 0 → 3,344 |
| VIC | 2,944 | 79 → 79 (untouched) | 0 → 2,070 |
| QLD | 3,233 | 0 → 634 | 0 → 2,371 |
| SA | 1,696 | 0 → 950 | 0 → 1,137 |
| WA | 1,699 | 0 → 922 | 0 → 1,107 |
| TAS | 776 | 0 → 0 (no source) | 0 → 561 |
| NT | 303 | 0 → 0 (no source) | 0 → 229 |
| ACT | 136 | 0 → 0 (no source) | 0 → 111 |
| (Other Territories, no `meta.jurisdiction` entry) | 5 | 0 → 0 | 0 → 5 |

`mart.postcode_market_snapshot` (POA grain, 2,641 total rows): jurisdiction
now 2,641/2,641 populated (was 1,307/2,641 — NSW/VIC only); population growth
2,596/2,641 populated (was 0); rent 1,070/2,641 populated (was 441 — QLD
still 0, see gap above; SA 301, WA 326 newly added).

`mart.suburb_market_timeseries`: +22,515 new `metric_family='rent'` rows
(QLD/SA/WA, trailing 24 months, correctly source-labelled per state).
`mart.postcode_market_timeseries`: 0 new rows (QLD has no POA-grain rent
source; SA/WA's POA rent history falls outside the 24-month trailing window
already covered by other quarters — no rows were eligible for this run).

## Validation

- Post-load blocking gates (run inside the same transaction as the writes,
  rollback on any failure): duplicate snapshot grain = 0, duplicate
  timeseries grain = 0, orphan geography = 0, negative rent = 0, impossible
  population growth (< -100%) = 0, rent populated without a confidence label
  = 0. All passed; committed.
- `meta.data_quality_result` — 4 new blocker-severity rows recorded
  (`no_duplicate_grain`, `price_range_sanity`, `confidence_completeness`,
  `geo_code_valid`), all `passed`.
- Re-queried live post-commit (see table above) — independent confirmation,
  not trust in the load script's own report.
- Production (`oshquaxsloolqucwvigc`): re-confirmed zero warehouse schema
  tables via `list_tables` — untouched.
- `npm test`: 89/89 pass (4 new — `postcodeToState` correctness/malformed-input,
  rollup script's dry-run-default/production-refusal pattern, rent-null-only
  overwrite guard).
- `npm run warehouse:check`: pass.
- `npm run lint`: 0 errors, 6 warnings (all pre-existing, unrelated).
- `npm run build`: pass.

## Storage impact

Branch: 2,664 MB → 2,672 MB (+8 MB, almost entirely the 22,515 new
timeseries rows). Still well under the 3,375 MB (75%) Sprint 12 budget.

## Refactor alongside this workstream

Extracted the postcode-to-state Australia Post range heuristic (previously
duplicated) into `warehouse/scripts/lib/postcode_to_state.mjs`, imported by
both `build_national_coverage_registry.mjs` (WS1) and this workstream's
rollup script — one implementation, directly unit-testable.

## Files

- `warehouse/scripts/market_intelligence/rollup_national_market_snapshot.mjs` (new)
- `warehouse/scripts/market_intelligence/rollup_national_market_snapshot.test.ts` (new)
- `warehouse/scripts/lib/postcode_to_state.mjs` (new, extracted)
- `warehouse/scripts/audit/build_national_coverage_registry.mjs` (updated to import the shared module)
- `warehouse/reports/sprint12_ws6_national_snapshot_rollup_report.json` (generated by the rollup script's own run)
- `warehouse/metadata/national_coverage_registry.yml`, `warehouse/reports/national_coverage_audit.{md,json}` (regenerated)

## Exact next workstream

WS8 — field-level data lineage, building on the real lineage columns WS4
added to the demographic profile marts as a proof of pattern.
