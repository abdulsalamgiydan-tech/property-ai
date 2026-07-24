# Final Preview UAT Report

Generated: 2026-07-25 08:20 AEST

## Result

PASS.

The final live protected authenticated browser UAT passed against the real Vercel Preview deployment using the scoped Vercel automation bypass and two dedicated warehouse-validation Supabase users.

## Final Preview Under Test

- Deployment ID: `dpl_nznUFhJs2NnjxoN861DGa9YKPxUg`
- Stable alias: `https://property-ai-git-feature-spr-48904f-zeebusiness93-2304s-projects.vercel.app`
- Target: Preview
- Branch: `feature/sprint14-production-readiness`
- Commit: `6a9f2a0ee10542d7fb3d2be8f0e939937b3487be`

## Evidence

- `node tests/uat/sprint15-preview-browser-uat.mjs` returned `{"status":"pass","checks":16}`.
- Redacted evidence artifact: `uat-artifacts/sprint15-browser/sprint15-browser-uat-evidence.json`.
- Auth method: administrator-managed password repair for existing dedicated warehouse-validation UAT users, followed by real Supabase password sign-in.
- User A: dedicated free-tier UAT user.
- User B: dedicated investor-pro UAT user.
- `vercel curl /api/diagnostics/preview-config --deployment property-ai-git-feature-spr-48904f...` returned safe JSON and `configurationOk: true`.
- Direct unauthenticated HTTP to the diagnostic route returned 302 to Vercel SSO, proving Deployment Protection remains active.
- Production smoke check returned HTTP 200 for `https://app.propellect.com.au/`.
- GitHub Actions passed for commit `6a9f2a0ee10542d7fb3d2be8f0e939937b3487be`; final docs-only commit `1ca233c32dbee47c6d8ad7ae0d033d004c9ecacd` also had green PR checks before the final harness/report update.

## Passed Checks

- Preview configuration attestation.
- User A and User B authenticated dashboards.
- Branch UAT user data cleanup.
- Browser direct RLS inserts.
- Free-user Scenario Lab limit.
- Elevated-user Scenario Lab allowance.
- Dashboard cross-user isolation.
- Direct report URL isolation.
- Direct REST read/write cross-user isolation.
- Self-elevation rejection.
- Desktop product journeys.
- Mobile and keyboard smoke.
- Public API v1 search, compare, and export.
- Disabled Admin and Copilot behavior.
- Sign-out and unauthenticated state.

## Harness Fix

The final pass required a UAT harness correction: direct Supabase REST probes now use the warehouse-validation anon key as `apikey` and the signed-in user's JWT as `Authorization`. The service-role key remains only in the Node process for Admin API repair of the two dedicated UAT users and is not passed into the browser context.

## Not Performed

- No Production deployment.
- No Production database mutation.
- No Production Auth mutation.
- No Admin enablement.
- No Copilot enablement.
