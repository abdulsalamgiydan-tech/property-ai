# V6C.1 — persisted customer journey: browser UAT evidence

Candidate SHA: **`3f0422c9364c796b06692d719e0f98ce7c76200d`** · Branch `feature/v6a-find-my-investment` · PR #36 (draft, mergeable, CI green). Validation `lzonauinzatmtytyoems`; Production `oshquaxsloolqucwvigc` **untouched** (physically lacks 059–061). No Australia-wide claim.

## Final Preview + canonical UAT host
- **Stable branch Preview** (canonical callback origin): `https://property-ai-git-feature-v6a-582a50-zeebusiness93-2304s-projects.vercel.app`, serving SHA **`3f0422c`** (verified via `/api/diagnostics/preview-config`).
- Deployment-specific Preview (`property-m4npvz1wa-…`) is a **different origin**; auth cookies are host-scoped, so the entire auth + UAT must use the **stable branch host** (using the deployment-specific host after a callback on the branch host produces spurious 401s — this was the prior failure mode).
- **Validation-only proof** (diagnostics, redacted): app + warehouse Supabase both → `lzon…oems`; `productionRefDetected:false`; `serviceRoleConfigured:false`; `warehousePreview:true`; `configurationOk:true`. No Production reference, no service-role.
- Vercel Deployment Protection is ON; passed legitimately by the operator's Vercel SSO login in the headed browser (no share-token injection).

## Browser + human-handoff method
Headed, visible Playwright Chromium (Chrome for Testing) with a temporary UAT profile, driven via a local control channel; surfaced to the foreground for the operator. Confirmed controllable on the canonical host with the questionnaire rendered and the sign-in dialog operable.

## UAT matrix (honest)
| Area | Result | Evidence |
|---|---|---|
| Signed-out `/find-investment` renders on canonical host | **PASS** | `takeover_02_questionnaire_signed_out.png`, `01_questionnaire_signed_out.png` |
| 71 ranked / 91 set aside (signed-out) | **PASS** (prior + engine/API) | `02_ranked_results_signed_out.png` |
| Signed-out save/shortlist opens auth; no false "saved" | **PASS** | `03_signed_out_save_login.png` |
| Validation-only diagnostics; no Production ref; no service-role | **PASS** | `/api/diagnostics/preview-config` (redacted) |
| Profile API signed-out → 401 | **PASS** | live check |
| **Real signed-in browser E2E** (magic-link login → save/shortlist/rehydrate/compare/delete in the browser) | **NOT COMPLETED — bounded gap** | see below |

### Real signed-in browser E2E — bounded gap (precise)
- Prior automated attempt (Codex, `v6c1-browser-uat-evidence.json`): **status `FAIL`** — "/api/investment/profile did not return 200 … last status 401" (cross-origin cookie). Its `04–06_*signed_in*.png` were captured while **unauthenticated (401)** and are **failed-attempt evidence, not passing** — do not treat as signed-in.
- This takeover: reached the correct canonical host with the sign-in dialog ready, submitted the form **once**, but the app returned **"email rate limit exceeded"** — the validation project's built-in Supabase Auth email sender was exhausted by the earlier session. **No magic link was sent.** (`takeover_04_magiclink_sent.png` = failed attempt.)
- The interactive login was then **skipped by operator direction**.
- **Net:** the real signed-in browser click-through was never completed. This is a **browser-level integration gap** caused by an infrastructure email rate-limit, not an application defect.

## Why the persisted-write path is still validated (three independent layers)
The end-to-end login is the *only* unproven link. The persisted-write correctness is proven without it:
1. **DB / RLS (real validation Postgres, authenticated Data-API path):** two-user CRUD matrix — create/read/update-genuine/shortlist/reopen/remove/delete+orphan; A→B insert & ownership-reassign denied; B read/update/delete of A denied even with A's exact ID; anon & unauth writes denied; duplicate idempotent; **061 same-user composite FK** proven (B→A profile link rejected); orphan `profile_id`→null; no residue; warehouse untouched.
2. **API routes (`route.test.ts`):** profile POST returns id; PATCH/DELETE and shortlist DELETE **fail closed (404 on zero rows, never `{ok:true}`)**; foreign `profile_id` → 403 no leak; auth required.
3. **UI persistence layer (`useInvestmentPersistence.test.tsx`, jsdom):** the component's hook **calls the real APIs** (profile+shortlist GET on mount = rehydration; add→POST; remove→DELETE; save→POST returns id) and updates state — i.e., the UI is genuinely server-backed and **survives reload**, not local-only.

## Business results (unchanged at final candidate; Codex commits are app-auth-only)
Core **768** (validation & Production); ranked **71** / set aside **91**; checksum **`f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989`**; Grange (`SAL_40530`) eligible, −6.11% growth, growth index 0; Belair (`SAL_40089`) set aside (missing median rent + gross yield). Validation advisors **91, zero migration-061 delta**.

## Gates (final candidate `3f0422c`)
Full suite **826 pass**; ESLint pass (1 non-blocking `_callback` unused-var warning in Codex's AuthProvider — left untouched per preserve rule); `tsc` 39 (baseline, **0 new**); `next build` OK; secret scan clean; warehouse/RLS pass; PR #36 CI green.

## Cross-user (browser) — bounded gap
The database/API/RLS two-user matrix passed (above). A second-user *browser* isolation pass was not run (no second real login; and the first login itself is the bounded gap). Not invented.

## Systems changed (this task)
Local: docs + this evidence; a throwaway browser controller (`tmp-v6c1-takeover-controller.mjs`, not committed). Remote: **none** beyond the pre-existing validation state (059/060/061 already applied earlier; the two-user test records were already cleaned up). Production, main, `app.propellect.com.au`, Project A: **untouched**.

## Remaining limitation
The real signed-in browser E2E must be completed on a Preview/live deploy where the operator can complete a magic-link login (validation email rate-limit reset, or custom SMTP / raised limit). It is a scheduled step of the **V6D live signed-in UAT**, which closes this gap before any Production exposure.
