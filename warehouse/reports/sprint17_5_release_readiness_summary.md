# Sprint 17.5 Release Readiness Summary

Date: 2026-07-30 / reconciled 2026-07-31
Branch: `feature/sprint17-major-product-expansion`
PR: [#24](https://github.com/abdulsalamgiydan-tech/property-ai/pull/24) (open, draft, unmerged)

**FINAL RECONCILED HEAD (supersedes all earlier SHAs in this document):**
`621d8bc5e760bd695b69bd839d4af8fba47cf00b`

The following commit SHAs appear earlier in this document's history and are
**stale** — none of them is the current PR head. They are kept in the
narrative below only as a record of what happened at each step, not as a
release target:
- `ee33c67` — stale (4 commits behind final head).
- `22bf12861469ead81cd55f0fb4169a0576eb9494` — stale (5 commits behind final
  head). **Any prior approval sentence referencing this SHA is void and must
  not be used.**
- `c274438` — stale (1 commit behind final head).

Preview deployment (rebuilt and re-verified against the final head during
reconciliation): `dpl_HoG6HZDhxSPTxKW6RTWJBtNGN8RG`
Preview URL: `https://property-p2e0q0c2y-zeebusiness93-2304s-projects.vercel.app`
(The earlier-cited `dpl_GkuzV4UW4ta2ENWGF3QpooVfKiE2` /
`property-77uznynty-...` was confirmed stale — built from `22bf128` — and is
superseded by the deployment above.)
Supabase (Preview/UAT): `warehouse-validation` (ref `lzonauinzatmtytyoems`) — confirmed distinct from Production (`oshquaxsloolqucwvigc`)

This supersedes `sprint17_implementation_matrix.json` (generated 2026-07-25,
before this verification pass) and the blocker recorded in
`sprint17_preview_uat_checkpoint.md` (2026-07-25). Both are stale; the matrix
in particular still lists onboarding/feedback/copilot/admin as
"pending"/"first slice", which independent re-verification below shows is no
longer accurate.

## What this closeout actually did

The Sprint 17.5 brief assumed most of the product still needed to be built.
Before doing any implementation work, three independent Explore agents
re-verified the codebase against that assumption rather than trusting it.
Finding: **the large majority of the product was already built and
test-covered.** This closeout therefore did not rebuild onboarding, settings,
the warehouse layer, Research Hub, API v1, Copilot, or the ops console — it
closed four specific, evidence-based gaps and then ran real, live,
end-to-end verification against Preview.

## Gap 1 — Authenticated Preview UAT / Supabase SSR session blocker

**Root cause 1 (found, fixed, then corrected after live testing exposed a
mistake in the first fix):** the UAT harnesses'
`obtainSession()`/`signInApprovedUser()` called `supabase.auth.signOut()`
immediately after signing in, before handing the session off to be seeded
into a Playwright browser context as cookies. The first fix attempt used
`scope: "local"`, based on the common assumption that `"local"` means
"client-only, no server call." Live verification against warehouse-validation
proved this assumption wrong for the installed `@supabase/auth-js` 2.103.3:
`signOut()` **always** calls the server's `admin.signOut` endpoint when an
access token is present, and `scope: "local"` still revokes the *current*
session server-side (confirmed directly: calling `/auth/v1/user` afterwards
returned `403 session_not_found` even calling Supabase directly, no app
involved). Only `scope: "others"` revokes every *other* session while leaving
the current one alive. Fixed in `tests/uat/sprint17-preview-uat.mjs` and
`tests/uat/sprint15-preview-browser-uat.mjs`.

**Root cause 2 (found only once the above was actually fixed and the harness
ran far enough to reach it):** the feedback-cleanup step reported
`preview_feedback_cleanup: pass` on every prior run without actually deleting
anything. `user_feedback` deliberately has no `delete` policy for
authenticated users (append-only by design — see `KNOWN_EXCEPTIONS` in
`warehouse/scripts/quality/check_rls_policies.mjs`), so a `delete()` call
through the anon-key *user* client is silently filtered by RLS: PostgREST
returns success with zero rows affected, not an error. One orphaned test
feedback row from an earlier run was found and removed as part of this
verification. Cleanup now goes through the service-role admin client and
asserts both an exact rows-deleted count and a post-delete existence check.

**Live verification (not a generated report — an actual run against the
deployed Preview app for this PR's exact head commit):**

- Preview attestation: commit/branch match, warehouse-validation confirmed on
  both app and warehouse sides, no admin/service-role leakage, all Sprint 17
  feature flags in the expected state.
- Sign-in for User A (`eaf666ed-0f3c-4ada-b10c-275cc9596505`) and User B
  (`c460f3be-c7d1-4b14-9b85-bdeb773dc312`) via real `signInWithPassword`.
- Session persisted across every authenticated route in a single browser
  context: dashboard, onboarding, settings (separate context, same session),
  analyse-property, compare-properties, portfolio, watchlist, and all
  research routes (explore, suburb, postcode, map, compare, scenario,
  copilot).
- `/operations` and `/admin` correctly return 404 for a non-allowlisted user
  (server-side gate, not a client-side one).
- Unknown route correctly renders 404.
- API v1 search + validation, map-bounds validation: correct status codes.
- Feedback submission, invalid-payload rejection, and cleanup: all pass, with
  cleanup independently re-verified afterward (0 residual rows).
- Copilot input validation and route reachability: pass.
- Mobile viewport + keyboard focus smoke: pass.
- 30/30 checks passed. Console errors present (27) are exclusively Vercel's
  own preview toolbar script being blocked by the app's Content-Security-
  Policy, and expected 404 resource loads on the intentional 404 test route —
  neither is an app defect; the CSP blocking Vercel's own injected script is
  a sign of a properly strict policy.
- Independently re-verified zero residual UAT feedback rows via a separate
  service-role query after each run, not just trusting the harness's own
  assertion.

**Classification: GO.**

## Gap 2 — Feedback "idea" category

Migration `045_sprint17_preferences_feedback_controls.sql` already permitted
`category in (..., 'idea', ...)` at the database check-constraint level, but
`lib/feedback/schema.ts` and `components/feedback/FeedbackWidget.tsx` never
caught up, leaving the category inert. Fixed additively (no new migration):
schema tuple, widget dropdown, and test coverage extended (2 new test cases).
Full suite green (485 tests).

**Classification: GO.**

## Gap 3 — Missing secret-scan / dependency-audit CI gate

No workflow previously scanned for leaked secrets or ran `npm audit` as an
automated gate — the documented dev/tooling exception
(`dependency_release_exception.md`, expires 2026-08-24) was enforced only
manually. Added `warehouse/scripts/quality/check_secrets.mjs` (cloned from
this repo's existing static-check idiom — pure `fs`/`execSync` + regex, no
external tool dependency) covering three scans: git-tracked source, built
`.next/` artifacts, and `.next/**/*.js.map` source maps — deliberately
excluding `.next/cache` and `.next/dev`, which are Next.js/Turbopack's own
incremental build and dev-server caches and are never shipped to users. New
workflow `.github/workflows/secret-scan.yml` runs this plus
`npm audit --omit=dev --audit-level=high`.

Ran once soft-gated (`continue-on-error`) against real tracked source and a
genuine `npm run build` production output to rule out false positives before
flipping it to a hard blocker in the same PR cycle — it passed clean on the
first real run with zero findings, so no false-positive shakeout period was
needed. Confirmed green on real GitHub Actions CI (not just locally) both as
the soft-gated first run and the subsequent hard-gated run.

**Classification: GO.**

## Gap 4 — Credential access for live verification

Vercel CLI was installed, logged in, and linked to the correct project
(`zeebusiness93-2304s-projects/property-ai`). Every environment variable
across Preview, Production, and every branch scope was enumerated via
`vercel env ls` — none of `UAT_USER_A/B_EMAIL/PASSWORD`,
`WAREHOUSE_VALIDATION_SUPABASE_SERVICE_ROLE_KEY`, or
`VERCEL_AUTOMATION_BYPASS_SECRET` exist there. Abdul supplied these four
directly; they were written only to a local, gitignored `.env.uat.local`
(never echoed, logged, or committed) and used to run the live verification
in Gap 1.

**Classification: GO** (credential path closed for this session; the values
live only in the local UAT operator's environment, not in source control or
Vercel).

## Everything independently re-verified as already complete (not rebuilt)

| Area | Verdict | Evidence |
| --- | --- | --- |
| Onboarding | GO | `app/onboarding`, `user_onboarding_preferences` (migration 043), save/resume/skip/edit-later, client+server validation, `lib/onboarding/preferences.test.ts` |
| Settings | GO | `app/settings` → `SettingsClient.tsx`, same table, RLS-protected |
| Warehouse migrations | GO | 46 migrations, all with `.test.ts` coverage, static RLS/lineage checks pass |
| Research Hub | GO | 7 routes under `app/research/**`, all data-backed, freshness display via `MarketSnapshotView.tsx` |
| API v1 | GO | 10 endpoints, versioned envelope + `request_id` + rate limiting + map-bounds validation + OpenAPI spec (`PUBLIC_API_V1_OPENAPI.yaml`) |
| Property Copilot (Preview) | GO | server-side auth + double feature-flag gate (default off), per-user daily/instance rate limits, 15s timeout, grounding/citation check, redacted logging |
| Operations console (Preview) | GO | `INTERNAL_OPERATIONS_ENABLED` + auth + `ADMIN_EMAILS` allowlist, all server-side, read-only |
| Dependency security | GO | `npm audit --omit=dev --audit-level=high` → 0 vulnerabilities; documented, criteria-checked dev/tooling exception, expiry 2026-08-24 |

## Quality gates run this session

- `npm test`: 58 files, 485 tests passed.
- `npm run lint`: 0 errors, 8 pre-existing unrelated warnings (unchanged).
- `npm run build`: passes; used to produce genuine `.next/` output for the
  secret-scan artifact check (not a stale dev cache).
- `npm run warehouse:check`, `warehouse:rls:check`, `warehouse:lineage:check`:
  all pass (46 migrations, 88/88 lineage combinations populated).
- `npm audit --omit=dev --audit-level=high`: 0 vulnerabilities.
- New: `warehouse/scripts/quality/check_secrets.mjs` — 0 findings against
  tracked source and real production build output; confirmed on real GitHub
  Actions CI, not just locally.
- Live authenticated Preview UAT: 30/30 checks passed against the exact PR
  head commit's deployment, with independently re-verified data cleanup.

## Gap 5 — Migration replay and rollback rehearsal (added after initial closeout)

The existing `clean-migration-replay` CI job (manual-dispatch only) replays
001-046 into a fresh disposable Postgres, but rollback documentation only
covered migrations 042-044 (`production_migration_rollback.md`,
2026-07-24) — migrations 045 and 046, added in Sprint 17, had no rollback
coverage at all.

Added `scripts/rollback-045-replay-test.mjs`, wired as a new step in the
`clean-migration-replay` job immediately after the forward replay, so the
exact rollback SQL for 045 is applied to the SAME freshly-replayed
disposable database and asserted column-by-column (13 dropped onboarding
columns, 6 dropped feedback columns, 2 dropped indexes, all pre-045
columns and RLS settings preserved) — 33 individual assertions. Migration
046 is grant-only (no schema objects added or removed), so no structural
rollback is provided for it; `production_migration_rollback_042_046.md`
documents why a blanket grant revert would be counterproductive and what
to do instead if a specific grant needs restoring.

**Manually dispatched the `warehouse-validation.yml` workflow against this
PR's exact head commit (`de115b4`)** per the brief's explicit requirement
— not just run once in the abstract. Result: `clean-migration-replay` job
passed in 1m38s including all 33 rollback assertions; the standard
build/lint/test job and both PR-triggered checks (Secret Scan, Warehouse
Validation) also passed on the same commit.

**Classification: GO.**

## Gap 6 — Copilot and admin console security test coverage

A follow-up survey found the brief's security-test-coverage claim for
Property Copilot and the admin console was not accurate: only 7 of 22
required scenarios (prompt injection, data exfiltration, cross-user
access, entitlement bypass, oversized prompt, conflicting dates, timeout,
repeated submission for Copilot; server-side auth, deny-by-default,
no-client-only-gate, no-secret-exposure, no-service-role-in-browser,
no-self-elevation, unauthorized-access-rejected, access-logged for admin)
had dedicated tests. Both features' *implementations* were independently
re-confirmed correct before writing any test — this closed a verification
gap, it did not change either feature's behavior except one item below.

Closed 8 of 9 items as pure test additions against already-correct code
(`app/api/research/copilot/route.test.ts`, `lib/research/copilotEvidence.test.ts`,
new `lib/strategy/sanitiseUserText.test.ts`, `lib/research/copilotClient.test.ts`).
One item (conflicting dates) was documented as not applicable — the
evidence pack is a single deterministic per-geography snapshot, there is
no multi-source date-reconciliation logic to test, and fabricating one
would be a new feature, not a test fix.

**Flag for Abdul — entitlement scope discrepancy, not silently resolved
either direction:** `lib/auth/entitlements.ts` declares
`FEATURE_MIN_TIER.research_preview: "free"` — i.e. no tier gate is
currently intended for Copilot at all; sign-in + feature flags + rate
limits are the only gates. This matches the code's own architecture, but
the original Sprint 17.5 brief's Workstream J listed "entitlement checks"
as a requirement for Copilot. A test now pins the current "any
authenticated user, any tier, gets 200" behavior so a future change is
deliberate rather than a silent regression — but whether Copilot should
gain a real tier gate before wider release is a product decision, not
something resolved unilaterally here.

One item (admin access-attempt logging) required a small additive,
non-behavioral code change, confirmed with Abdul before making it: added
`lib/auth/logAdminAccessDenied.ts` (one `console.warn` logging only
`{hasUser, userId}` — never email/PII) wired into `app/admin/page.tsx`
immediately before the existing allowlist-rejection `notFound()` call,
plus a new `lib/auth/logAdminAccessDenied.test.ts`.

Verified: full suite green, lint clean (0 errors, same 8 pre-existing
unrelated warnings), production build passes. Commit `30c7134` at the time,
superseded by `c274438` (fixed a self-inflicted secret-scan false positive
in one of these new tests — see the reconciliation section below) and then
`621d8bc` (final head).

**Note on a prior miscount:** this section originally claimed "527 tests."
A fresh, independent `npm ci && npm test` during final reconciliation
found **506 tests across 60 files** — the 527 figure was wrong (an
uncorrected estimate in a commit message, not a verified count). 506 is
the correct, currently-verified number.

**Classification: GO.**

## Not touched this session (out of scope / explicitly frozen)

- Production database, Production deployment, Production environment
  variables, Production Auth, Admin-in-Production, Copilot-in-Production —
  none were modified, per the sprint's non-negotiable safety rules.
- Upgrade-replay rehearsal specifically (applying only 045-046 on top of a
  Production-equivalent 044 baseline, as opposed to a full 001-046 clean
  replay): not separately re-run this session. The clean replay already
  exercises 045/046 identically regardless of what preceded them (each
  migration is additive and idempotent via `if not exists`/`if exists`
  guards), so the two replay modes are not expected to diverge for these
  two migrations specifically; flagged here rather than silently assumed
  equivalent.

## Final Release Reconciliation (2026-07-31)

Performed against the exact final PR head after three prior SHAs
(`ee33c67`, `22bf128`, `c274438`) were superseded by later commits within
the same session. Full phase-by-phase detail (branch/PR agreement, Preview
re-verification, re-run gates, diff classification, migration detail, UAT
re-run, entitlement decision, credential housekeeping) is in the chat
record for this reconciliation; the operative conclusions are:

- Local HEAD, `origin/feature/sprint17-major-product-expansion`, and PR #24
  headRefOid all agree on `621d8bc5e760bd695b69bd839d4af8fba47cf00b`.
  Working tree clean. No unexplained commits, no force-push/rewrite (reflog
  shows only ordinary `commit` entries).
- The previously-cited Preview (`dpl_GkuzV4UW4ta2ENWGF3QpooVfKiE2`) was 4
  commits stale. Vercel's normal auto-deploy had already built a correct
  Preview for the final head (`dpl_HoG6HZDhxSPTxKW6RTWJBtNGN8RG`); its
  attestation confirms exact commit match, warehouse-validation on both
  sides, Production ref absent, admin/service-role absent. The live
  authenticated UAT harness was re-run against this deployment (not reused
  from the older one): 30/30 checks pass, feedback cleanup deleted exactly
  1 row, 0 residual rows independently re-verified afterward.
- All required quality gates re-run from a clean `npm ci` on the final
  head: lint (0 errors), test (506 tests / 60 files), build, warehouse
  file/RLS/lineage checks, `npm audit --omit=dev --audit-level=high` (0
  vulnerabilities), full `npm audit` (2 advisories, both matching the
  documented dev/tooling exception, no new advisories), secret scan (0
  findings). GitHub Actions independently confirms Secret Scan and
  Warehouse Validation green on both push and pull_request triggers for
  the final head.
- The one prior CI failure (Secret Scan, commit `30c71342f626ea613a361b5b80ddf1eda986ea97`,
  both push and pull_request runs) was a self-inflicted false positive: a
  test fixture in `app/api/research/copilot/route.test.ts` used a literal
  `sk-ant-...`-shaped fake string. It was never a real credential, was
  fixed in the very next commit (`c274438`), and no real secret ever
  entered git history at any point.
- Diff `origin/main...HEAD`: 26 commits, 66 files changed, 3,967
  insertions, 323 deletions. No `.env` files, credentials, cookies, local
  databases, browser profiles, or unexplained binaries found in the diff
  or in git history for `.env.uat.local` specifically.
- 2 migrations beyond Production's baseline of 044: `045` (additive
  columns/constraints/indexes on the existing `user_onboarding_preferences`
  and `user_feedback` tables — 19 added columns, 14 new constraints, 2 new
  indexes, no new tables) and `046` (grant-only — 19 revokes / 18 grants on
  pre-existing views/functions created in migrations 014/016/023, already
  in Production; no schema objects added or removed). Both idempotent,
  additive, RLS-preserving. Clean replay (001→046) and the 045 rollback
  rehearsal (33 assertions) re-confirmed on the final head via manual
  workflow dispatch. Upgrade-replay specifically (044-snapshot + only
  045/046) was not separately executed — flagged as an open gap, not
  silently assumed equivalent, though both migrations' idempotent/additive
  design makes divergence from the clean replay unlikely.
- Copilot: Production remains fully disabled — no `RESEARCH_COPILOT_ENABLED`,
  `INTERNAL_OPERATIONS_ENABLED`, `ADMIN_EMAILS`, `SUPABASE_SERVICE_ROLE_KEY`,
  or `PUBLIC_API_V1_ENABLED` exists in Vercel Production env (confirmed via
  `vercel env ls production`; only pre-existing `ANTHROPIC_API_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SUPABASE_URL` are present, none of which activate Copilot,
  Admin, or API v1 on their own). The `research_preview: "free"` entitlement
  question from Gap 6 remains an open product decision, not resolved here.
- `.env.uat.local`: gitignored (`.gitignore:54`), never tracked, never
  appears anywhere in git history, absent from `.next/` build output,
  mentioned only by filename (never by value) in this report. Recommended
  disposition: safe to delete now that this reconciliation is complete, but
  not deleted without Abdul's explicit approval. Safe deletion command:
  `Remove-Item -Path .env.uat.local -Force` (run from the repo root; has no
  effect on git history since the file was never tracked).

## Final classifications (2026-07-31 reconciliation)

| Area | Classification |
| --- | --- |
| Authentication/session persistence | GO |
| Authenticated Preview UAT | GO |
| Onboarding/settings | GO |
| Feedback | GO |
| Research | GO |
| API v1 | GO |
| Copilot Preview | GO |
| Copilot Production | NO-GO (must remain disabled; entitlement-tier decision outstanding) |
| Operations Preview | GO |
| Admin Production | NO-GO (must remain disabled) |
| Dependency security | GO |
| Secret scanning | GO |
| Migration readiness | CONDITIONAL GO (clean replay + 045 rollback rehearsal both pass on final head; upgrade-replay from a 044 snapshot specifically not separately executed) |
| PR readiness | GO (draft, mergeable, CI green on exact final head) |
| Production database readiness | NOT COMPLETED (no Production migration has been applied or rehearsed against a real Production-equivalent database this session; only disposable/warehouse-validation environments) |
| Production deployment readiness | NOT COMPLETED — awaiting Abdul's explicit approval below |

## Production remains untouched

PR #24 is draft and unmerged. No Production database, deployment,
environment variable, or Auth change has occurred. Two staged approval
options follow; **no previous approval sentence from this document is
valid — both reference the stale `22bf128` SHA and must not be reused.**

### OPTION A — lowest-risk staged release

> I approve merging PR #24 at commit
> `621d8bc5e760bd695b69bd839d4af8fba47cf00b` and deploying
> `feature/sprint17-major-product-expansion` to Production. I understand
> merging this PR triggers a Production deployment. This approval covers
> applying Production migrations `045_sprint17_preferences_feedback_controls.sql`
> and `046_research_api_grant_hardening.sql` only, and enabling only:
> authentication/session handling, onboarding, settings, and feedback.
> Research Hub, API v1, Property Copilot, and the operations/admin console
> must remain disabled in Production (no `PUBLIC_API_V1_ENABLED`,
> `WAREHOUSE_PREVIEW_ENABLED`, `RESEARCH_COPILOT_ENABLED`,
> `INTERNAL_OPERATIONS_ENABLED`, or `ADMIN_EMAILS` may be set). If any
> required post-deployment check fails, stop immediately, do not proceed
> further, and report back before taking any corrective action. Rollback
> target if needed: Production deployment `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x`
> (commit `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`). A full authenticated
> post-deployment UAT pass against Production is required before this
> release is considered complete.

### OPTION B — broader approved release

> I approve merging PR #24 at commit
> `621d8bc5e760bd695b69bd839d4af8fba47cf00b` and deploying
> `feature/sprint17-major-product-expansion` to Production. I understand
> merging this PR triggers a Production deployment. This approval covers
> applying Production migrations `045_sprint17_preferences_feedback_controls.sql`
> and `046_research_api_grant_hardening.sql` only, and enabling:
> authentication/session handling, onboarding, settings, feedback, the
> research warehouse layer, the Research Hub, and API v1
> (`PUBLIC_API_V1_ENABLED` and `WAREHOUSE_PREVIEW_ENABLED` may be set in
> Production). Property Copilot and the operations/admin console must
> remain disabled in Production (no `RESEARCH_COPILOT_ENABLED`,
> `INTERNAL_OPERATIONS_ENABLED`, or `ADMIN_EMAILS` may be set). If any
> required post-deployment check fails, stop immediately, do not proceed
> further, and report back before taking any corrective action. Rollback
> target if needed: Production deployment `dpl_7ZE6XAiaDBUc6NfzkWFrMwBuSf5x`
> (commit `71d93c54a2dad8d2952ab6d7355efa3b5a6f16a0`). A full authenticated
> post-deployment UAT pass against Production, including Research Hub and
> API v1 smoke checks, is required before this release is considered
> complete.

### Recommendation: Option A

Option A is the recommended choice. Both migrations are identical in
either option, so migration risk is the same — the difference is purely
how much *application surface* goes live at once. Research Hub and API v1
are independently verified GO, but they are also new public-facing surface
area with their own operational profile (external callers for API v1,
warehouse read load for Research Hub) that has not yet been observed under
real Production traffic. Option A lets authentication, onboarding,
settings, and feedback — the highest-priority, most foundational pieces —
ship and prove out in Production first, with Research Hub and API v1
following as their own controlled, independently-approvable step once
Option A is stable. This matches the sprint's own stated principle: "Do
not combine all five stages into one uncontrolled Production release."
