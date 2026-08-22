# V7C — Preview containment audit + isolated Preview lab plan

**Status:** read-only audit complete. Creating the isolated lab is **paused at the cost gate** for
Abdul's approval (Supabase branch is chargeable). **Zero writes were made** during this audit — every
Vercel/Supabase MCP call was read-only (`list_*`, `get_*`, `get_cost`). Production, its env vars, the
live domain, migrations 059–061, the V6D deployment and its monitoring were not touched. PRs #37/#39/#40
were not modified.

## A. Preview containment audit (read-only)

Two Vercel Previews auto-built from the V7B push (commit `72b311d`, branch `v7b-deal-hunter-alpha`, PR #40).
Both were inspected via metadata only — **no application route or function was invoked**.

| | **Project B (serves Production)** | **Project A** |
|---|---|---|
| Vercel project | `prj_DNWzAKwc9e4SbQODevzRrQl9kAAh` | `prj_VNzv1zxH8ulzVqk5pNoatpjBxC9j` |
| Team | `team_C9DDb5QQbFOdDkAMH76e8z3c` (zeebusiness93) | `team_taWz31infhB7UWgHWnFXNn4V` (abdulsalamgiydan-9539) |
| Preview deployment | `dpl_3J1g5veJN2ouNngSvCnYrinz6918` | `dpl_FYNJT6tc1QrhVe3rGYHvaoDtfDo7` |
| Commit / branch / PR | `72b311d` / `v7b-deal-hunter-alpha` / #40 | same |
| **Deploy target** | **`null` → Preview** (not a production promotion) | **`null` → Preview** |
| Production domains on project | `app.propellect.com.au`, `www.propellect.com.au`, `propellect.com.au` | none |
| Deployment protection | **SSO (Vercel Auth) on `preview`** → not publicly reachable | **SSO on `all_except_custom_domains`** → not publicly reachable |

**Env-var / Supabase-isolation determination — could NOT be proven.** The Vercel MCP surface exposes
**no tool to read environment-variable names, scopes, or branch overrides**, and the Vercel CLI is not
installed in this environment (session start confirmed). Therefore I could not inspect whether Project B's
Preview resolves its `SUPABASE_URL` / keys to Production (`oshquaxsloolqucwvigc`) or elsewhere.

- **Decision (per audit rule A.5): the Project B Preview is recorded UNSAFE** (isolation unprovable) and
  **must not be interacted with** — no login, no reads/writes of authenticated flows. It shares Project B's
  environment, which very likely points at Production Supabase; a signed-in mutable action there could write
  to Production. I did not interact with it and will not.
- The Project A Preview is likewise treated as unproven for mutable flows.
- **Mitigating facts (not a substitute for isolation):** both Previews are SSO-gated (no anonymous access);
  the whole Deal Hunter surface is flag-gated (`WAREHOUSE_PREVIEW_ENABLED`); and V7B's mutable endpoints
  target migration-062/063 tables that **do not exist in Production**, so those specific writes would fail
  closed even if pointed at Production. Safety here rests on **non-interaction**, not on those facts.

**A.6 — why Project A also builds this repo:** both Vercel projects are linked to the **same GitHub repo**
(`githubRepoId 1217387281`), so every branch push triggers a Preview on **both** projects. This is the
pre-existing "duplicate project" situation (V5C). **Neither project was unlinked or modified** (out of scope).

## B. Isolated Preview lab — plan + cost gate (PAUSED)

Goal: a genuinely isolated Preview whose database is a **new, data-less Supabase branch** seeded only with
labelled synthetic SA data, wired to the Preview via **branch-scoped** Vercel env vars — so a UAT can never
touch Production.

### B.1 Supabase inventory (read-only)
Org `aqzffbnmokqxwpdtjafg`. Projects: **`oshquaxsloolqucwvigc` (Production, ap-southeast-1)** and
`nmburuqjypcalqeegaae` (zee.business93, ap-southeast-2). Existing branches of Production:
- `main` (default, `with_data=false`)
- `warehouse-validation` (ref `lzonauinzatmtytyoems`, `with_data=false`) — the **rehearsal branch**
  (V4A/V5A/V6B). **Not reused** (per B.2 — it has held rehearsal state and is not the Deal Hunter lab).

### B.2/B.3 Decision
Create a **new, dedicated, data-less** branch `deal-hunter-preview` off the Production project — schema only
(`with_data=false`, so **no customer/rehearsal data is copied**). Do **not** reuse `warehouse-validation`.

### B.4 COST GATE — exact cost, PAUSED for Abdul's approval ⛔
`get_cost(branch, org aqzffbnmokqxwpdtjafg)` → **US$0.01344 per hour**, billed hourly
(≈ **US$0.32/day**, ≈ **US$9.68/month** while the branch exists). **I have not created it.** Creating the
branch, applying migrations, seeding, and wiring the Preview all wait for explicit approval.

### B.5–B.12 Post-approval runbook (NOT yet executed)
1. `create_branch` → `deal-hunter-preview` (data-less) off `oshquaxsloolqucwvigc`.
2. Apply migrations **through 063 only** to that branch via `apply_migration` (001→063). Re-verify **062/063
   remain unapplied to Production**.
3. Seed **only** the labelled synthetic replay SA data (`lib/listings/fixtures/*`) + a couple of test
   suburbs' official-style metrics. **Never** copy Production users/customer data.
4. Data-API posture to re-verify on the branch (B.6): intended grants only; RLS on every exposed user table;
   `WITH CHECK` on updates; no authenticated cross-user access; no direct event forgery (definer-only writer);
   SECURITY DEFINER + pinned `search_path` + `revoke … from public`. (These are already proven in the 062/063
   PGlite tests; re-assert against the live branch.)
5. **Vercel Preview env (Abdul's step — not possible from here):** set **branch-scoped** vars for the
   V7C/V7B branch only: isolated `NEXT_PUBLIC_SUPABASE_URL`, isolated publishable/anon key, a **server-only**
   branch service credential **only if genuinely required**, and `WAREHOUSE_PREVIEW_ENABLED=true`.
   **Never** put a privileged credential in a `NEXT_PUBLIC_*` var. **Do not change any Production-scoped var.**
   Configure Supabase **Auth redirect** URLs for the **exact Preview hostname** only.
   > Blocker: there is no MCP tool and no installed CLI to set Vercel env vars here, so B.7/B.10 must be done
   > by Abdul in the Vercel dashboard (or `vercel env add` once the CLI is installed).
6. Redeploy the reviewed commit so the Preview picks up the corrected env, then **prove** the Preview reports
   the isolated branch **without exposing credentials** (e.g. a read-only `/api/diagnostics` that echoes the
   Supabase project *ref* only, never keys).

## Production-untouched evidence (this audit)
- Vercel: only `list_teams`, `get_deployment`, `get_project`, `get_project_deployment_protection` (all read).
  No deploy, no promote, no env change, no project relink.
- Supabase: only `list_projects`, `list_branches`, `list_migrations`, `get_cost` (all read). **No
  `create_branch`, no `apply_migration`, no `confirm_cost`, no writes.**
- `list_migrations(oshquaxsloolqucwvigc)` → newest applied = **061**; **062 and 063 absent** from Production.
- No change to PRs #37/#39/#40; no flag flips; no domain change.
