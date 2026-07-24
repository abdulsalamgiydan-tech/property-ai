# Sprint 15 Production Release Sequence

Generated: 2026-07-25 08:20 AEST

## Current Position

This document is sequencing guidance only. No Production action was performed.

Current verified state:

- Branch: `feature/sprint14-production-readiness`
- App commit tested in Preview: `6a9f2a0ee10542d7fb3d2be8f0e939937b3487be`
- PR #23: open, draft, unmerged
- Preview deployment: `dpl_nznUFhJs2NnjxoN861DGa9YKPxUg`, target `preview`
- Production Supabase ref: `oshquaxsloolqucwvigc`
- Production migrations: through 041 only
- Disposable migration rehearsal branch was deleted after use

## Recommended Order

1. Abdul decides whether PR #23 may leave draft status.
2. Abdul decides whether migrations 042-044 may be applied to Production.
3. Apply migrations 042-044 to Production in a dedicated DB-only window only after approval.
4. Re-run Production DB verification and application smoke checks.
5. Abdul separately approves merging PR #23.
6. Abdul separately approves any Production deployment/promotion.
7. Keep Admin and Copilot disabled unless each receives a separate enablement decision.

## Compatibility Windows

Old Production app with schema 044:

- Expected compatible.
- Reason: migrations 042-044 only add new tables, indexes, and policies. They do not change existing objects used by the current Production app.
- Static check: old `main` code has no references to the three new tables or `RESEARCH_COPILOT_ENABLED`.

Sprint 15 app with schema 044:

- Expected compatible.
- Unit/build/RLS checks pass.
- Deterministic Preview configuration attestation passes and proves warehouse-validation config.
- Final protected authenticated Preview UAT passed 16 checks against `warehouse-validation`.

## PR Draft Status

Changing PR #23 from Draft to Ready for Review is a GitHub metadata action and is non-deploying by itself.

It is safe in the narrow sense that it does not merge code, does not deploy to Production, and does not apply database migrations. It may notify reviewers and may trigger any repository automation configured for `ready_for_review`; no such deployment action was observed in the checks reviewed here, but Abdul should verify GitHub/Vercel automation policy before toggling.

Recommendation: PR #23 may leave draft only if Abdul explicitly approves.

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

Application Production deployment: separate decision; not performed here.
