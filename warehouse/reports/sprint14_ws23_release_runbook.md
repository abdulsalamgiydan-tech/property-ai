# Sprint 14 — Workstream 23: Release Engineering (Runbook)

This is a runbook for taking `feature/sprint14-production-readiness`
from its current state to production — not an automated pipeline. No
deployment, migration, or env var change happens by running this
document; each step below requires the explicit human approval this
project has required for every production-touching action all sprint.

## Current state (as of commit `7a2d356`)

- 23 commits on `feature/sprint14-production-readiness`, off
  `feature/sprint13-private-beta` @ `89f1766`.
- CI green on every commit (`Warehouse Validation` GitHub Actions
  workflow).
- 416/416 tests passing, 0 lint errors, build passes — all
  independently re-verified fresh as part of this workstream (not
  re-quoted from an earlier report).
- No merge to `main`. No production deploy this sprint.

## Step 1 — Decide on the 3 pending migrations

Three additive migrations are written, statically tested, and covered
by `warehouse:rls:check`, but **not applied to production**:

| Migration | Backs | Fails safe without it? |
|---|---|---|
| `042_research_copilot_queries.sql` | WS5 rate limiting/audit | Yes — `countRecentQueries()` treats a missing table as "allow through" |
| `043_onboarding_preferences.sql` | WS2 onboarding | Yes — `getOnboardingStatus()` treats a missing table as "already completed" |
| `044_user_feedback.sql` | WS21 feedback widget | Partially — submissions fail with a friendly error, not a crash, but feedback can't actually be collected until applied |

None of these are required for the branch to be safe to deploy — every
consuming feature degrades gracefully. Apply them (with explicit
approval, one at a time, independently re-verified via live
`information_schema` queries after each, matching how migration 041
was handled this sprint) whenever the corresponding feature should
start actually working.

## Step 2 — Decide on the 2 new env vars for WS20 (beta admin)

`SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_EMAILS` are both required before
`/admin` shows any data — currently unset in every environment. **Read
`sprint14_ws20_beta_admin_report.md`'s "Risk / correctness notes"
section before setting these** — the service-role key bypasses RLS
entirely for the environment it's configured in.

## Step 3 — Decide on feature flags to enable

Every new feature this sprint defaults to **off**:

| Flag | Feature | Default |
|---|---|---|
| `RESEARCH_COPILOT_ENABLED` | WS5 grounded AI copilot | unset (off) |
| (onboarding has no flag — gated by migration 043 + auth flow only) | WS2 | inert without migration 043 |

Existing flags (`WAREHOUSE_PREVIEW_ENABLED`, `SCENARIO_LAB_ENABLED`,
`MULTI_STATE_RESEARCH_ENABLED`, `PUBLIC_API_V1_ENABLED`,
`DATA_OPERATIONS_ENABLED`) are unchanged from Sprint 13's configured
state — this sprint added no new base-gate requirements to existing
features.

## Step 4 — Preview deployment (not yet configured this sprint)

`feature/sprint14-production-readiness` has no Preview Vercel env vars
configured — Sprint 13's 7 research-flag vars are still scoped only to
`feature/sprint13-private-beta`. To preview this branch's work before
merging:

```
vercel env add WAREHOUSE_PREVIEW_ENABLED preview feature/sprint14-production-readiness --value true --yes --non-interactive
# ...repeat for the other flags actually wanted in preview, following
# the exact pattern documented in Sprint 13's WS19 report.
```

Not run as part of this workstream — deploying anything, even to
Preview, was not requested and is exactly the kind of action this
project's guardrails ask to be confirmed first.

## Step 5 — Merge to `main`

Only after Steps 1-4 are resolved to the user's satisfaction. Standard
PR flow — `gh pr create` from this branch against `main`, review the
full diff (23 commits, ~30 files touched across 16 workstreams), merge.
No merge to `main` has happened this sprint; this step is intentionally
last and intentionally not automated here.

## Step 6 — Production deploy

`vercel deploy --prod` (or the project's configured CI/CD deploy step,
if `main` merges trigger one automatically — verify this before
merging, since an automatic-deploy-on-merge configuration would make
Step 5 and Step 6 the same action). Never run without explicit,
in-the-moment approval, regardless of what this runbook says — a
runbook is guidance, not standing authorization.

## Rollback

If a production deploy needs to be rolled back: Vercel's own deployment
history allows instant rollback to the previous production deployment
(`vercel rollback` or via the dashboard) — no code changes required.
Database migrations are additive-only this sprint (no column drops, no
data mutations to existing rows), so a code rollback does not strand
the database in an incompatible state.
