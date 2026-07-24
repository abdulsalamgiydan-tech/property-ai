# Sprint 15 Preview UAT Report

Generated: 2026-07-24 22:25 AEST

## Result

**Preview deployment: PASS. Full live browser UAT: PASS.**

- Stable alias: `https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app`
- Deployment URL: `https://property-cmtjd1ayc-zeebusiness93-2304s-projects.vercel.app`
- Deployment ID: `dpl_4oRRX1QyDWFLFU4MxSRKdrkPFqZu`
- Target: Preview
- Branch/commit under test: `feature/sprint14-production-readiness` / `a22f8175fe90ab152fdf582b4a685c09f89e01e4`
- Supabase branch: `warehouse-validation`
- Supabase ref: `lzonauinzatmtytyoems`

## Completed

- Verified PR #23 remained open, draft and unmerged.
- Verified the stable Preview alias reached a Ready Preview deployment.
- Verified unauthenticated Preview requests remained protected by Vercel Deployment Protection.
- Used Vercel Protection Bypass for Automation without disabling project-wide protection.
- Verified the live Preview bundle points to the `warehouse-validation` Supabase branch and does not expose privileged secret markers.
- Repaired only two dedicated branch UAT Auth rows where nullable token/change fields caused branch GoTrue Admin API scan failures.
- Used Supabase Admin API to set temporary in-memory passwords for two dedicated non-production UAT users.
- Verified real Supabase password sign-in for both UAT users.
- Ran full authenticated browser UAT against the deployed Preview.

## Browser UAT

The live browser run passed 16 checks:

- User A and User B authenticated dashboard access.
- Branch UAT user cleanup through each user's own RLS session.
- Browser-originated inserts for reports, comparisons, watchlist, portfolio and Scenario Lab.
- Free-tier Scenario Lab limit enforcement.
- Elevated-tier Scenario Lab allowance.
- Dashboard, direct report URL, and direct REST cross-user isolation.
- Self-elevation rejected.
- Desktop product journeys.
- Mobile viewport and keyboard focus smoke.
- Public API v1 search, compare and export checks.
- Disabled admin and copilot routes.
- Sign-out state.

Ignored redacted artifact: `uat-artifacts/sprint15-browser/sprint15-browser-uat-evidence.json`.

## Secret Handling

No Vercel bypass secret, service-role key, generated password, access token, refresh token, cookie value, or credential was committed or written into reports.

