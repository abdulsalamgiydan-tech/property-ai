# Cross-State Security Test Report (Sprint 10, Phase 11)

Generated: 2026-07-21. Target: branch `lzonauinzatmtytyoems` only.

| test | result |
|---|---|
| anon can execute `search_market_geographies_v2` | PASS |
| row limit clamp enforced (999 -> 50) | PASS |
| `compare_market_geographies_v1` rejects <2 or >5 geographies | PASS |
| SQL injection probe (parameterized, no secondary statement) | PASS |
| anon denied direct `mart.*` SELECT (42501) | PASS |
| anon denied direct `mart.*` UPDATE (42501) | PASS |
| anon denied direct `meta.jurisdiction` SELECT (42501) | PASS |

**All tests pass.**

## Method

Tests run via `SET ROLE anon` inside a direct SQL session against the
branch — this exercises the same GRANT/REVOKE state PostgREST relies on
for anon requests, though it does not exercise the HTTP/PostgREST routing
layer itself (noted as not tested this pass).

## Notes

- No composite score, ranking, or buy/pass output exists anywhere in the
  new interfaces — `compare_market_geographies_v1` returns raw metric
  columns only, each with its own confidence/missing-reason metadata.
- `meta.jurisdiction` (added in migration 015) is explicitly revoked from
  anon/authenticated and reachable only through the SECURITY DEFINER
  search function, consistent with the existing migration 014 pattern of
  keeping `core`/`mart`/`meta` schemas entirely un-exposed to PostgREST.
