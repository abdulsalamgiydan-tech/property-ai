# Sprint 15 Browser UAT Report

Generated: 2026-07-24 22:20 AEST

## Target

- Branch: `feature/sprint14-production-readiness`
- Commit tested: `a22f8175fe90ab152fdf582b4a685c09f89e01e4`
- Stable Preview URL: `https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app`
- Vercel deployment ID: `dpl_4oRRX1QyDWFLFU4MxSRKdrkPFqZu`
- Deployment target: Preview
- Supabase branch: `warehouse-validation`
- Supabase ref: `lzonauinzatmtytyoems`

## Authentication Method

The run used Vercel Protection Bypass for Automation through request headers/cookie setup. The bypass secret was supplied only through process memory and was not printed, stored, or written to artifacts.

Two dedicated non-production UAT users were repaired through the `warehouse-validation` Supabase Admin API with temporary in-memory passwords and `email_confirm: true`, then authenticated through real Supabase password sign-in before browser UAT. Password sign-in was therefore verified.

During setup, the `warehouse-validation` branch Auth service initially failed Admin user loading because selected UAT rows had nullable Auth token/change fields incompatible with the branch GoTrue scanner. Only the two dedicated UAT users were repaired on the branch by normalizing empty token/change fields to empty strings. Production was not touched.

## Users

| Label | Account | Expected tier |
|---|---|---|
| User A | dedicated Sprint 15 UAT normal user | free |
| User B | dedicated Sprint 15 UAT elevated user | investor_pro |

No personal Gmail accounts were used.

## Result

**PASS** - 16 live checks passed against the protected Vercel Preview.

Evidence artifact: `uat-artifacts/sprint15-browser/sprint15-browser-uat-evidence.json` (ignored, redacted, not committed).

## Scenarios Covered

- Vercel protected Preview access through automation bypass.
- Preview bundle scan for public Supabase config and privileged secret markers.
- Real Supabase password sign-in for two branch-only UAT users.
- Browser session persistence via the app's `@supabase/ssr` cookie storage.
- Dashboard authentication for User A and User B.
- RLS-scoped cleanup and data creation for reports, comparisons, watchlist, portfolio and Scenario Lab cases.
- Free-user Scenario Lab limit enforced.
- Elevated-user Scenario Lab allowance verified.
- Dashboard cross-user isolation.
- Direct report URL isolation.
- Direct Supabase REST read/write isolation.
- Self-elevation rejected.
- Product journeys: landing, analyse, compare, watchlist, portfolio, research, explore, suburb, postcode, map, Scenario Lab, evidence catalogue, data operations, 404.
- Mobile viewport and keyboard focus smoke.
- Public API v1 search, compare and export checks.
- Admin and copilot routes fail safely while disabled.
- Sign-out returns the dashboard to a signed-out state.

## Secret Handling

No bypass secret, service-role key, generated password, access token, refresh token, cookie value, or credential was printed or committed. The committed harness redacts sensitive headers and token-shaped strings in failure artifacts.

## Production Safety

Production was not used for browser UAT. The harness has an exact Preview allowlist and rejects `app.propellect.com.au`, production aliases, localhost and the production Supabase ref.

