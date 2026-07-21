# Refresh Dry-Run Report (Sprint 10, Phase 13)

Generated: 2026-07-21T11:30:09.357Z

Branch ref: lzonauinzatmtytyoems. No schedule enabled. Default mode is dry-run.

## Production-target rejection proof

**PASS — run_refresh.mjs --target=production was rejected before any write**

## Recent refresh runs (up to 50)

| dataset | mode | status | target | started |
|---|---|---|---|---|
| vic_vpsr_median_house | dry-run | succeeded | local | Tue Jul 21 2026 21:24:18 GMT+1000 (Australian Eastern Standard Time) |

## Freshness status

| dataset | jurisdiction | status | branch rows | local/branch |
|---|---|---|---|---|
| nsw_psi_2001_current_full_state | NSW | manual_review | 504 | branch_published |
| nsw_rent_tables_full_state | NSW | manual_review | 504 | branch_published |
| vic_moving_annual_rent_by_suburb | VIC | manual_review | 79 | branch_published |
| vic_quarterly_median_rent_by_lga | VIC | manual_review | 79 | branch_published |
| vic_vpsr_median_house | VIC | manual_review | 741 | branch_published |
| vic_vpsr_median_land | VIC | manual_review | 741 | branch_published |
| vic_vpsr_median_unit | VIC | manual_review | 741 | branch_published |

## Notes

- plan_refresh.mjs and check_freshness.mjs are strictly read-only except check_freshness.mjs's own upsert into meta.dataset_freshness_status (never touches mart/core data).
- run_refresh.mjs isolates each dataset's run to its own meta.dataset_refresh_run row — a failure in one dataset does not block or corrupt another.
- No cron, Supabase Edge Function schedule, or any other automated trigger was created this sprint — every run is manual, on demand.
