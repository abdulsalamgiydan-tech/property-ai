# Warehouse Read-Only Access Security Test (Sprint 9, Phase 9)

Generated: 2026-07-20T20:14:01.433Z
Branch: `lzonauinzatmtytyoems`, tested with the **anon key only** (no
service-role key used anywhere in this test or the app). Verdict: **PASSED**

| test | expected | actual | result |
|---|---|---|---|
| search suburb/postcode geography | success | success | ✅ PASS |
| suburb market snapshot select | success | success | ✅ PASS |
| postcode market snapshot select | success | success | ✅ PASS |
| suburb demographic profile select | success | success | ✅ PASS |
| metric assumptions select | success | success | ✅ PASS |
| time-series RPC | success | success | ✅ PASS |
| INSERT into snapshot view | error | error | ✅ PASS |
| UPDATE snapshot view | error | error | ✅ PASS |
| DELETE from snapshot view | error | error | ✅ PASS |
| direct access to core.dim_geography | error | error | ✅ PASS |
| direct access to mart.suburb_market_snapshot | error | error | ✅ PASS |
| direct access to meta.metric_assumption | error | error | ✅ PASS |

## Summary

- Allowed reads (search, snapshots, demographics, assumptions, time-series RPC) all succeed via the anon key.
- INSERT/UPDATE/DELETE against the public views all fail — the views are backed by tables anon has zero direct grants on, and no INSERT/UPDATE/DELETE grant was ever issued on the views themselves (migration 014).
- Direct PostgREST access to `core.*`, `mart.*`, `meta.*` all fail — these schemas are not in PostgREST's exposed-schema list and anon has no grants on them (`revoke all on schema core, mart, staging, meta from anon, authenticated` in migration 014).
