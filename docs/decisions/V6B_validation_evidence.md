# V6B — validation-branch rehearsal evidence

Validation project: **lzonauinzatmtytyoems** (Production `oshquaxsloolqucwvigc` strictly
out of scope, untouched). Candidate branch `feature/v6a-find-my-investment`, draft PR #36.
No Production writes, no merge/deploy/Vercel/vendor, no ledger repair, no national claims.

## 1. Preflight (all green)
- Candidate head **`775c695fbc1961e23cb8ef0474ed3fd826c3a171`**; local == remote == PR #36 head.
- Seven commits: `775c695` (calc evidence), `1fb1297` (API+UI), `2dae7ae` (059 tests),
  `633739e` (engine+tests), `af36a1c` (migration 059), `d231ea2` (data contract),
  `307d160` (ADR+spec).
- PR #36: **draft, MERGEABLE, CLEAN, CI green**.
- Running shells: three `node.exe` are **Cursor IDE helpers** (editor runtime), none a
  `next`/`vitest`/warehouse process; the only worktree touch was two warehouse-report
  `generated_at` timestamps from an earlier `npm test`, reverted → worktree clean, head stable.
- Full diff `main@8069b9f..775c695` = 19 files, **+2437/−0** (all V6A, additive).
- 059 present (`sha256 25108dd0…`), applied nowhere.
- Validation physical inspection: deps exist (core.official_observation, schemas mart/meta,
  auth.users); **all 059 objects absent**; ledger recorded (ends at
  `047_warehouse_internal_schema_rls`; 048–058 are physical raw-DDL, not tracked — so 059
  applied via raw-SQL, no synthetic ledger entry). SA data present: core **768**, 79 growth,
  162 SA-house geos, Grange −6.11.
- Advisor baseline: rls_enabled_no_policy 53, security_definer_view 12, anon exec 10,
  authenticated exec 10, rls_auto_enable 2, function_search_path_mutable 1,
  auth_leaked_password_protection 1 (**89 total**).

## 2. Migration 059 applied (raw-SQL, transactional) + verified
Applied inside `begin … commit`; committed cleanly. Verified: provider registry (4 rows —
official open_cc_by/precedence 100/active; Domain/PropTrack/Cotality licensed_restricted/
inactive), `mart.suburb_scoring_input_v1`, RPC `get_investment_candidates_v1`
(SECURITY DEFINER, owner **postgres**, `search_path=public,core,mart`, ACL anon/authenticated/
service_role execute, **no PUBLIC**), both user tables RLS-enabled with 4 policies each.
Warehouse untouched (core still **768**, Grange −6.11).

## 3. Real-data scoring proof (validation SA-house set, 162 rows)
Engine run over the exact RPC output. Profile: max A$1.8M / deposit A$500k / Growth /
holding A$800 / house / SA / asOf 2026-08-04.
- **Deterministic checksum `f1cbf0ee2bcb716ff64d0f7c8f67266437ce18950c53303b736d4cb87f6d6989`**,
  identical across input-order reversal (byte-identical ordering + components).
- **162 rows → 71 ranked, 91 excluded** (missing_mandatory 89, above_price_budget 1,
  exceeds_holding_budget 1). Top: SAL_40026 (90), SAL_40925 (89), SAL_40619 (89).
- **Grange SAL_40530: eligible; growth value −6.11 (direct) preserved → growth index exactly 0**
  (never flipped/dropped/treated as missing); opportunity 14, confidence 80.
- **Belair SAL_40089: excluded — "Missing required evidence: median_rent, gross_yield"**
  despite +20.55% growth.
- Weight change exactly decomposable on real data (all strategies); cash-flow scenario ==
  independent `analyzeProperty`; no non-SA / no missing-mandatory leak; every ranked figure
  carries source_id + period + retrieved_at + direct/derived status. VIC house has 0 price
  rows (not rankable); postcode/contextual/unsupported geographies never enter (jurisdiction
  derived SA-only; contextual/quarantine excluded upstream by 057-era filter).

## 4. Remote security validation (real roles)
- anon EXECUTE ✔, authenticated EXECUTE ✔, service_role EXECUTE ✔ (Supabase backend default),
  **PUBLIC-only role denied** (`v6b_norole` execute = false; ACL has no PUBLIC entry).
- anon has no USAGE on core/mart/meta; no SELECT on the internal view/`core.official_observation`;
  direct `select from mart.suburb_scoring_input_v1` denied.
- RPC `metrics` exposes only `{value,unit,status,licence,provider,source_id,period_start,
  period_end,attribution,sample_size,retrieved_at}` — **no internal ids, no postcode, no raw
  licensed fields**; RPC columns `geography_id,jurisdiction,property_type,metrics` only.
- **RLS isolation (two real validation users):** user A sees only A's profile+shortlist; user B
  only B's; **unauthenticated (anon) sees 0**; cross-user write **denied** (fail closed).
  Malformed/unauth requests fail closed (zod validation + 404 gate + RLS). Test records removed
  by cascade; **warehouse data untouched** (core 768, Grange −6.11).
- Advisors after 059 vs baseline: **only delta = +1 anon + +1 authenticated executable lint**,
  both for `get_investment_candidates_v1` (the intended least-privilege RPC, same class as 057).
  No new rls_enabled_no_policy (user tables have policies), no new security_definer_view (the
  mart view is internal), **no unexpected PUBLIC/anon access**. 91 total (89 + 2). Nothing blocks.

## 5. Local E2E UAT vs validation (`WAREHOUSE_PREVIEW_ENABLED` in process env only)
Ran `next dev` with `NEXT_PUBLIC_SUPABASE_URL=https://lzonauinzatmtytyoems.supabase.co`
(flag not written to any file/GitHub/Vercel; no secret values printed).
- **Flag ON:** `GET /find-investment` → **200**. `POST /api/investment/candidates` → **200**,
  215 KB, `opportunity_score_v1`, **71 ranked / 91 excluded** (identical to §3), offered `["SA"]`,
  `stateBlocked:false`; Grange opp 14 / growth index 0 / −6.11 direct; Belair excluded; all
  ranked SA; provenance present; reasons cite real figures + source ("Strong 12-month price
  growth of 18.69% (sa_metro_median_house_sales · 2026-06-30)"); scenario labelled with
  assumptions. This data exists **only on validation** (059 not on Production) ⇒ requests
  targeted lzonauinzatmtytyoems, never Production. Research/Explore/Map/Compare/Analyse all 200.
- **Flag OFF** (`WAREHOUSE_PREVIEW_ENABLED=false`): `/find-investment` → **404**,
  `/api/investment/candidates` → **404** — the feature adds nothing when off; the flag-off state
  is unchanged (the Research Hub shares the same pre-existing preview flag).

## 6. Assurance re-run (candidate suite)
**799 tests / 100 files, 0 failures** · ESLint clean · `tsc` 39 (baseline, **0 new**) ·
`next build` OK · secret scan clean · `warehouse:rls:check` pass.

## 7. Finding + proposed additive correction (migration 060)
During §4, `authenticated` had SELECT but **not INSERT/UPDATE/DELETE** on the new user tables,
so the save/shortlist writes fail closed and RLS `WITH CHECK` cannot be positively validated
remotely. Root cause: 059 relies — like every existing user-table migration (038/043/044) — on
Supabase **default privileges** for the `authenticated` DML grant; the tracked migration runner
applies them, but the **raw-SQL validation path did not**. Security posture is correct (writes
denied). Per protocol I did **not** edit applied 059; I propose additive
**`060_investment_tables_grants.sql`** (explicit `authenticated` DML grants, anon read-only) so
the tables are correct regardless of application path. 060 is committed to the candidate but
**not applied** (only 059 was authorised for this rehearsal).

## Remaining blockers
- **Write features (save/shortlist) + RLS-WITH-CHECK-remote:** apply **060** in a fresh,
  separately-authorised validation cycle, then re-run the write UAT.
- **Production release:** promote 059 (+060) to Production via the standard path + advisors + UAT.
- **National coverage:** remains blocked (VIC/NSW/others fail the coverage gate); no
  Australia-wide claim. Licensed feeds (Domain/PropTrack/Cotality) inert pending written terms.
- Interactive browser screenshots not captured (browser-tool instability); the §5 API-against-
  validation evidence stands in for the rendered result payload.

## Remote systems changed
Only the **validation branch lzonauinzatmtytyoems**: 059 objects created (registry/view/RPC/
user tables) via raw-SQL; transient RLS test records created and fully removed. Production,
main, Vercel, env, vendors — untouched.
