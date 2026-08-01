# Sprint 18 — Post-Launch Check Plan

Date prepared: 2026-08-01
Launch reference: `warehouse/reports/sprint18_launch_closure_report.md`
(final deployment `dpl_7LNKH7CQLWWX6X5X65mNHeQm82mw`, main SHA `09a6958`)

Read-only check plan for the next-morning and 24-hour post-launch
reviews. All items are read-only — no migration, import, flag, or
deploy action is authorized by this plan. If a check surfaces a real
issue, stop and report before taking any corrective action.

## Next-morning check (first business check after launch)

- **Errors**: `vercel logs app.propellect.com.au` (or dashboard Runtime
  Logs for a longer window) — any 5xx, any repeated 4xx pattern beyond
  expected 404s (Copilot/Admin/operations) or 400s (validation errors).
- **Latency**: spot-check `/research`, `/research/suburb/<code>`,
  `/api/v1/search`, `/api/v1/compare`, `/api/v1/map-markers` (bounded) —
  compare against the launch-day baseline in the closure report
  (roughly 0.3-1.6s for most calls; map-markers up to ~4s cold).
- **Database size**: `get_project` / a `pg_database_size()` query —
  compare against the post-import baseline to confirm no unexpected
  growth (the warehouse is ETL-loaded, not user-write-driven, so size
  should be stable day to day).
- **Connection health**: `pg_stat_activity` non-idle count and
  `pg_locks where not granted` — both should remain near zero, matching
  the t+~5h check in the closure report.
- **Research/API usage**: how much real traffic (beyond agent smoke
  tests) has hit `/research/*` and `/api/v1/*` — first real signal of
  actual usage volume.
- **Map-timeout recurrence**: check logs specifically for any `57014`
  (statement timeout) on `get_market_map_markers_v1` — per the Phase 3
  finding, this should not recur under normal UI traffic (which always
  supplies a `type` filter). If it does recur, that would upgrade
  GitHub issue #27 from "non-blocking hardening" to something needing
  more urgent attention — investigate before deciding, don't assume.
- **Security-advisor changes**: re-run `get_advisors(security)` —
  compare against the identical finding set recorded throughout launch;
  flag anything new.
- **Data integrity**: re-run the 21-table row count / total (452,176)
  check — confirm still exact (the warehouse should not change until a
  future scheduled refresh, which is a separate, explicitly-triggered
  workflow, not automatic).
- **Customer feedback**: check `public.user_feedback` for any new
  organic (non-test) submissions mentioning Research/API — read-only,
  do not act on content without separate instruction.

## 24-hour check

Same checklist as above, plus:
- Compare the full 24h error/latency trend (not just a point-in-time
  snapshot) via Vercel Analytics/dashboard, since the CLI's log tool
  only exposes a recent rolling tail (a real limitation noted in the
  closure report — the dashboard is the right tool for a 24h trend,
  not `vercel logs`).
- Confirm no Supabase automatic backup or maintenance event coincided
  with any anomaly (cross-reference timestamps if anything looks off).
- Decide whether GitHub issue #27 (map-marker hardening) should be
  scheduled as near-term work, based on whether any real traffic came
  close to reproducing it (bounding-box size, filter usage patterns) —
  informational only, no code change without separate instruction.

## Standing constraints for both checks

- Read-only. No migration, import, flag change, or deploy.
- Do not enable Copilot, Admin, or operations.
- Do not modify warehouse data.
- If an issue is found, report it with evidence before proposing or
  taking any corrective action.
