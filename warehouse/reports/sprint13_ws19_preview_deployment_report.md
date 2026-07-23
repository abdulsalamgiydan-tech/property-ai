# Sprint 13 Workstream 19 — Preview Deployment Report

## What was done (with explicit user approval before any shared-environment change)

1. Added 7 environment variables to Vercel's **Preview** environment,
   scoped **only** to the `feature/sprint13-private-beta` git branch (not
   "all Preview branches", not Production):
   `WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`,
   `SCENARIO_LAB_ENABLED`, `PUBLIC_API_V1_ENABLED`,
   `DATA_OPERATIONS_ENABLED` (all `true`), `WAREHOUSE_SUPABASE_URL`,
   `WAREHOUSE_SUPABASE_ANON_KEY` (values sourced from local `.env.local`,
   never printed to any output). Verified via `vercel env ls production`
   that Production's 4 existing env vars are completely untouched.
2. Found and fixed a real deploy blocker: `vercel deploy` failed with
   "Request body too large. Limit: 10mb" because there was no
   `.vercelignore`, and the CLI's own file-scanning doesn't reliably
   honour `.gitignore` the same way `git` does — it was scanning
   `warehouse/data/` (11GB of local-only raw data, already gitignored,
   never committed). Added `.vercelignore` mirroring the relevant
   `.gitignore` entries; this is a genuine repo improvement, not a
   workaround, and is committed so future deploys (by anyone) don't hit
   the same wall.
3. Deployed successfully via `vercel deploy` (no `--prod` flag, ever):
   - **Deployment ID**: `dpl_3wHUerP5UsbiJE3eA1yTD6seauxM`
   - **Target**: `preview` (confirmed via `vercel inspect`, never
     `production`)
   - **Status**: Ready
   - **URL**: `https://property-66z1ujs87-zeebusiness93-2304s-projects.vercel.app`
   - Build genuinely completed (confirmed via `vercel inspect`: proper
     Next.js middleware + 157+ route/output artifacts, not a stub).

## What could not be completed this pass: live external browser testing

The deployment sits behind Vercel's **team SSO deployment protection** —
every request to the preview URL 302-redirects to
`vercel.com/sso-api` for team-member login (confirmed via `curl -D -`).
This is the **correct, expected behaviour** for a private-beta project on
a team plan, not a bug — it's exactly what keeps an unreleased private
beta from being publicly crawlable. It does mean:

- My own automated tooling (`curl`, and gstack's isolated headless
  Chromium instance, which has no Vercel login session) cannot get past
  the SSO gate to browser-test the live URL.
- I deliberately did **not** attempt to disable or bypass deployment
  protection — that's a project security-posture change, out of scope
  for this workstream, and would work against the private-beta's own
  purpose.

**What this does NOT mean**: this is not a failed build, and it's not
evidence the app doesn't work — every one of Phase 1/2's new features
(search, suburb/postcode profiles, Scenario Lab v2, comparison reorder,
report export) was already live-browser-tested against a local dev
server running the exact same code, with real warehouse data, throughout
this session (see the Phase 1/2 browser test reports).

## Exact remaining human action

Open `https://property-66z1ujs87-zeebusiness93-2304s-projects.vercel.app`
in a browser where you're already signed in to the
`zeebusiness93-2304s-projects` Vercel team (the SSO gate will pass
automatically) to complete a manual click-through — search, a suburb
profile, Scenario Lab, comparison, watchlist, and the new report export
are the highest-value paths to check. No further Vercel-side setup is
needed; the branch-scoped env vars and the deployment are already in
place.
