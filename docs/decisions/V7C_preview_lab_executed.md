# V7C-B — Isolated Preview lab: executed evidence

Records the approved execution of V7C-B (one data-less Supabase branch). **Production, its env vars, the live
domain, migrations 059–061 and the V6D deployment/monitoring were untouched; PRs #37/#39/#40 unmodified.**
Cost approved by Abdul: US$0.01344/hr; keep ≤ 7 days without renewed approval; ask before delete/extend.

## Branch
- Name **`deal-hunter-preview`** · id `1f97bc45-e607-4898-bce2-8c3174201369` · project ref **`mmqxwwjshnpcqngciqtx`**.
- `parent_project_ref = oshquaxsloolqucwvigc` · `with_data = false` · status `FUNCTIONS_DEPLOYED` / `ACTIVE_HEALTHY`.
- No Production auth users or customer rows copied: on the branch `auth.users=0`, `investment_profiles=0`,
  `investment_shortlist_items=0`. `warehouse-validation` (ref `lzonauinzatmtytyoems`) unchanged.

## Migration history (requirement-5 correction honoured)
- Branch reproduced the parent's applied state on creation: history ended at **`061`** (062/063 absent).
- Applied **only the missing** migrations, once each:
  `20260810083737 062_shortlist_change_events`, `20260810083806 063_deal_hunter_pipeline`.
- Post-apply: 4 new tables present (`investment_shortlist_change_events`, `investment_notification_prefs`,
  `deal_pipeline_items`, `deal_listing_feedback`) + `detect_shortlist_change_events_v1()`.

## Synthetic seed (labelled)
- **20** rows in `core.official_observation`, `source_id='SYNTHETIC-UAT'`, attribution "V7C synthetic UAT seed -
  not official data": 4 SA suburbs (`SAL_40530`, `SAL_40089`, `SAL_41010`, `SAL_41190`) × 5 mandatory metrics.
- The least-privilege RPC `get_investment_candidates_v1('SA','house')` returns these 4 suburbs with all 5
  metrics + provenance → branch data path works. **No Auth user created** (per instruction — deferred to the UAT).

## Security + isolation verification (on the live branch)
- **RLS enabled** on all four new tables. **SECURITY DEFINER** correct: both `detect_shortlist_change_events_v1`
  and `get_investment_candidates_v1` are `prosecdef=true` with pinned `search_path=public, core, mart`.
- **No direct event forgery:** as the real `authenticated` role, `INSERT` into `investment_shortlist_change_events`
  is **blocked by RLS — SQLSTATE 42501 "new row violates row-level security policy"** (no INSERT policy exists).
- **Feedback append-only:** as `authenticated`, `UPDATE`/`DELETE` on `deal_listing_feedback` affect **0 rows**
  (no update/delete policy → RLS default-deny).
- **Composite FK / same-user guarantees present:**
  `shortlist_change_events_on_shortlist_fkey FOREIGN KEY (user_id, geography_id) → investment_shortlist_items ON DELETE CASCADE`;
  `deal_pipeline_rejected_needs_reason CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`;
  plus the 059/061 `(id,user_id)` unique + same-user profile FK.
- **UPDATE policies carry USING + WITH CHECK** (verified in `pg_policies` for the update policies).
- **anon has no table access** to any of the four tables (grants false).
- **Advisors (security):** no NEW critical/high introduced by 062/063. The `ERROR`-level `security_definer_view`
  findings (~11 warehouse views) are **pre-existing baseline** (present on Production too). The only new findings
  are **WARN**: the detector is executable by `anon` (a no-op — `auth.uid()` null) and by `authenticated`
  (intended).

## Findings — NOW RESOLVED on this branch + commit
Both findings below were fixed in commit (fixture + migration 064 + diagnostic) and applied to the branch:
- **Fixture format:** `lib/listings/fixtures/sa_listings_replay.json` (+ dependent tests) now use `SAL_40530`
  etc. → they join the SA evidence via the RPC. (886 tests green.)
- **Grant hardening (migration 064):** applied to `mmqxwwjshnpcqngciqtx` (branch migration `20260810113851`).
  Post-apply grants verified: `authenticated` INSERT on change-events = **false**, UPDATE/DELETE on feedback =
  **false**, `anon` EXECUTE on detector = **false**; intended grants preserved. This clears the `anon`-executes-
  detector advisor WARN (`has_function_privilege('anon', detector, EXECUTE)` is now false). **064 is applied to
  the branch only — NOT to Production** (Production still ends at 061; must-apply before any Production 062/063).
- **Diagnostic:** `/api/diagnostics/preview-config` now recognises the dedicated `mmqxwwjshnpcqngciqtx` branch as
  an isolated Preview (`configurationOk=true`, masked ref `mmqx...iqtx`) — the mechanism used to prove the
  Preview's DB binding without exposing credentials.

## Original findings (for the record; both addressed above)
1. **Fixture geography_id format bug (functional):** the committed replay fixture uses `SAL40530` (no
   underscore) → the scoring view maps it to `UNKNOWN`, not `SA` (SA requires `substr(geo,5,1)='4'`, i.e.
   `SAL_40530`). Until the fixture uses `SAL_` codes (and dependent tests updated), the deployed UAT feed will
   show no joined market evidence (all "needs review"). Seed on the branch uses the **correct** `SAL_` format.
2. **Defense-in-depth grant looseness (security, non-exploitable):** Supabase default privileges leave
   `authenticated` with table `INSERT` on `investment_shortlist_change_events` and `UPDATE`/`DELETE` on
   `deal_listing_feedback`, and `anon` with `EXECUTE` on `detect_shortlist_change_events_v1`. **RLS blocks all of
   these in practice** (proven: 42501 on forge; 0 rows on feedback update/delete; no-op for anon). A hardening
   migration **064** should add explicit `revoke insert on investment_shortlist_change_events from authenticated`,
   `revoke update, delete on deal_listing_feedback from authenticated`, and `revoke execute on
   detect_shortlist_change_events_v1() from anon` — mirroring what `061` did for `059/060` — and be applied to
   the branch too. Not a UAT blocker; **required before any Production apply of 062/063.**

## Production-untouched proof (before + after)
Identical Production (`oshquaxsloolqucwvigc`) reads before and after all branch work:
`investment_profiles=0`, `investment_shortlist_items=0`, `auth_users=4`, applied migrations end at `061`,
`has_062_table=false`, `has_063_table=false`, and **`synthetic_rows_on_prod=0`** (the seed went only to the
branch). No Production write/migration; no env/flag/domain/deploy change.
