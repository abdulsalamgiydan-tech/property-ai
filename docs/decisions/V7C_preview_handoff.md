# V7C — Vercel dashboard handoff (manual, for Abdul)

**PAUSED here for you.** The isolated Supabase branch exists, is migrated (062+063), seeded with labelled
synthetic SA evidence, and security-verified. The next actions must be done by you in the dashboards (there is
no MCP/CLI path to set Vercel env vars from here). **I did not redeploy, open the Preview, authenticate, or run
the UAT.**

## Isolated branch (already created + verified)
- Supabase branch: **`deal-hunter-preview`** · project ref **`mmqxwwjshnpcqngciqtx`** · parent `oshquaxsloolqucwvigc` · `with_data=false`.
- API URL (non-secret): **`https://mmqxwwjshnpcqngciqtx.supabase.co`**.
- **Anon/publishable key: copy it yourself** from Supabase dashboard → project `deal-hunter-preview`
  (`mmqxwwjshnpcqngciqtx`) → **Settings → API → Project API keys → `anon` / publishable**. *(Not fetched or
  printed here, on purpose.)* **No service-role key is needed anywhere.**

## Stable V7C Preview host (Project B, metadata only — not opened)
`https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`

## STEP 1 — Vercel: add SIX branch-scoped Preview overrides (Project B, `prj_DNWzAKwc9e4SbQODevzRrQl9kAAh`)
Vercel → property-ai (zeebusiness93 team) → Settings → Environment Variables → **Add**. For **each** variable
set **Environment = Preview** and **Git Branch = `v7c-preview-launch-gate`** (branch-scoped — NOT "All Preview",
NOT Production, NOT global):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://mmqxwwjshnpcqngciqtx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | *(the `deal-hunter-preview` branch anon/publishable key)* |
| `WAREHOUSE_SUPABASE_URL` | `https://mmqxwwjshnpcqngciqtx.supabase.co` |
| `WAREHOUSE_SUPABASE_ANON_KEY` | *(the SAME branch anon/publishable key)* |
| `WAREHOUSE_PREVIEW_ENABLED` | `true` |
| `NEXT_PUBLIC_SITE_URL` | `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app` |

- Both URL vars → the **branch** URL (`mmqxwwjshnpcqngciqtx`). Both key vars → the **branch** public key.
- **Never** put a service-role/secret key in any `NEXT_PUBLIC_*` var (or anywhere here).
- **Do not** edit any Production-scoped or global-Preview variable.

## STEP 2 — Supabase Auth redirect (branch project `mmqxwwjshnpcqngciqtx`)
Supabase → project `deal-hunter-preview` → Authentication → URL Configuration → **Redirect URLs → Add**:
```
https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app/auth/callback
```
(Optionally set Site URL to the Preview origin above.) Add only this exact host.

## STEP 3 — Pre-UAT code fixes (required before the ranked feed shows evidence)
Two fixes must land on `v7c-preview-launch-gate` and redeploy **before** a meaningful UAT (see
`V7C_preview_lab_executed.md` → Findings):
1. **Fixture geography_id format** — the replay fixture uses `SAL40530` (maps to `UNKNOWN`); it must be
   `SAL_40530` (etc.) to join SA evidence. Small fix in `lib/listings/fixtures/sa_listings_replay.json` + the
   dependent test geo ids.
2. **Defense-in-depth grant hardening (migration 064)** — Supabase default privileges leave `authenticated`
   with table INSERT on change-events / UPDATE-DELETE on feedback, and `anon` with EXECUTE on the detector.
   RLS already blocks all of these (proven), but a `064` migration should add explicit `revoke`s (as `061`
   did) and be applied to the branch too. **Not a UAT blocker for auth/pipeline/RLS, but required before any
   Production apply.**

## STEP 4 — then resume (my next actions, on your go-ahead)
Redeploy the reviewed commit; prove the Preview reports the isolated branch ref (read-only diagnostic, no
credentials); run the safe UAT (`V7C_preview_UAT.md`) on desktop + mobile with synthetic data; verify each
write against `mmqxwwjshnpcqngciqtx`; capture screenshots; then **pause again** before deleting/extending the
branch (7-day cost guardrail).

## Cost guardrail
Branch billed at **US$0.01344/hr (~US$0.32/day)**. Keep ≤ **7 days** without renewed approval. **No automatic
deletion** — I will ask you before deleting or extending.
