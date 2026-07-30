# Sprint 17.5 Release Readiness Summary

Date: 2026-07-30
Branch: `feature/sprint17-major-product-expansion`
PR: [#24](https://github.com/abdulsalamgiydan-tech/property-ai/pull/24) (open, draft)
Final commit (CI-verified, all workflows green): `de115b4` (`de115b40...`)
App code last changed at (live Preview UAT target): `22bf12861469ead81cd55f0fb4169a0576eb9494` —
commits after this point (`de115b4`) only touch CI workflows, a new test
script, and docs, so the live UAT evidence below still applies to the
current app code without needing a fresh Preview deployment.
Preview deployment: `dpl_GkuzV4UW4ta2ENWGF3QpooVfKiE2`
Preview URL: `https://property-77uznynty-zeebusiness93-2304s-projects.vercel.app`
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

## Overall Sprint 17.5 classification: GO for the Preview release candidate

All four closeout gaps are GO, and the previously-recorded blocker in
`sprint17_preview_uat_checkpoint.md` ("Protected authenticated Preview UAT:
NOT COMPLETED") is resolved and superseded by the live 30/30 pass recorded
above.

**Production remains untouched and requires Abdul's explicit approval before
any of the following occurs:** merging PR #24, merging into `main`, applying
migrations to Production, changing Production environment variables, or
deploying to Production. Exact approval sentence for Abdul to send when
ready:

> I approve merging PR #24 and deploying the current
> `feature/sprint17-major-product-expansion` branch (commit
> `22bf12861469ead81cd55f0fb4169a0576eb9494`) to Production, including its
> Stage 1 migrations (authentication, onboarding, settings, feedback).
