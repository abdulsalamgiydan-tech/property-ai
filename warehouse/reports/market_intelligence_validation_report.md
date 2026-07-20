# Market Intelligence Validation Report (Sprint 9, Phase 8)

Generated: 2026-07-20T20:13:58.287Z
Branch: `lzonauinzatmtytyoems` (read-only checks). Verdict: **PASSED**

## Blocking checks

| check | value |
|---|---|
| duplicate suburb/postcode snapshot grain | 0 / 0 |
| duplicate demographic profile grain | 0 / 0 |
| duplicate time-series grain | 0 / 0 |
| orphan geography IDs (snapshot/demog/timeseries) | 0 / 0 / 0 |
| negative prices/rents/incomes/counts | 0 (snapshot) / 0 (demographics) |
| percentages outside 0-100 | 0 (snapshot) / 0 (demographics) |
| yield without sale or rent inputs | 0 |
| yield without confidence label | 0 / 0 |
| affordability without rate/income/price inputs | 0 |
| price without sample-size label | 0 / 0 |
| future-dated source periods | 0 |
| inconsistent geography level (wrong ID prefix) | 0 / 0 |
| invalid mortgage calculations (<=0 or >$100k/month) | 0 |
| raw/local files tracked by git | 0 ✅ |
| metric_assumption baseline scenario present | 7 rows |

All blocking checks pass with zero violations.

## Freshness

Latest snapshot generated 0 days ago (stale-source flag
fires above 90 days for this research snapshot — informational only).

- All checks are read-only, run independently against the branch AFTER commit — separate from the in-transaction gates enforced during the load itself.
- Snapshot freshness: latest snapshot_generated_at is 0 days old (stale_source_flag fires above 90 days — informational, not blocking for a just-built snapshot).
- inconsistent_geo_level checks confirm every suburb-mart row's geography_id has the SAL_ prefix and every postcode-mart row has POA_ — no cross-level contamination.
