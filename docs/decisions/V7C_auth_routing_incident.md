# V7C P0 incident — magic link escaped to Production host (session_exchange_failed)

**Status:** ROOT CAUSE PROVEN. No fix applied yet (awaiting approval before any dashboard/env/push change).
**Date:** 2026-08-14. **Branch:** `v7c-preview-launch-gate`. **Deployed Preview commit:** `d9c6fe1`.
**Secrets:** no magic-link token or full email captured anywhere in this file (redacted by design).

## Observed failure
During the one-time headed magic-link bootstrap, the emailed link landed on the **Production**
hostname instead of the isolated Preview:

- **Actual:** `app.propellect.com.au/auth/error?error_code=session_exchange_failed`
- **Expected:** `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app/auth/callback`

The Playwright run was stopped cleanly before Resume; no session was saved (`uat/v7c/.auth/` empty).

## Evidence gathered (redacted)
1. **Deployed Preview diagnostic** (`GET /api/diagnostics/preview-config`, via Automation Bypass header):
   HTTP **200**, `target=preview`, `gitBranch=v7c-preview-launch-gate`, `commitSha=d9c6fe1…`,
   app & warehouse refs `mmqx…iqtx`, `productionRefDetected=false`, `serviceRoleConfigured=false`,
   `configurationOk=true`. Because the route returns **404** when `NEXT_PUBLIC_SITE_URL` is a
   production host (route.ts:51-59), a **200 proves the Preview's `NEXT_PUBLIC_SITE_URL` is NOT a
   production host** → the app built a **Preview** `emailRedirectTo`, not a Production one.
2. **Production Supabase (`oshquaxsloolqucwvigc`) — UNCHANGED:** `auth.users` total **4**
   (baseline), newest user created 2026-07-24, `users_created_6h=0`, `users_signin_6h=0`,
   `sessions_created_6h=0`. The single `refresh_tokens_6h=1` is a **rotation of a pre-existing
   session** (account `ab…`, session created 2026-08-09, user created 2026-04-19) — unrelated to
   this incident.
3. **Isolated branch Supabase (`mmqxwwjshnpcqngciqtx`) — 1 Auth user created (evidence, kept):**
   `ab…@gmail.com`, created 2026-08-14 12:18:23Z, **email_confirmed=true**, `last_sign_in_at=null`,
   1 identity, **0 sessions, 0 refresh tokens**. Confirmed but never signed in.

## Proven root cause (which layer)
**Isolated Supabase Auth URL configuration** — NOT application code, NOT the Vercel branch env.

Mechanism, end to end:
1. Preview browser calls `signInWithOtp` against the isolated project `mmqx`
   (`NEXT_PUBLIC_SUPABASE_URL` → mmqx). App builds
   `emailRedirectTo = https://property-ai-git-v7c-…vercel.app/auth/callback?next=/deal-hunter`
   (`lib/auth/magicLinkRedirectOrigin.ts` → uses the Preview origin because env is non-production).
   → creates an **unconfirmed** user in mmqx.
2. `mmqx` validates that `redirect_to` against its **inherited** redirect-URL allowlist. Supabase
   dev branches inherit the **parent (Production) Auth Site URL + redirect allowlist**, which contain
   `app.propellect.com.au` but **not** the V7C Preview hostname → `redirect_to` **rejected**.
3. `mmqx` falls back to its **inherited Site URL = `https://app.propellect.com.au`**. The `/auth/v1/verify`
   step at mmqx **confirms the user** and issues a code, then redirects the browser to
   `app.propellect.com.au/auth/callback?code=<code issued by mmqx>`.
4. Production app (`app.propellect.com.au`) uses **Production** Supabase (`oshq`) and has **no matching
   PKCE code-verifier cookie** (that cookie was set on the Preview domain) → `exchangeCodeForSession`
   fails → `session_exchange_failed` → `/auth/error`. **Protective:** no Production session minted.

- Application code: correct (sent the Preview callback). ✔ not the cause.
- Vercel branch env: correct (`NEXT_PUBLIC_SITE_URL` non-production; diagnostic 200). ✔ not the cause.
- Isolated Supabase Auth URL config: **cause** (inherited Production Site URL + allowlist, missing the
  Preview hostname). ✘

## Smallest branch-only correction (proposed — NOT yet applied)
Change **only** the isolated branch `mmqx` Auth URL configuration (Production Auth config untouched):
1. Set branch **Site URL** → `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`
2. Add to branch **Redirect URLs allowlist** →
   `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app/auth/callback`
   (optionally `/**` for that host).

No application-code change fixes this (the app already requests the correct Preview callback; the
failure is Supabase rejecting it and falling back to the inherited Site URL). After the branch Auth
config is corrected, regenerate a fresh magic link (the previous one is consumed/confirmed and must
not be reused).

## Fix application (2026-08-14) — Management API path BLOCKED, manual dashboard required
Abdul approved applying the branch-only Auth fix via the Supabase Management API. Pre-write checks:
- Target reconfirmed: branch `deal-hunter-preview`, `project_ref=mmqxwwjshnpcqngciqtx`,
  parent `oshquaxsloolqucwvigc`, `with_data=false`, API URL `https://mmqxwwjshnpcqngciqtx.supabase.co`.
- **No already-configured Management API access:** no `SUPABASE_ACCESS_TOKEN`/management env var,
  no Supabase CLI, no stored CLI token; the connected MCP toolset has no Auth-config write and Auth
  URL config is not writable via `execute_sql`.
- Per the explicit guardrail ("if a new credential is required, stop and give manual dashboard
  instructions"), **no write was performed and no new credential was introduced.**
- Redacted current-config snapshot: authoritative Site URL / allowlist are only readable in the
  dashboard (no API token to GET them). Observed/inferred current state = Site URL
  `https://app.propellect.com.au` (inherited from Production) and allowlist lacking the V7C Preview
  host — consistent with the fallback that caused this incident.

Fix must be applied manually in the Supabase dashboard, **branch-scoped to `deal-hunter-preview`**:
- Site URL → `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`
- Redirect allowlist → add exactly `…vercel.app/auth/callback` (no `/**` wildcard).

### APPLIED 2026-08-15 (operator mode, dashboard UI, mmqx ONLY)
Abdul escalated to operator mode. A temporary headed browser profile (deleted after) was used to
log in and operate the dashboard **URL Configuration form** for `deal-hunter-preview`
(`/dashboard/project/mmqxwwjshnpcqngciqtx/...`; ref asserted = mmqx, never oshq). The
token-reuse/API path was blocked by the credential classifier and abandoned; the change was made by
**operating the form** (Site URL field + "Save changes"; "Add URL" dialog).
- **Before** (read-only recon): Site URL = `https://app.propellect.com.au` (inherited from Production).
- **After** (DOM read-back post-reload → persisted): Site URL =
  `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`;
  redirect allowlist now contains exactly `…/auth/callback`; **no wildcard**; existing entries left
  intact (UI "Add URL" only appends).
- Evidence: `uat/v7c/.artifacts/dashboard-recon.json`, `branch-auth-after.json` (gitignored).
- Production Auth config (`oshq`) NOT touched. Temp profile deleted; no dashboard auth persisted.
- Functional confirmation **DONE**: a fresh magic link showed `redirect_to` = the exact Preview
  `/auth/callback`; sign-in landed and stayed on the Preview host; server-side a new mmqx session
  was created (`sb-mmqxwwjshnpcqngciqtx-auth-token`), zero Production requests.

## Browser UAT — results & findings
Full desktop (1440×900) + mobile (iPhone 13 / WebKit), single worker, against the isolated Preview.
- **First run (deployed d9c6fe1):** 17 passed / 1 failed — sole failure mobile-06 (compare-tray
  occlusion, below).
- **Final run (deployed 7400333, after the P1 fix): 18 / 18 PASSED** — desktop 9/9 + mobile 9/9,
  including mobile-06 three-property comparison at 390×844.
Isolation gate green on both projects; no request referenced the Production ref in any journey;
journey-05 writes verified server-side in mmqx (`deal_pipeline_items=1`, `rejected_with_reason=1`,
`deal_listing_feedback=1`). 16 curated screenshots in `docs/decisions/v7c_screenshots/` (incl. the
replacement `06-compare.mobile.png`). Production reconfirmed: `auth.users=4`, no V7 tables.

Findings (UX severity):
- **P1 (mobile) — FIXED + VERIFIED (commit 7400333, deploy verified).** The Deal Hunter *compare
  tray* (`fixed bottom-0 z-30`) was occluded by the mobile bottom tab-nav (`fixed bottom-0 z-40`),
  making the "Compare" action unreachable on mobile — the sole first-run failure (mobile 06). Fix:
  `components/deal-hunter/DealHunterClient.tsx` tray now `bottom-20 z-40 lg:bottom-0 lg:z-30`.
  After deploy, mobile-06 passes (18/18); desktop-06 already passed.
- **P2 — Preview-only console noise (no action).** Vercel injects `vercel.live/.../feedback.js` on
  preview deployments; the app CSP correctly blocks it (absent in production). Excluded from the
  console-error gate for `vercel.live` only.
- **Test-harness bugs fixed (not product defects):** magic-link submit label ("Get free early
  access"); Chromium/WebKit engines installed; `setup` de-listed as a journey dependency;
  heading-scoped Deal Brief sections; buy-box scoped `strategy` assertion; cross-tab comparison
  selection; centre-scroll `tap()` for mobile fixed chrome.

## Cleanup — COMPLETED (2026-08-15, after 18/18)
- Signed-out/revoked the isolated UAT session, then deleted the UAT Auth user
  (`a10803f5-…`, `ab…@gmail.com`) and all its data: `investment_profiles`, `deal_pipeline_items`,
  `deal_listing_feedback`, `waitlist`. Local `uat/v7c/.auth/state.json` removed.
- **Zero UAT residue** confirmed in mmqx: auth users/sessions/refresh-tokens = 0; profiles/pipeline/
  feedback/waitlist = 0.
- **Seed preserved:** `core.official_observation` = **20** SYNTHETIC-UAT market-evidence rows intact
  (+ `meta.metric_provider` = 4 reference rows). No market/metric table was touched.
- **Production reconfirmed unchanged:** `auth.users=4`, 0 recent sessions, no V7 tables, latest
  applied migration `20260808064655` (061-era baseline; no 062/063/064).
- `deal-hunter-preview` branch retained (deletion awaits Abdul's separate approval).
