# V6D — SA Find My Investment Beta: Production launch runbook

Status: **PREPARED, NOT AUTHORISED TO EXECUTE.** Requires a separate explicit Production authorisation (prompt at the end). Candidate `feature/v6a-find-my-investment` @ `3f0422c`, PR #36 (draft). Production `oshquaxsloolqucwvigc`; serving Vercel **Project B** (`prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`, team `team_C9DDb5QQbFOdDkAMH76e8z3c`, `zeebusiness93-2304s-projects`), domain `app.propellect.com.au`. **SA only — no Australia-wide claim.**

## Preconditions to reconfirm at execution time
1. **Separate explicit Production authorisation** received.
2. Candidate **SHA `3f0422c`** = local = origin = PR #36 head; PR draft→ready only after DB gate; **CI green**.
3. **Project B** reachable (Vercel connector re-authed to `team_C9DDb5QQbFOdDkAMH76e8z3c`); identify the current **warm pre-V6 Production deployment** (the deployment currently serving `app.propellect.com.au`) and record its deployment ID as the rollback target.
4. Confirm the **real signed-in browser E2E** (the V6C.1 bounded gap) will be closed by step 11 live UAT.

## Database gate (Production `oshquaxsloolqucwvigc`) — via the controlled path
5. Apply committed migrations **in order: 059 → 060 → 061** (exact committed contents; do not edit; do not skip; do not add a 062). Use the standard controlled apply path + transaction boundaries; on any failure prove rollback and stop.
6. **Verify physical objects independently of the migration ledger** (`to_regclass`/`to_regprocedure`): `meta.metric_provider` (4 rows, official active/precedence 100; Domain/PropTrack/Cotality inert), `mart.suburb_scoring_input_v1`, `public.get_investment_candidates_v1`, `public.investment_profiles`, `public.investment_shortlist_items`.
7. **Verify security posture:** RPC owner `postgres`, SECURITY DEFINER, `search_path=public,core,mart`, ACL anon/authenticated/service execute (**no PUBLIC**); user tables RLS on; policies scoped to `authenticated` with USING + explicit WITH CHECK; **anon/PUBLIC have no user-table privileges** (061); composite same-user FK `(profile_id,user_id)→investment_profiles(id,user_id) ON DELETE SET NULL (profile_id)`; grants = authenticated DML only.
8. **Verify data + ranking gates:** `core.official_observation` = **768**; via the RPC + engine, ranked **71** / set aside **91**, checksum **`f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989`**; Grange eligible (−6.11%, growth index 0); Belair set aside (missing rent/yield). Run **security advisors** and confirm only the intended `get_investment_candidates_v1` anon+authenticated executable lints (no new class, no PUBLIC/anon table access, no unexplained security-definer warning). **Stop on any drift.**

## Flag → deploy (only after the DB gate passes)
9. **Set `WAREHOUSE_PREVIEW_ENABLED=true` in Project B's Production environment scope** — **before** creating the new build. (This env change does **not** affect any already-built deployment; it only applies to builds created afterward.)
10. **Mark PR #36 ready and merge to `main`** (only after steps 5–8 pass). Record the merge commit + CI run IDs. Both Vercel projects auto-build `main`; the relevant one is **Project B**.
11. Ensure Project B creates a **Production deployment from the approved merge commit** with the flag set (if the auto-build predates the flag, trigger a fresh Production deployment so it is built with `WAREHOUSE_PREVIEW_ENABLED=true`). Verify **`app.propellect.com.au` serves that exact commit** (served `dpl` + `x-vercel-id`), TLS intact.
12. **Cache-bypassed live signed-in UAT** on `app.propellect.com.au`: real magic-link login → questionnaire → **71/91** SA results → Grange/Belair correct → evidence drawer provenance → **save profile** (saved only on server 200) → shortlist ≥3 SA results → **hard-refresh rehydrate** → sign out/in rehydrate → update+refresh persist → compare from persisted shortlist → remove one + refresh → delete profile + orphan (`profile_id` null) → cleanup, no residue. Confirm no synthetic values, no national results, no "Australia-wide" wording; regress Research/Explore/Map/Compare/Analyse/auth.
13. **Monitor 24h:** authentication success, API error rates (`/api/investment/*`), persistence correctness (no zero-row false success), and advisor state. Keep the previous Production deployment **warm**.

## Rollback (corrected)
- **Immediate:** re-promote the **warm pre-V6 Production deployment** (from step 3) — this is what actually reverts the live site instantly, because **changing an environment variable does NOT alter an already-built deployment.**
- Then set **`WAREHOUSE_PREVIEW_ENABLED=false`** so **future** Project B builds ship V6 disabled.
- To keep the new code deployed but V6 disabled, **create a new deployment with the flag false** (the flag only takes effect in a build created after the change).
- **Do not** automatically drop Production tables or delete customer data. 059–061 are additive and isolated; if a DB revert is ever required it is a separate, reviewed, explicitly-authorised step (revoke 060/061 grants; drop 059 objects) — the warehouse/ranking tables are untouched by these migrations.

## Ready-to-paste V6D Production-authorisation prompt (do not execute here)
> Approved: execute V6D — SA Find My Investment Beta Production launch, candidate `feature/v6a-find-my-investment`@`3f0422c`, PR #36.
> Production project `oshquaxsloolqucwvigc`; serving Vercel Project B (`prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`, `team_C9DDb5QQbFOdDkAMH76e8z3c`).
> This authorises: applying committed migrations 059→060→061 to Production via the controlled path; verifying physical objects/grants/RLS/policies/constraints/RPC/advisors independently of the ledger; verifying core=768, ranked/set-aside=71/91 and checksum `f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989` with Grange/Belair unchanged; setting `WAREHOUSE_PREVIEW_ENABLED=true` in Project B Production scope before the new build; marking PR #36 ready and merging to main only after the DB gate passes; creating a Project B Production deployment from the merge commit; verifying `app.propellect.com.au` serves that commit; completing cache-bypassed live signed-in UAT; and 24h monitoring, keeping the previous deployment warm.
> It does NOT authorise: Project A changes, domain/DNS/alias changes, vendor contact, purchases, national/Australia-wide claims, dropping Production tables or deleting customer data, or editing migrations 059–061. Fail closed and stop on any drift. Rollback = re-promote the warm pre-V6 deployment (env-var change alone does not revert a built deployment).
