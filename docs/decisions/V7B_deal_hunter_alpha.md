# V7B — Deal Hunter Alpha (personalised listing → deal-brief loop)

**Status:** built on an isolated worktree `v7b-deal-hunter-alpha`, **stacked on the reviewed V7A
commit `1d4bf1a`** (draft PR #39). Production, the live V6D beta, V6D monitoring and PR #37 are
untouched. **Migrations 062 and 063 are DRAFTS, applied nowhere remote.** No flags flipped, no
deploys, no live provider data. The loop runs on a **clearly-labelled replay dataset**.

## Mission delivered
An authenticated investor's saved profile becomes a **personal buy box**; lawful listing data enters
through a **provider-neutral pipeline**; **replayed SA listings** are ranked **transparently**; and the
investor gets a **decision-grade deal brief** — evidence, scenarios and verification actions, never a
recommendation, never a fabricated figure.

## End-to-end data flow

```
 Saved investment profile (investment_profiles, RLS)
        │  deriveBuyBox()  [lib/dealhunter/buybox.ts]  ── every answer → explained effect
        ▼
   BUY BOX  { hard gates + soft preferences }
        │
        │        Provider-neutral ingestion  [lib/listings/*]
        │   ReplayListingProvider ──fetchRaw──► RawListing
        │          │ toCanonical (+ field-level provenance + licence)
        │          ▼
        │     CanonicalListing ──upsertListings──► store (+ ListingChange[])
        │          (idempotent · dedupe · relisting · lifecycle · purge)
        │                                   │
        ▼                                   ▼
   rankDeals()  [lib/dealhunter/ranking.ts]  deriveListingEvents()  [events.ts]
        │  1. HARD GATES first (never hidden by score)                 │  new match / price /
        │  2. reuse scenarioFor→analyzeProperty (cash-flow estimate)   │  under offer / removed /
        │  3. deal_score_v1 sub-indices (reuse opportunity indices)    │  score threshold / stale
        │  4. full explanation + evidence-class separation             ▼
        ▼                                                        (per-user, buy-box members only)
   DealResult { ranked | needsReview | ineligible }
        │  buildDealBrief()  [dealbrief.ts]  ── every figure labelled by evidence class
        ▼
   Deal Hunter UI  /deal-hunter   [components/deal-hunter/DealHunterClient.tsx]
        │  save / review / due-diligence / pass(+reason) / compare-3 / brief
        ▼
   Pipeline (deal_pipeline_items, RLS)  +  Feedback (deal_listing_feedback, append-only)
        │  proposePreferenceAdjustments()  [feedback.ts]  ── transparent proposals only
        ▼
   "Suggested tweaks" (user approves by editing their profile — never auto-applied)
```

Market evidence (rent/yield/growth/volume/price) comes from the **existing least-privilege
`get_investment_candidates_v1` RPC** (official CC-BY open data) — the same provider-neutral spine as
V6A. Adding Domain/PropTrack/Cotality is an **adapter + registry** change, not an engine change.

## Evidence-class separation (the trust core)
Every figure the UI shows is labelled as one of five classes, so the investor always knows what is a
fact, what is our analysis, and what is missing:
1. **Listing facts** — from the provider (price text, attributes, agent, media) with field-level provenance.
2. **Propellect market evidence** — official suburb metrics + source · period.
3. **User assumptions** — the financial inputs that fed the model (interest rate, deposit, etc.).
4. **Propellect estimates** — the cash-flow scenario + deal score (reuses the tested engine).
5. **Missing / stale** — shown as "missing", never back-filled with an invented value.

## Hard gates are never hidden
`rankDeals` applies hard gates **before** any weighting. A gate failure (over budget, deposit too
small, wrong state/type, exceeds holding budget, explicit exclusion, below min beds) puts the listing
in **`ineligible`** with the reason shown — a strong weighted score can never rescue it. Proven by
test: Unley at A$1.65M with the highest suburb growth (8%) is excluded, not ranked.

## No fabrication
- A change is recorded only when the official `period_end` advances; undisclosed price → no invented
  price (routed to **needs review**); missing rent → **no cash-flow estimate** (couldKillDeal explains why).
- Provider licence + retention are enforced by the ingestion layer (`isDisplayable`, `purgeExpired`,
  `purgeProvider`); enrichment-only providers (`redistributionOk=false`) drive scores but never display.

## Security (mirrors 059/061/062)
- `deal_pipeline_items` — RLS to owner, full DML; a **rejected item must carry a reason** (DB check).
- `deal_listing_feedback` — **append-only** (select+insert only; registered RLS-checker exception).
- All Deal Hunter APIs are **flag-gated** (`WAREHOUSE_PREVIEW_ENABLED`), auth-required, RLS-scoped,
  **fail-closed** (zero affected rows → 404). The `/deal-hunter` page 404s when the flag is off.
- **No client-side provider secrets.** The Domain adapter is server-only, credential-gated, and inert
  (fails closed) until authorised credentials exist — never invented.

## What is deliberately NOT in the alpha
- No live provider data (awaiting written commercial approval — see `V7B_listing_provider_decision.md`).
- No persisted canonical listings and no persisted per-user listing events — computed on the fly from
  replay, so there is no forgeable listing-event table. Live ingestion + a definer detector is a later,
  separately-approved migration.
- No polish of the V7A notification-prefs UI and no DB-side confidence events (out of scope per the mission).

## Verification (see H section of the release + tests)
- `vitest` **882 pass** (114 files, 8 pre-existing skips). New V7B tests: ingestion (10), deal engine (12),
  feed helpers (2), pipeline API (5), migration 063 (6).
- `eslint` clean · `warehouse:rls:check` pass · secret scan clean · `tsc` adds no new errors.
- **Browser journey:** the local headed browser / gstack `/browse` is **unusable in this Windows env**
  (documented in prior V6D work), and no live Supabase branch is used here, so desktop/mobile screenshots
  could not be captured in-session. The journey is instead proven by component wiring + the full API/engine
  test suite; capturing screenshots on a Preview deploy is a tracked follow-up (see roadmap).

## Do NOT (gates)
Do not apply migrations 062/063, flip `WAREHOUSE_PREVIEW_ENABLED`, merge, deploy, ingest live provider
data, or disturb V6D monitoring / PR #37.
