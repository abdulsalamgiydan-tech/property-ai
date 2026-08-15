# V7C — Safe Preview UAT evidence (isolated branch)

Executed against the **isolated `deal-hunter-preview` branch** (`mmqxwwjshnpcqngciqtx`) only, after the
runtime binding was proven from the SSO'd diagnostic: `configurationOk=true`, `target=preview`,
`gitBranch=v7c-preview-launch-gate`, `commitSha=d9c6fe1…`, `appProjectRef=mmqx...iqtx`,
`warehouseProjectRef=mmqx...iqtx`, `productionRefDetected=false`, `serviceRoleConfigured=false`,
`warehousePreview=true`. **Production untouched throughout.**

## How this UAT was run
The interactive browser journey + desktop/mobile screenshots require a browser, which is **unusable in
this environment** (documented across V6C.1/V6D/V7C). So the journey was exercised at the layer that
actually proves correctness and safety: **the real `authenticated` Postgres role on the live isolated
branch** (RLS enforced), performing the same writes the app makes, with per-step verification against the
isolated DB. Two synthetic Auth users were created for the run and fully cleaned up afterwards.
**Screenshots remain the one open item** — capturable by Abdul in his SSO'd browser (see below).

## Two-user journey (RLS-enforced on the branch)
User A (`a0000000-…-0001`), user B (`b0000000-…-0002`), both synthetic.

**A's journey — all writes landed (verified as owner):**
| Step | Result |
|---|---|
| Buy box: save investment profile | 1 profile (id `7d2a8ec6…`) |
| Shortlist SA suburbs | 2 (`SAL_40530`, `SAL_40089`) |
| Pipeline: reviewing / due diligence / rejected(+reason) | 3 items `{reviewing, due_diligence, rejected}` |
| Feedback: passed / brief_opened / compared | 3 `{passed, compared, brief_opened}` |
| Notification prefs (first-write **create**) | 1 |
| Detector (SECURITY DEFINER) run as A | **10 change events** (2 suburbs × 5 seeded metrics) |
| Rehydration (A re-reads own rows) | profiles 1, shortlist 2, pipeline 3, change-events 10 |
| Owner delete of a pipeline item | 1 row (→ app 200), 2 remain |

Sample change-event carried **verbatim provenance** from the synthetic seed:
`{geo: SAL_40089, metric: median_house_price, direction: new, new_value: 800000, source_id: SYNTHETIC-UAT,
attribution: "V7C synthetic UAT seed - not official data"}` — **no fabrication; labelled synthetic.**

**Two-user isolation + fail-closed (all pass):**
| Check | Result |
|---|---|
| B sees A's profiles / shortlist / pipeline / change-events / feedback / prefs | **0 / 0 / 0 / 0 / 0 / 0** |
| B updates A's pipeline | 0 rows |
| B deletes A's pipeline | 0 rows |
| B forges a change event | **blocked `42501`** (RLS) |
| A rejects a deal without a reason | **blocked `23514`** (DB check) |
| A deletes a non-existent item | 0 rows (→ app 404, fail-closed) |
| A updates append-only feedback | **blocked `42501`** (no update grant post-064) |

## Database-write verification
Every A write was confirmed physically present on `mmqxwwjshnpcqngciqtx` (counts + a provenance-carrying
sample above); B owned nothing. The detector value (800000) equals the seeded `median_house_price`, i.e. the
engine narrated the seed, it did not invent a figure.

## Cleanup — zero synthetic-user residue
Deleting the two synthetic Auth users cascaded (ON DELETE CASCADE) to every user table. Post-cleanup on the
branch: `investment_profiles=0, investment_shortlist_items=0, investment_shortlist_change_events=0,
investment_notification_prefs=0, deal_pipeline_items=0, deal_listing_feedback=0, synthetic auth users=0,
total auth users=0`. The market-evidence seed (`official_observation` `SYNTHETIC-UAT`, 20 rows — not user
data) was retained for any re-run.

## Production untouched (before → after)
Identical Production (`oshquaxsloolqucwvigc`) reads before and after the entire UAT:
`investment_profiles=0, investment_shortlist_items=0, auth_users=4`, latest migration **`061`**, no V7 tables,
**`synthetic_rows_on_prod=0`, `synthetic_users_on_prod=0`**. No Production write/migration/env/flag/deploy;
nothing merged or promoted; no provider enquiries sent.

## Open item — screenshots (needs a browser)
Desktop + mobile screenshots of the rendered journey were not capturable here (no browser). Abdul can capture
them from the proven Preview (`https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app`,
`/deal-hunter`) in his SSO'd browser, or grant a Vercel Protection-Bypass token so they can be captured
headlessly. The functional/security behaviour those screens would show is already proven above.

## Cost guardrail
Branch billed at US$0.01344/hr (~US$0.32/day). Keep ≤ 7 days without renewed approval; ask before delete/extend.

---

## Automated browser UAT — agent + Playwright harness (V7C)

A reusable project subagent **`v7c-preview-uat`** (`.claude/agents/v7c-preview-uat.md`) drives a
deterministic Playwright suite against the isolated Preview. Invoke it with:

> Use the v7c-preview-uat agent to execute the complete isolated Preview UAT.

**Harness:** `playwright.config.ts` (desktop 1440×900 + mobile ~390×844 projects, single worker) and
`uat/v7c/` — `00-isolation-gate.spec.ts` (mandatory pre-mutation gate), `journeys.spec.ts` (auth, buy box,
ranked feed, deal detail, save/pass/reject, compare-3, Deal Brief, refresh persistence, synthetic labelling),
`fixtures.ts` (Production-ref network guard + console/request error capture), `auth.setup.ts` (real
magic-link bootstrap), `generate-evidence.mjs` (machine-readable `uat-result.json` + this section).
Scripts: `npm run uat:v7c`, `uat:v7c:headed`, `uat:v7c:auth`, `uat:v7c:evidence`.

### Bypass secret setup (required — do NOT disable Vercel Authentication)
The Preview is SSO-protected; the harness reaches it via a **Vercel Protection Bypass for Automation** secret
sent as request headers (`x-vercel-protection-bypass`, `x-vercel-set-bypass-cookie: true`). The secret is
never logged/committed/placed in a URL.
1. Vercel → property-ai (zeebusiness93 team) → **Settings → Deployment Protection → Protection Bypass for
   Automation** → enable → copy the secret.
2. Locally (never commit):
   ```
   export VERCEL_PREVIEW_URL=https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app
   export VERCEL_AUTOMATION_BYPASS_SECRET=<secret>
   export UAT_EMAIL=<your isolated-UAT test address>
   ```
3. One-time headed sign-in (real magic link): `npm run uat:v7c:auth` → complete the magic link in the opened
   browser → storage state is saved to `uat/v7c/.auth/state.json` (gitignored).
4. Run the UAT: `npm run uat:v7c` then `npm run uat:v7c:evidence`.

Auth state, traces, videos, HTML report and any secrets are **gitignored** (`uat/v7c/.auth/`, `uat/v7c/.artifacts/`).
Only curated `docs/decisions/v7c_screenshots/*.png` + `uat-result.json` are committed.

<!-- AUTOMATED-UAT-RESULTS -->

## Automated browser UAT results (Playwright)
Generated 2026-08-15T07:18:04.554Z against `https://property-ai-git-v7c-preview-1c5599-zeebusiness93-2304s-projects.vercel.app` — isolated ref `mmqx...iqtx`.

**Totals:** 17/18 passed (1 failed).

| Journey | Viewport | Result |
|---|---|---|
| 01 authentication — signed-in landing, not the signed-out CTA | desktop | PASS |
| 01 authentication — signed-in landing, not the signed-out CTA | mobile | PASS |
| 02 buy box summary explains every answer | desktop | PASS |
| 02 buy box summary explains every answer | mobile | PASS |
| 03 ranked opportunity feed renders matches with a deal score | desktop | PASS |
| 03 ranked opportunity feed renders matches with a deal score | mobile | PASS |
| 04 deal detail + 07 one-page Deal Brief with evidence-class labels | desktop | PASS |
| 04 deal detail + 07 one-page Deal Brief with evidence-class labels | mobile | PASS |
| 05 save / pass(+reason) / reject + persistence, verified via the API | desktop | PASS |
| 05 save / pass(+reason) / reject + persistence, verified via the API | mobile | PASS |
| 06 three-property comparison | desktop | PASS |
| 06 three-property comparison | mobile | **FAIL** |
| 08 refresh + sign-in persistence keeps the buy box | desktop | PASS |
| 08 refresh + sign-in persistence keeps the buy box | mobile | PASS |
| 09 synthetic/replay data is clearly labelled | desktop | PASS |
| 09 synthetic/replay data is clearly labelled | mobile | PASS |
| preview binds ONLY to the isolated deal-hunter-preview branch | desktop | PASS |
| preview binds ONLY to the isolated deal-hunter-preview branch | mobile | PASS |

**Curated screenshots (15):** `01-authentication.desktop.png`, `01-authentication.mobile.png`, `02-buybox.desktop.png`, `02-buybox.mobile.png`, `03-ranked-feed.desktop.png`, `03-ranked-feed.mobile.png`, `04-deal-detail-brief.desktop.png`, `04-deal-detail-brief.mobile.png`, `05-save-pass-reject.desktop.png`, `05-save-pass-reject.mobile.png`, `06-compare.desktop.png`, `08-refresh-persistence.desktop.png`, `08-refresh-persistence.mobile.png`, `09-synthetic-labelling.desktop.png`, `09-synthetic-labelling.mobile.png`.
<!-- AUTOMATED-UAT-RESULTS -->
