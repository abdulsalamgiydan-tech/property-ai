# Final Preview UAT Report

Generated: 2026-07-24 23:55 AEST

## Result

BLOCKED.

The final live authenticated browser UAT was not marked passed. The final Preview deployment is reachable through `vercel curl`, and deterministic Preview configuration attestation passes, but Playwright cannot access the protected Preview because no currently available local secret unlocks Vercel Deployment Protection.

## Final Preview Under Test

- Deployment ID: `dpl_nznUFhJs2NnjxoN861DGa9YKPxUg`
- Stable alias: `https://property-ai-git-feature-spr-48904f-zeebusiness93-2304s-projects.vercel.app`
- Target: Preview
- Branch: `feature/sprint14-production-readiness`
- Commit: `6a9f2a0ee10542d7fb3d2be8f0e939937b3487be`

## Passed Before Blocker

- `vercel curl /api/diagnostics/preview-config --deployment property-fbas0vrqs...` returned safe JSON and `configurationOk: true`.
- Direct unauthenticated HTTP to the diagnostic route returned 302 to Vercel SSO, proving Deployment Protection remains active.
- Production smoke check returned HTTP 200 for `https://app.propellect.com.au/`.
- GitHub Actions passed for commit `5f52efb1cf9de0dc9febb8e417fb18bf5fdfc3c2`.

## Blocker

Severity: High for Preview acceptance and Production application release.

Evidence:

- `node tests/uat/sprint15-preview-browser-uat.mjs` failed before authentication because the browser received HTML instead of the attestation JSON.
- Redacted failure artifact: `uat-artifacts/sprint15-browser/sprint15-browser-uat-failure.json`.
- Clipboard candidates were tested in memory against the final Preview attestation endpoint and none unlocked the deployment.
- Vercel project protection still reports one automation-bypass configuration, but the locally available metadata value does not unlock HTTP access.

Required human action:

Copy the current Vercel Protection Bypass for Automation secret from the Vercel dashboard, return here, and reply `clipboard ready`. Do not paste the secret into chat. If the warehouse-validation service-role key is not already available in the same clipboard payload, place it on the next line below the bypass secret. Do not include user passwords.

## Not Claimed

- Password authentication: not rerun on the final commit.
- Two-user browser/RLS isolation: not rerun on the final commit.
- Product journey UAT: not rerun on the final commit.
- Mobile/keyboard UAT: not rerun on the final commit.
