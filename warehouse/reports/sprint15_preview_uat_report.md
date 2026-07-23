# Sprint 15 Preview UAT Report

Generated: 2026-07-24 09:35 AEST.

## Result

**Preview deployment: PASS. Full live browser UAT: NO-GO / blocked.**

The stable Preview alias now resolves to a Ready Preview deployment:

- Stable alias: `https://property-ai-sprint15-uat-zeebusiness93-2304s-projects.vercel.app`
- Deployment URL: `https://property-e060fqmec-zeebusiness93-2304s-projects.vercel.app`
- Deployment ID: `dpl_G3N8iLRX9ohy82JfGZ2D68gq4Xed`
- Target: Preview
- Created: 2026-07-24 09:33:52 AEST
- Branch/commit under test: `feature/sprint14-production-readiness` / `34eacc7e177aa47a8930de35f96bee9cf0f1a004`

## What was completed

- Verified PR #23 remains open, draft, and unmerged.
- Verified latest GitHub Actions for commit `5072ccc` is green.
- Verified all recent Vercel deployments created in this handoff were Preview deployments.
- Verified unauthenticated Preview requests remain protected by Vercel SSO.
- Enabled Vercel automation protection bypass while keeping SSO deployment protection active.
- Found the inherited branch-scoped Preview env entries existed but had empty values.
- Repaired only Sprint-branch Preview env values for:
  - `WAREHOUSE_PREVIEW_ENABLED`
  - `MULTI_STATE_RESEARCH_ENABLED`
  - `SCENARIO_LAB_ENABLED`
  - `DATA_OPERATIONS_ENABLED`
  - `PUBLIC_API_V1_ENABLED`
  - `WAREHOUSE_SUPABASE_URL`
  - `WAREHOUSE_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_SITE_URL`
- Confirmed `RESEARCH_COPILOT_ENABLED`, `ADMIN_EMAILS`, and `SUPABASE_SERVICE_ROLE_KEY` remain absent from Preview branch scope.
- Confirmed Production env listing was not modified.
- Verified live Preview HTTP responses and JS chunks for privileged credential leakage: zero matches.

## Live Preview smoke evidence

Using the Vercel automation bypass header without printing the secret:

- `/`, `/dashboard`: 200
- `/research`, `/research/explore`, `/research/map`, `/research/sources`, `/research/data-status`: 200
- `/research/postcode/0800`, `/research/postcode/2000`: 200
- `/research/compare?ids=0800,0810`: 200
- `/api/research/search-suggest?q=darwin`: 200
- `/api/v1`, `/api/v1/search?q=darwin`, `/api/v1/compare?ids=0800,0810`: 200
- `/api/v1/snapshot/SAL_70053_ASGS3_2021`: 200
- `/api/v1/export/SAL_70053_ASGS3_2021?format=json`: 200
- `/api/v1/export/SAL_70053_ASGS3_2021?format=csv`: 200
- `/admin`: 404
- `/research/copilot/0800`: 404
- `/definitely-not-a-real-route`: 404

Research pages included confidence labels, and data-status/postcode/detail/export paths visibly labelled unavailable/missing values rather than fabricating zeroes.

## Full browser UAT blocker

Full desktop/mobile browser UAT could not be completed safely. The Playwright CLI session could open the protected alias only to the Vercel SSO page. A temporary Vercel storage-state approach did not grant browser access, and injecting the raw bypass secret into Playwright command arguments or source files would violate the secret-handling rules.

Therefore these remain **not passed** on the real live Preview:

- sign-up/login/logout/session persistence in browser;
- two-user browser isolation across dashboard, reports, comparisons, portfolio, watchlist, and saved scenarios;
- keyboard/focus-order browser walkthrough;
- mobile visual UAT;
- authenticated direct browser mutation attempts.

The prior `sprint15_authenticated_uat_report.md` still provides DB-layer RLS evidence, but it is not a substitute for live browser UAT.
