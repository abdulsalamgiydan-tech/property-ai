# V6C — SA Find My Investment: Production beta release package

Validation project **lzonauinzatmtytyoems** (Production `oshquaxsloolqucwvigc` strictly
untouched). Candidate branch `feature/v6a-find-my-investment`, draft PR #36. No Production
writes, no merge/deploy/Vercel/env/domain/vendor changes, no ledger repair, no national claims.

## Final candidate
Head **`12c5f36`** (advanced from the stated `09a31e3` by one necessary CI-stabilisation
commit). Commits from `main@8069b9f`:
`12c5f36` vitest 30s timeout (PGlite CI flake) · `09a31e3` V6B evidence + propose 060 ·
`775c695` calc evidence · `1fb1297` API+UI · `2dae7ae` 059 tests · `633739e` engine+tests ·
`af36a1c` migration 059 · `d231ea2` data contract · `307d160` ADR+spec.
PR #36: **draft, MERGEABLE, CI green** (Coverage/Build/Secret all pass after the timeout fix).

## Preflight (before 060)
059 physically present on validation; 060 committed (`sha256 d4900a00…`) but physically
absent from validation & Production. Ledger recorded separately (ends at `047`; 048–060 are
raw-DDL, untracked). Before-060: authenticated & anon = **SELECT only** on both user tables;
RLS on, 8 policies; RPC secdef/owner postgres/`search_path=public,core,mart`/ACL (anon/auth/
service, no PUBLIC); **core 768, fingerprint `ad14aaa4e52ef0abd6faaff65a3f9767`**; RPC 162 SA
rows; advisor baseline 91.

## 060 applied (raw-SQL transaction) — privilege-only change
Applied `begin … commit`. After:
- authenticated: SELECT+INSERT+UPDATE+DELETE on both tables ✔; anon: **read-only** (no write);
  PUBLIC/non-granted role: **no access**; core/mart/meta USAGE still **denied**; internal view
  still denied.
- RLS still on; **8 policies unchanged**; **no owned sequences** (uuid PK → no sequence grants).
- RPC owner/secdef/search_path/ACL **unchanged**.
- Warehouse **byte-identical**: core 768, fingerprint `ad14aaa4…`.
- **Ranking unchanged**: 71 ranked / 91 excluded, checksum
  **`f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989`**; Grange (SAL_40530)
  eligible, −6.11 preserved → growth index 0; Belair (SAL_40089) excluded (missing rent/yield).
- Advisors after 060: **91, zero delta** — 060 introduced no security finding.

## Two-user CRUD / RLS matrix (authenticated Data-API path)
| Case | Result |
|---|---|
| A create profile | ✔ |
| A read after fresh request | ✔ (RLS shows only A) |
| A update all fields (genuine change, not 0-row) | ✔ name `A original`→`A updated`, maxPrice 900k→1.8M |
| A save 3 real SA shortlist entries | ✔ |
| A reopen shortlist (new authenticated context) | ✔ (3 visible) |
| A remove one entry | ✔ (2 remain) |
| A delete profile → orphan behaviour | ✔ profile gone; shortlist rows retained, `profile_id` set null |
| Duplicate shortlist (product upsert) | ✔ idempotent (count stays 1) |
| A insert row owned by B | ✖ denied (RLS `WITH CHECK`) |
| A reassign own row ownership to B (UPDATE) | ✖ denied (USING doubles as WITH CHECK) |
| B read A's profile / shortlist | ✖ 0 rows (even with A's exact ID) |
| B update A by ID | ✖ 0 rows (no silent success, no ID-probe bypass) |
| B delete A's shortlist by ID | ✖ 0 rows |
| anon write | ✖ permission denied (no INSERT grant) |
| unauthenticated (null `auth.uid()`) write | ✖ RLS `WITH CHECK` rejects |
| A's data after B's attack | intact (name still `A updated`) |
| Cleanup | no residue (profiles 0, shortlist 0, users 0); warehouse untouched (core 768, `ad14aaa4`) |

## Browser UAT vs validation (`WAREHOUSE_PREVIEW_ENABLED` in process env only)
Requests targeted validation (candidates exist only there; NEXT_PUBLIC_SUPABASE_URL=validation).
Screenshots in `docs/decisions/v6c_screenshots/`:
- `v6c_1_questionnaire.png` — onboarding questionnaire.
- `v6c_2_results.png` — **71 ranked cards** with opportunity/confidence/fit pills, reasons,
  actions ("91 suburbs set aside"; top = Suburb 40026).
- `v6c_3_drawer.png` — evidence/calculation **drawer** (score breakdown + Evidence & provenance
  incl. "Source: sa_metro…" + labelled scenario/assumptions).
- Keyboard: Escape closes the dialog (confirmed). Desktop layout confirmed; mobile layout
  partially captured (browser-daemon instability).
- **Flag OFF:** `/find-investment` → **404**, `/api/investment/candidates` → **404**.
- Regression (flag on): `/`, `/research`, `/research/map`, `/research/explore`,
  `/compare-properties`, `/analyse-property` all **200**.

**Exact blocker — signed-in browser write journey:** a real authenticated browser session
against validation requires the app's magic-link email flow or the project's JWT signing secret
to mint a session cookie; neither is available in a local headless UAT. The persisted-write path
is instead **fully validated at the authenticated Data-API/RLS level** (the two-user matrix above
exercises the exact role + `auth.uid()` mechanism the UI's save/shortlist endpoints use).
Recommend running the signed-in browser journey on a **preview/staging deploy** where a test user
can complete the real login.

## Vercel release topology (read-only; both projects 403 → not fully inspectable)
- **app.propellect.com.au is served by Project B** (`zeebusiness93-2304s-projects`,
  `team_C9DDb5QQbFOdDkAMH76e8z3c`, `prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`; served
  `dpl_5H5ehktVNQWaDmoAgyVAKqrduSEb`, region syd1). Local `.vercel` binds Project B.
- **Project A** (`abdulsalamgiydan-9539s-projects`, `team_taWz31infhB7UWgHWnFXNn4V`) is the
  user-owned account; it deploys `main` but does **not** serve the customer domain (and has SSO
  deployment protection, per V5C).
- **Both** projects have the Vercel GitHub integration on `abdulsalamgiydan-tech/property-ai`,
  production branch `main` → every `main` commit double-deploys.
- **Recommended serving project for V6:** the project that serves the customer domain = **Project
  B**. The `WAREHOUSE_PREVIEW_ENABLED=true` flag and deployment must land on **Project B**.
- **Consolidation** (moving the domain to the user-owned Project A) is **not required before V6D**
  and can safely occur **after** — V6D lands on the domain-serving Project B, exactly as V5B did.
- **AUTH-BLOCKED** (both 403): env-var names/scopes, root/build/runtime config, alias ownership,
  which project holds the complete Production config. **Required access:** re-authenticate the
  Vercel connector as an account that is a member of **both** teams (Project A
  `team_taWz31infhB7UWgHWnFXNn4V` and Project B `team_C9DDb5QQbFOdDkAMH76e8z3c`); the current
  token has neither.

## Exact Production promotion package (for V6D — separate authorisation)
1. **DB (Production `oshquaxsloolqucwvigc`):** apply **059** then **060**, in order, via the
   standard controlled path + advisors + verification. Expected: core unchanged, RPC least-priv,
   user tables RLS + authenticated DML, no new advisor class beyond the RPC's +1/+1 exec lints.
2. **Feature flag:** set `WAREHOUSE_PREVIEW_ENABLED=true` on **Project B** (the domain-serving
   Vercel project). (Note: this also unhides the existing Research Hub if it were off — it is
   already live in Production, so no change there.)
3. **Merge + deploy:** mark PR #36 ready and merge to `main`; both projects auto-deploy the merge
   commit. Confirm Project B's Production deployment serves `app.propellect.com.au` on the new
   commit, TLS intact.
4. **Live UAT (cache-bypassed):** questionnaire → 71/91 SA results, drawer/provenance, signed-in
   save/shortlist/compare journey with a real test login, flag-off parity, and Research/Explore/
   Map/Compare/Analyse regression.

## Rollback plan
- **DB:** 060 is grants-only — revoke to roll back (`revoke insert,update,delete … from
  authenticated`); 059 objects can be dropped (drop RPC, view, registry, user tables) with no
  warehouse impact (warehouse tables untouched). Both are additive and isolated.
- **Feature:** set `WAREHOUSE_PREVIEW_ENABLED=false` on Project B → `/find-investment` + API 404
  instantly, zero customer impact, no deploy needed.
- **Deploy:** Project B keeps prior deployments; re-promote the previous Production deployment if
  needed. Keep the pre-V6 deployment as the warm fallback.

## Every remote system changed (this task)
Only the **validation branch lzonauinzatmtytyoems**: 060 grants applied; transient two-user test
records created and fully removed. Plus GitHub: three CI-relevant pushes to the feature branch
(timeout fix + evidence). Production, main, Vercel, env, domain, vendors — untouched.

## Remaining blockers
1. **Signed-in browser write journey** — run on a preview/staging deploy with a real login
   (the data/RLS path is already validated).
2. **Production promotion (V6D)** — separate authorisation for 059→060 on Production + flag on
   Project B.
3. **Vercel full inspection / consolidation** — needs dual-team Vercel access; consolidation is a
   post-V6D follow-up, not a V6D blocker.
4. **National** — remains blocked (coverage gate); licensed feeds inert; not Australia-wide.
