# V7C — Safe Preview UAT (plan + status)

**Status: NOT YET EXECUTED — blocked.** The safe UAT can only run *after* the isolated Preview lab exists
(migration B, which is **paused at the cost gate** awaiting Abdul's approval), and it needs a working
browser. **The local headed browser / gstack `/browse` is unusable in this Windows environment** (documented
across V6C.1/V6D), so the journey + desktop/mobile screenshots cannot be captured in this session. This
document is the **ready-to-run UAT script** so it can be executed the moment the isolated Preview is wired.

**Hard rule:** run this only against the **isolated `deal-hunter-preview` branch** with **synthetic data**.
Do **not** use or touch any Production record. If isolation is not proven (see `V7C_preview_isolation.md`),
**do not run this UAT** against Project B's Preview.

## Pre-conditions (all must be true before starting)
1. `deal-hunter-preview` Supabase branch exists (data-less), migrations applied **001→063**.
2. Preview env is **branch-scoped**: isolated `NEXT_PUBLIC_SUPABASE_URL` + anon key, `WAREHOUSE_PREVIEW_ENABLED=true`, Auth redirect = exact Preview host. No privileged key in `NEXT_PUBLIC_*`.
3. A read-only diagnostic (or `list_migrations` on the branch) confirms the Preview points at the isolated branch **ref**, not `oshquaxsloolqucwvigc`.
4. Only synthetic data seeded; **no Production users copied**.

## Journey (each step verified against the isolated DB)
| # | Step | Expected UI | DB verification (isolated branch only) |
|---|---|---|---|
| 1 | Magic-link auth on the **isolated** Auth instance | Signed in as a synthetic test user | `auth.users` on the branch has the test user; Production auth untouched |
| 2 | Create buy box (save an investment profile) | "Your buy box" chips + "How was this built?" per-answer explanations | 1 row in `investment_profiles` (branch), `user_id = test user` |
| 3 | Ranked opportunity feed | Matches tab lists replay listings with deal scores + personalised "why it fits" | feed built from replay + branch official metrics; no writes |
| 4 | Hard-gate exclusion | An over-budget / wrong-type listing appears in **Excluded** with the reason, never in Matches | n/a (compute) — assert Seaton-unit / over-budget excluded |
| 5 | Deal detail + one-page Deal Brief | Evidence-class labels (listing fact / market evidence / estimate / your input / missing) + disclaimer | `deal_listing_feedback` insert `kind='brief_opened'` (branch) |
| 6 | Save → Reviewing | Card shows "reviewing" | `deal_pipeline_items` row `status='reviewing'` |
| 7 | Pass with **required** rejection reason | Reason chips; pass records reason | `deal_pipeline_items` `status='rejected'` + `rejection_reason` set; DB check enforced |
| 8 | Compare three properties | Side-by-side of ≤3 | `deal_listing_feedback` `kind='compared'` rows |
| 9 | Refresh rehydration | Buy box + pipeline persist after hard refresh | re-fetch returns same rows |
| 10 | Sign-out / sign-in persistence | State restored for the same user | rows unchanged across session |
| 11 | Cross-user isolation | A second synthetic user sees **none** of user 1's pipeline/feedback | RLS: `select` as user 2 returns 0 of user 1's rows |
| 12 | Cleanup | Synthetic pipeline/feedback removed where intended | `deal_pipeline_items` delete → 0 residue; feedback is append-only (retained by design, on the disposable branch) |

## Evidence to capture (when runnable)
- Desktop + mobile screenshots of steps 2–8 into `docs/decisions/v7c_screenshots/`.
- For each write step, the isolated-DB row (via `execute_sql` on the branch, read-only SELECT) proving the
  write landed on the branch and **nowhere else**.
- A final SELECT proving zero synthetic-user residue where intended.

## Why this is blocked right now
1. **Cost gate (B.4):** the isolated branch (US$0.01344/hr) is not created — awaiting Abdul's approval.
2. **Env wiring (B.7/B.10):** no MCP/CLI path to set Vercel Preview env vars here — Abdul's dashboard step.
3. **Browser:** unusable in this Windows env — screenshots/interactive journey can't be driven in-session.

Until (1)–(3) are resolved, the correct and safe action is to **not** run any authenticated mutable flow
against the existing (unsafe) Project B Preview. The engine behaviours in the table above are already proven
deterministically by the test suite (`lib/dealhunter/dealhunter.test.ts`, `supabase/migrations/063_*.test.ts`);
this UAT adds the live-Preview + real-Auth + real-DB confirmation once isolation exists.
