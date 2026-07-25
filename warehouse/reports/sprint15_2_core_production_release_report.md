# Sprint 15.2 Core Production Release Report

Date: 2026-07-25

## Release Summary

Core Production release completed.

Dependency exception approved by Abdul:

- Scope: Sprint 15.3 dev/tooling-only npm audit exception.
- Expiry: 2026-08-24.
- Hard gate retained: `npm audit --omit=dev --audit-level=high`.

## PR And Commit State

| Item | Result |
| --- | --- |
| PR | #23 |
| PR state before merge | Open, Ready for Review, unmerged |
| PR head verified before merge | `e911f12bd0e8dedda2d5cc7601763b01440f179e` |
| Merge method | Normal GitHub merge, no force merge, no bypass |
| PR state after merge | Merged |
| Merge time | 2026-07-25T01:13:12Z |
| Merge commit | `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0` |
| Main CI | Passed |
| Main CI run | `30138040564` |

## Pre-Merge Gates

| Gate | Result |
| --- | --- |
| Working tree clean before merge | PASS |
| PR head unchanged | PASS |
| Required GitHub checks green | PASS |
| Production migration ledger through 044 | PASS |
| Production env excludes `ADMIN_EMAILS` | PASS |
| Production env excludes `RESEARCH_COPILOT_ENABLED` | PASS |
| Production env excludes `SUPABASE_SERVICE_ROLE_KEY` | PASS |
| Rollback deployment recorded | PASS: `dpl_HgpyHuNS49Q51F69ZHfUGFL9mxcw` |

## Local Validation

| Command/check | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run lint` | PASS, 6 warnings |
| `npm run test` | PASS, 447/447 |
| `npm run build` | PASS |
| `npm run warehouse:check` | PASS |
| `npm run warehouse:rls:check` | PASS |
| `npm run warehouse:lineage:check` | PASS, 88/88 lineage combinations |
| `npm audit --omit=dev --audit-level=high` | PASS, found 0 vulnerabilities |
| Changed-file secret scan | PASS |
| Built-artifact secret scan | PASS |

## Production Deployment

| Item | Result |
| --- | --- |
| Prior Production deployment | `dpl_HgpyHuNS49Q51F69ZHfUGFL9mxcw` |
| New Production deployment | `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x` |
| Production URL | `https://app.propellect.com.au` |
| Deployment URL | `https://property-5w8vu947i-zeebusiness93-2304s-projects.vercel.app` |
| Target | Production |
| Status | Ready |
| Deployed branch | `main` |
| Deployed commit | `71d93c5` / merge commit `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0` |
| Build evidence | Vercel build log: cloned `main`, commit `71d93c5`; build completed and deployment completed |
| Production env changed | NO |
| Production Auth changed | NO |
| Production DB config changed | NO |

Vercel automatically started and completed the Production deployment after the PR merge.

## Production Smoke Results

| Area | Result | Evidence |
| --- | --- | --- |
| HTTP availability | PASS | `https://app.propellect.com.au/` returned 200 |
| Landing page | PASS | Browser desktop/mobile rendered title and H1 with no console errors |
| Navigation/public shell | PASS | Public pages expose focusable controls; CSP/security headers present |
| Analyse property | PASS | HTTP 200; browser desktop/mobile rendered `Analyse a Property` with no console errors |
| Compare properties | PASS | HTTP 200; browser desktop/mobile rendered `Compare 2 Properties` with no console errors |
| Dashboard unauthenticated state | PASS | HTTP 200; browser rendered `Sign in to view your dashboard` |
| Portfolio unauthenticated state | PASS | HTTP 200; browser rendered `Sign in to track your portfolio` |
| Watchlist unauthenticated state | PASS | HTTP 200; browser rendered `Sign in to use your watchlist` |
| Auth completion page | PASS | HTTP 200; browser rendered `Finishing sign-in...` |
| Sign-out | NOT RUN | No approved Production user session or credential was used; no Production Auth mutation was performed |
| Authenticated dashboard/product journeys | NOT RUN | No approved Production user session or credential was used; avoided creating or mutating Production data |
| Reports and exports | LIMITED | Public API export route returned 404 under current Production feature configuration |
| Scenario Lab | LIMITED | Research/scenario route returned 404 under current Production feature configuration |
| Research pages and map | LIMITED | Research routes returned 404 under current Production feature configuration |
| API v1 read paths | LIMITED | API v1 search/compare/export returned 404 under current Production feature configuration |
| Mobile viewport smoke | PASS for enabled core pages | Browser mobile checks passed for `/`, `/analyse-property`, `/compare-properties`, `/dashboard`, `/portfolio`, `/watchlist`, `/auth/complete` |
| Keyboard-navigation smoke | PASS for enabled core pages | Enabled pages exposed focusable controls in browser smoke |
| Admin unavailable | PASS | `/admin` returned 404 |
| Copilot unavailable | PASS | `POST /api/research/copilot` returned 404 `{"error":"not_found"}` |
| Browser console errors | PASS for enabled pages | No console errors on enabled core pages; expected 404 console resource errors only on disabled routes |
| Response secret scan | PASS | Production HTML responses scanned clean for high-confidence secret patterns |

## Logs

| Log check | Result |
| --- | --- |
| Vercel error logs for `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x` in last 20 minutes | No logs found |
| Vercel 500 logs for `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x` in last 20 minutes | No logs found |

## Database Verification

| Check | Result |
| --- | --- |
| Production project | `oshquaxsloolqucwvigc` |
| Migration ledger | Ends at `044_user_feedback` |
| Latest versions | `044_user_feedback`, `043_onboarding_preferences`, `042_research_copilot_queries`, `041_scenario_lab_case_limits`, `040_user_entitlements` |
| `research_copilot_queries` RLS | Enabled |
| `user_onboarding_preferences` RLS | Enabled |
| `user_feedback` RLS | Enabled |
| `research_copilot_queries` row count | 0 |
| `user_onboarding_preferences` row count | 0 |
| `user_feedback` row count | 0 |

No synthetic Production data was created by this release verification.

## Rollback

| Item | Result |
| --- | --- |
| Rollback target | `dpl_HgpyHuNS49Q51F69ZHfUGFL9mxcw` |
| Rollback used | NO |
| Reason | No application-wide 5xx, core journey failure, secret exposure, Admin/Copilot exposure, or repeated critical runtime errors observed |

## Warnings And Limitations

- Production research routes and API v1 routes are currently unavailable with 404 responses under the active Production configuration. This is fail-closed behavior, not a runtime crash, but it means Production research/API enablement is not part of this completed core release.
- Authenticated Production user journeys were not executed because no approved Production user session/credential was used, and the release constraints prohibited Production Auth mutation and synthetic data creation.
- The full-install npm audit still has the approved dev/tooling-only exception through 2026-08-24. The production-only audit hard gate passes.

## Final Status

Core Production release: **GO**

Optional research/API Production enablement: **NO-GO until separately approved and configured**

Admin enablement: **NO-GO**

Copilot enablement: **NO-GO**
