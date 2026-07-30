# Sprint 16 Authenticated Production UAT

Date: 2026-07-25
Scope: human-guided Production UAT support using an existing approved Production account.

## Status

Authenticated Production UAT: NOT COMPLETED.

Reason: no approved Production user session or credential was used in this Sprint 16 pass. No Production Auth user was created, reset, invited, repaired, or modified. No service-role credential was used in a browser context.

## Safety Rules For The Human-Guided Run

- Use an existing approved Production account only.
- Do not create automated Production Auth users.
- Do not reset Production passwords for testing.
- Do not use service-role credentials in browser tests.
- Label any temporary records clearly as Sprint 16 UAT.
- Delete temporary records before closing the session.
- Capture screenshots only when they do not include credentials, tokens, private customer data, or sensitive business data.

## Checklist

| Area | Route or action | Expected result | Result |
| --- | --- | --- | --- |
| Sign in | Approved Production sign-in path | Existing user can authenticate normally | Not run |
| Session persistence | Refresh signed-in page | User remains signed in | Not run |
| Sign out | Sign-out control | Session cleared and protected routes return to signed-out state | Not run |
| Dashboard | `/dashboard` | Signed-in dashboard loads without console/runtime errors | Not run |
| Analyse property | `/analyse-property` | Analysis journey works or fails with user-visible validation, not server crash | Not run |
| Compare properties | `/compare-properties` | Comparison can be created/viewed using user-owned data | Not run |
| Portfolio | `/portfolio` | User-owned portfolio records visible only to owner | Not run |
| Watchlist | `/watchlist` | User-owned watchlist records visible only to owner | Not run |
| Reports | Saved reports UI | User-owned reports visible only to owner | Not run |
| Onboarding preferences | `/onboarding` or post-auth redirect | Preferences can be saved/skipped without trapping the user | Not run |
| Feedback | Global feedback widget while signed in | Feedback can be submitted by signed-in user only | Not run |
| Direct unauthorized access | Mutated IDs or signed-out access | Access rejected or hidden by RLS/application checks | Not run |
| Cleanup | Temporary Sprint 16 records | Any temporary records are deleted | Not run |

## Notes

Public and signed-out smoke checks passed separately in the Sprint 16 monitoring report. Those checks do not prove authenticated user-owned persistence or cross-user isolation in Production.

## Human Action Required

Run the checklist above with an existing approved Production account. If cross-user isolation must be proven in Production, Abdul must explicitly approve the safe mechanism and accounts to use without creating synthetic users or mutating Production Auth.
