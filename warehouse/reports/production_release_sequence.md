# Sprint 15 Production Release Sequence

Generated: 2026-07-24 23:07 AEST

## Current Position

This document is sequencing guidance only. No Production action was performed.

Current verified state:

- Branch: `feature/sprint14-production-readiness`
- Commit: `cddc7ae3152d6ec1b5dd2079b6f6f6a46f9960c3`
- PR #23: open, draft, unmerged
- Preview deployment: `dpl_7aPP8JxvA8hfWN9yGtMY7W7mZ3tA`, target `preview`
- Production Supabase ref: `oshquaxsloolqucwvigc`
- Production migrations: through 041 only
- Disposable migration rehearsal branch was deleted after use

## Recommended Order

1. Resolve the current live Preview UAT rerun/config-proof issue.
2. Run or explicitly waive the blank clean-database replay from migration 001 through 044.
3. Abdul decides whether PR #23 may leave draft status.
4. Abdul decides whether migrations 042-044 may be applied to Production.
5. Apply migrations 042-044 to Production in a dedicated DB-only window.
6. Re-run Production DB verification and application smoke checks.
7. Abdul separately approves merging PR #23.
8. Abdul separately approves any Production deployment/promotion.
9. Keep Admin and Copilot disabled unless each receives a separate enablement decision.

## Compatibility Windows

Old Production app with schema 044:

- Expected compatible.
- Reason: migrations 042-044 only add new tables, indexes, and policies. They do not change existing objects used by the current Production app.
- Static check: old `main` code has no references to the three new tables or `RESEARCH_COPILOT_ENABLED`.

Sprint 15 app with schema 044:

- Expected compatible.
- Unit/build/RLS checks pass.
- Prior live Preview UAT passed against `warehouse-validation`, which already has 042-044.
- Current rerun did not pass because the harness could not prove the public Supabase URL from the live root chunks, so do not use this document to claim final Preview acceptance by itself.

## PR Draft Status

Changing PR #23 from Draft to Ready for Review is a GitHub metadata action and is non-deploying by itself.

It is safe in the narrow sense that it does not merge code, does not deploy to Production, and does not apply database migrations. It may notify reviewers and may trigger any repository automation configured for `ready_for_review`; no such deployment action was observed in the checks reviewed here, but Abdul should verify GitHub/Vercel automation policy before toggling.

Recommendation: keep PR #23 draft until the Preview UAT rerun/config-proof issue and the clean `001 -> 044` rebuild evidence are resolved or explicitly waived.

## Stop Conditions

Stop before merge/deploy if:

- PR #23 is not the expected branch/commit.
- CI is not green.
- Preview target is not `preview`.
- Production migration ledger differs from expected through 041.
- Any secret is found in browser bundles, logs, traces, screenshots, reports, or Git.
- `RESEARCH_COPILOT_ENABLED` or `ADMIN_EMAILS` is set without explicit approval.
- The app would point authenticated UAT at `app.propellect.com.au` or Production Supabase.

## Expected Downtime

Database-only migrations 042-044: no planned downtime.

Application Production deployment: separate decision; not covered by this migration-only approval pack.
