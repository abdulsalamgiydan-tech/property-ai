# Sprint 15 Final Migration Go/No-Go

Generated: 2026-07-24 23:07 AEST

## Recommendation

**CONDITIONAL GO for migrations 042-044 as database changes. NO-GO for Production deployment today until the Preview UAT rerun/config-proof issue is resolved or explicitly waived.**

## Decision Matrix

| Decision | Status | Evidence |
|---|---:|---|
| Apply migrations 042-044 to Production after explicit approval | CONDITIONAL GO | Rehearsed successfully on one disposable non-production Supabase branch created from Production baseline through 041. All three migrations are additive and RLS-covered. |
| Merge PR #23 | NO-GO now | PR remains draft/open/unmerged. User explicitly prohibited merge. |
| Deploy app to Production | NO-GO now | User explicitly prohibited Production deploy. Current live Preview UAT rerun did not pass. |
| Enable Admin | NO | `ADMIN_EMAILS` must remain unset unless separately approved. |
| Enable Copilot | NO | `RESEARCH_COPILOT_ENABLED` must remain unset unless separately approved. |
| Mark PR #23 Ready for Review | CONDITIONAL | Non-deploying GitHub metadata action by itself, but keep draft until UAT/config-proof and clean-chain evidence gaps are resolved or waived. |

## Passed Evidence

- Repo clean at start on `feature/sprint14-production-readiness`.
- PR #23 open, draft, unmerged.
- GitHub Actions green for commit `cddc7ae3152d6ec1b5dd2079b6f6f6a46f9960c3`.
- Production Supabase migration history still ends at 041 before and after rehearsal.
- One disposable branch created after cost confirmation: `sprint15-migration-042-044-rehearsal`, ref `umdpjizroetwblwowcrx`.
- Branch was non-default, non-persistent, schema-only, and parented to Production.
- 042, 043, and 044 applied successfully to that branch in order.
- Post-apply schema, RLS, policy, index, trigger/function, lock, and row-count checks completed.
- Rollback SQL validated inside a transaction.
- Supabase advisors produced no new findings attributable to the three new tables.
- Disposable branch deleted successfully and no longer appears in branch list.
- Local checks:
  - `npm run lint`: passed, 0 errors, 6 warnings.
  - `npm run test`: passed, 49 files, 442 tests.
  - `npm run build`: passed.
  - `npm run warehouse:check`: passed.
  - `npm run warehouse:rls:check`: passed.
  - `npm run warehouse:lineage:check`: passed.
- Redacted repository secret scan found only fake test connection strings using `pw`/`pass`.
- Built artifact secret-name scan found zero forbidden server-only secret names.

## Blockers And Conditions

### Blocker 1: full clean `001 -> 044` replay not completed

Severity: Medium for migration approval evidence.

Evidence:

- `psql`, Docker, and Supabase CLI are not installed locally.
- The single approved paid resource was a Supabase branch created from Production baseline, which proves `041 -> 044` but not blank replay from repository migration `001`.

Required action:

- Run a blank migration replay in an environment with PostgreSQL/Supabase CLI/Docker, or explicitly waive this evidence requirement.

Blocks:

- Full evidence claim.
- Does not by itself show a defect in migrations 042-044.

### Blocker 2: live Preview UAT rerun did not pass

Severity: High for Production application deployment, Low for DB-only migration approval.

Evidence:

- `node tests/uat/sprint15-preview-browser-uat.mjs` failed before authentication with: `Preview public Supabase URL is not warehouse-validation`.
- Redacted root HTML/chunk scanning found no Production Supabase ref and no forbidden secret markers, but also found no Supabase ref at all in the root chunk set.

Required action:

- Reconcile the UAT harness with current Turbopack chunking or otherwise prove the live Preview public Supabase config through the real app flow.
- Re-run authenticated two-user Preview UAT after the proof path is fixed.

Blocks:

- Production app deployment.
- Does not block DB-only additive migration approval if Abdul separates migration approval from application deployment approval.

## Production Safety

- No PR merge.
- No Production Vercel deployment or promotion.
- No Production Vercel environment variable edit.
- No Production database mutation.
- No Production Auth mutation.
- Production Supabase ref `oshquaxsloolqucwvigc` remains through migration 041 only.
- Disposable branch was deleted; hourly branch billing should be stopped.

## Final Classification

Migration 042-044 Production DB approval: **CONDITIONAL GO**.

Core Production application release: **NO-GO until live Preview UAT rerun passes or Abdul explicitly accepts the risk.**
