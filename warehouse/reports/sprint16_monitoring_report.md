# Sprint 16 Monitoring Report

Date: 2026-07-25
Scope: read-only Production monitoring immediately after core release stabilisation.

## Vercel Runtime Logs

Deployment checked: `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x`

Observed with Vercel runtime log queries:

- Last 1h error logs: none found.
- Last 1h HTTP 500 logs: none found.
- Last 1h HTTP 401 logs: none found.
- Last 1h HTTP 403 logs: none found.
- Auth-related log query: one informational `GET /auth/complete` with HTTP 200.

## Route Timing Snapshot

Read-only HTTP checks against `https://app.propellect.com.au`:

| Route | Method | Status | Total time |
| --- | --- | ---: | ---: |
| `/` | GET | 200 | 0.389s |
| `/analyse-property` | GET | 200 | 0.339s |
| `/compare-properties` | GET | 200 | 0.085s |
| `/dashboard` | GET | 200 | 0.121s |
| `/portfolio` | GET | 200 | 0.371s |
| `/watchlist` | GET | 200 | 0.374s |
| `/auth/complete` | GET | 200 | 0.336s |
| `/admin` | GET | 404 | 0.373s |
| `/research/map` | GET | 404 | 0.324s |
| `/api/v1/search?q=richmond&limit=2` | GET | 404 | 0.349s |
| `/api/research/copilot` | POST | 404 | 0.327s |

## Response Secret Pattern Scan

Routes scanned:

- `/`
- `/analyse-property`
- `/compare-properties`
- `/dashboard`
- `/portfolio`
- `/watchlist`
- `/admin`
- `/research/map`
- `/api/v1/search?q=richmond&limit=2`

Patterns checked included service-role identifiers, database URL markers, Vercel bypass header names, and disabled-feature environment variable names. No matches were found in the sampled responses.

## Supabase Health

Production project: `oshquaxsloolqucwvigc`

Read-only Postgres statistics:

- Active backends at snapshot: 9
- Rollbacks: 11 cumulative
- Conflicts: 0
- Deadlocks: 0
- Temporary files: 0
- Postgres start time observed: 2026-07-19 10:22:56 UTC

The Sprint 15 tables remained empty and RLS-enabled at the monitoring snapshot.

## Monitoring Conclusion

Core Production health: GO.

No runtime error burst, 500 burst, database deadlock, database conflict, disabled-feature exposure, or obvious response secret leakage was observed during this read-only monitoring pass.
