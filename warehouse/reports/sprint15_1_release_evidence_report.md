# Sprint 15.1 Release Evidence Report

Generated: 2026-07-24 23:55 AEST

## Summary

Sprint 15.1 closed the clean migration replay and Preview configuration proof gaps. Final protected authenticated browser UAT remains blocked by missing local access to a valid Vercel automation bypass secret.

## Evidence Closed

- Clean migration replay `001 -> 044`: PASS via GitHub Actions run `30097008506`.
- Deterministic Preview configuration attestation: PASS on deployment `dpl_7ShCWjiUb2VcX4a97ZtLETcNva2M`.
- Final commit CI: PASS for push and pull request runs on `5f52efb1cf9de0dc9febb8e417fb18bf5fdfc3c2`.
- Deployment Protection: still active; unauthenticated Preview request returned Vercel SSO 302.
- Production smoke: `https://app.propellect.com.au/` returned HTTP 200.

## Remaining Gap

Final protected authenticated browser UAT is BLOCKED. Do not treat the prior 16-check UAT pass as final acceptance for commit `5f52efb1cf9de0dc9febb8e417fb18bf5fdfc3c2`.

## Release Decisions

| Decision | Status | Reason |
|---|---:|---|
| PR #23 ready to leave draft | NO-GO | Final live authenticated UAT is blocked. |
| Code merge | NO-GO | Final live authenticated UAT is blocked and user prohibited merge. |
| Migrations 042-044 Production application | CONDITIONAL GO | Clean chain and Production-shaped rehearsal evidence pass; still requires Abdul's separate Production DB approval. |
| Core Production deployment | NO-GO | Final protected authenticated Preview UAT is blocked. |
| Admin enablement | NO-GO | `ADMIN_EMAILS` remains disabled and has no enablement approval. |
| Copilot enablement | NO-GO | `RESEARCH_COPILOT_ENABLED` remains disabled and has no enablement approval. |

## Production Safety

No Production deployment, Production database mutation, Production Auth mutation, Production environment-variable edit, PR merge, Admin enablement, or Copilot enablement was performed.
