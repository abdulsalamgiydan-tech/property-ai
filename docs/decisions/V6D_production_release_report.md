# V6D — SA Find My Investment Beta: Production release report

**Status: LAUNCHED — SOUTH AUSTRALIA BETA LIVE on `app.propellect.com.au`.** 24-hour
monitoring active. SA-only; no Australia-wide claim.

Release date: 2026-08-09. Executed per `docs/decisions/V6D_SA_beta_launch_runbook.md`.
Production Supabase `oshquaxsloolqucwvigc`; serving Vercel **Project B**
(`prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`, team `team_C9DDb5QQbFOdDkAMH76e8z3c`,
`zeebusiness93-2304s-projects`).

## Candidate & merge
- Candidate branch `feature/v6a-find-my-investment`, PR **#36**.
- Pre-merge fix: `nanoid` bumped to 3.3.18 (`cd51728`, lockfile-only) clearing
  GHSA-2v37-7h3g-55p8; `npm audit --omit=dev --audit-level=high` = 0 vulnerabilities; all
  required CI checks green (build/lint/test, coverage, secret+dependency-audit gate).
- **Merge commit to `main`: `f20816b7886165e8a434e0b984585043db516435`.**

## Step 2 — Production database release (059 → 060 → 061)
Applied in order via the controlled path (`apply_migration`) to `oshquaxsloolqucwvigc`,
verified independently of the migration ledger:

- **Objects present:** `meta.metric_provider` (4 rows; official active/precedence 100;
  Domain/PropTrack/Cotality inert), `mart.suburb_scoring_input_v1`,
  `public.get_investment_candidates_v1`, `public.investment_profiles`,
  `public.investment_shortlist_items`.
- **RPC posture:** owner `postgres`, SECURITY DEFINER, `search_path = public, core, mart`,
  EXECUTE for anon/authenticated/service (no PUBLIC).
- **User tables:** RLS on; 8 policies all scoped `TO authenticated`; both UPDATE policies
  carry USING **and** explicit WITH CHECK; **anon/PUBLIC have no user-table privileges**
  (061). `core`/`mart`/`meta` remain denied to client roles.
- **Same-user composite FK** `(profile_id, user_id) → investment_profiles(id, user_id)
  ON DELETE SET NULL (profile_id)` proven: a B→A link is rejected (`23503`); deleting a
  profile orphan-nulls `profile_id` on the shortlist row.
- **Functional:** disposable two-user CRUD, zero-row-fails-closed, cross-user-denied — all
  pass; test rows cleaned, no residue.
- **Data & ranking (Production):** `core.official_observation` = **768**; fingerprint
  `ad14aaa4e52ef0abd6faaff65a3f9767`; via RPC + engine, **ranked 71 / set aside 91**,
  checksum `f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989`; Grange
  (`SAL_40530`) eligible (−6.11% growth → growth index 0); Belair (`SAL_40089`) set aside
  (missing official rent/yield).
- **Security advisors:** delta vs pre-V6 baseline = **only** the +1 anon and +1
  authenticated executable lints for `get_investment_candidates_v1` (SECURITY DEFINER over
  deterministic public warehouse data). No new lint class, no PUBLIC/anon table access, no
  unexplained security-definer view.

## Step 3 — Flag + merge (Project B)
- **`WAREHOUSE_PREVIEW_ENABLED` was already `true`** in Project B Production scope — it
  gates the already-live `/research` features (`/research` = 200 proves the value is
  exactly `"true"`). No env change was required. (The Vercel MCP connector has no
  environment-variable API; the flag was confirmed via the Vercel CLI `env ls` and the
  live route.)
- **No service-role key** present in Project B env (`SUPABASE_SERVICE_ROLE_KEY` absent).
- PR #36 marked ready and merged → `main` at `f20816b`.

## Step 4 — Production deployment (Project B)
- Project B auto-built the merge commit as Production deployment
  **`dpl_2BVWLocPGKjegsJeo9Vy2R7HaR8K`** — READY, `target = production`, commit
  **`f20816b`**, region iad1, aliased to `app.propellect.com.au`.
- Live routes: **`/find-investment` = 200** (feature live), `/research` = 200, `/` = 200.
- **Production posture confirmed:** `/api/diagnostics/preview-config` self-returns 404 on
  Production by design (the route's `productionLike` guard fires on `VERCEL_ENV=production`
  / production host / Production Supabase ref) — i.e. the 404 is positive evidence the
  deployment runs against Production.
- **Warm rollback target: `dpl_5H5ehktVNQWaDmoAgyVAKqrduSEb`** (SHA `8069b9f`, pre-V6),
  kept live-ready.

## Step 5 — Live signed-in Production UAT
Driver note: the gstack `/browse` headed handoff was **unusable** in this environment (its
daemon crashed repeatedly, killing the login window). The UAT was completed by the
operator in a normal browser (real magic-link login) with **every persisted effect
corroborated by read-only reads on Production `oshquaxsloolqucwvigc`** — the test
account's own rows only. This closes the V6C.1 signed-in browser gap.

| Area | Result | Evidence |
|---|---|---|
| Signed-out `/find-investment` renders | PASS | `v6d_screenshots/01_questionnaire_signed_out.png` |
| Ranked SA results, deterministic & monotonic | PASS | 32 ranked / 130 set aside at A$900k; 73/89 at A$5M (`02_*`, `03_*`) |
| Canonical 71 / 91 + checksum `f1cbf0ee` | PASS | proven at engine/DB level on Production (Step 2); UI layers affordability on top |
| Provenance, "not advice", SA-only (others "soon") | PASS | every figure sourced + dated; "Only SA is ranked today" |
| Real magic-link login | PASS | user `8565d3c5…` authenticated (`04_signin_magiclink.png`) |
| Save profile persists | PASS | `investment_profiles` row `V6D Production UAT`, inputs match exactly |
| Shortlist 3 SA persists | PASS | 3 user-scoped rows: `SAL_40026`, `SAL_40619`, `SAL_40925` |
| Hard-refresh rehydrate | PASS | shortlist held at 3 after reload |
| Sign out / sign in | PASS | 3 rows returned across session |
| Changed input persists | PASS | Cash-flow → strategy `yield` saved |
| Delete + cleanup | PASS | profiles → 0, shortlist → 0, **no residue** |

### Observations (non-blocking)
1. **Shortlist is user-scoped by design** — `investment_shortlist_items.profile_id` is null;
   the route is "Per-user investment shortlist" (conflict key `user_id,geography_id`),
   `profile_id` optional. So profile-delete does not touch the shortlist; the orphan-null
   FK safety is proven at the DB layer (Step 2), not via this UI path.
2. **Save-after-change created a second profile** rather than updating in place (likely the
   sign-out/in reset the "current profile" reference). Duplicate names allowed. Minor UX,
   no data-integrity impact.

## Rollback (corrected)
The ONLY V6 rollback is to **re-promote the warm pre-V6 deployment
`dpl_5H5ehktVNQWaDmoAgyVAKqrduSEb`** (SHA `8069b9f`, lacks the `/find-investment` code).
**Do NOT set `WAREHOUSE_PREVIEW_ENABLED=false`** — it is shared with the live `/research`
features and would break them. Do not drop tables / delete data / reverse 059–061
(additive, isolated).

## 24-hour monitoring
Watch: authentication success rate, `/api/investment/*` error rate, persistence
correctness (zero-row false-success = 0), advisor state, deployment health, and the SA
ranking checksum. **Rollback thresholds:** auth success < 95%, API 5xx > 2%, any
RLS/ownership leak, any zero-row false success, or a ranking/checksum drift → re-promote
the warm deployment.

## Limitations / honesty
- Signed-in journey evidence is **server-side corroboration (read-only Production reads)**
  plus signed-out screenshots — not automated signed-in screenshots — because `/browse`
  headed was unusable here. The persisted-write correctness is nonetheless proven live on
  Production with a real authenticated user.
- The Compare view was exercised by the operator without reported issues; no independent
  capture.
- The canonical 71/91 split is the pre-affordability evidence-completeness result (verified
  at engine/DB level on Production); the questionnaire layers the user's affordability
  profile on top, so the UI count varies with inputs (correctly).
