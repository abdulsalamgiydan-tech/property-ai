# V8 — Bring Your Own Deal (SA Founding Beta) — architecture

**Branch:** `v8-sa-founding-beta` (from `v7c-preview-launch-gate`). **Status:** built + tested locally;
migration 065 applied NOWHERE; flag off; Production untouched.

## Intent
An invite-only journey where a founding-beta customer scores a property they found elsewhere. They paste
the listing URL **for reference only** and **manually enter** the facts — Propellect **never scrapes or
auto-extracts** the page. The same tested V7 engine scores it against their buy box with official market
evidence and produces the one-page Deal Brief.

## Reuse (no engine fork)
BYOD is a new **input path**, not a new engine. User facts → a `CanonicalListing` with `origin:"user"`
provenance → the exact V7 pipeline: `deriveBuyBox` → `rankDeals([listing])` → `buildDealBrief`. Hard gates
still apply before weighting (a wrong property type / over-budget deal is shown as ineligible, never
hidden). The five evidence classes are preserved and labelled: **your fact / official evidence /
assumption / Propellect estimate / missing**.

## Hard rules honoured
- **No scraping:** the source URL is stored as reference-only provenance (`source_url` + capture time);
  media/agent are never fabricated from it.
- **Labelling:** every figure carries its origin class in the UI (`OriginBadge`) and the brief.
- **Confirmation before scoring incomplete facts:** `assessCompleteness` flags blanks; the API returns
  `needsConfirmation` until the user explicitly confirms (`confirmIncomplete`).
- **Invite-only:** `foundingBetaGateOpen(email)` = `BYOD_FOUNDING_BETA_ENABLED` + email in
  `FOUNDING_BETA_EMAILS`; page + both APIs enforce it; non-invited users get 404/403.
- **RLS + least privilege:** `byod_submissions` mirrors 061/063 (owner-scoped policies, anon/PUBLIC
  revoked). Proven by PGlite tests; passes `warehouse:rls:check` with no new exception.

## Files
- **Engine/gate:** `lib/byod/schema.ts`, `lib/byod/userListing.ts` (+ `.test.ts`), `lib/auth/foundingBeta.ts`.
- **API:** `app/api/byod/analyze/route.ts` (+ `.test.ts`), `app/api/byod/submissions/route.ts`.
- **DB:** `supabase/migrations/065_byod_submissions.sql` (+ `.test.ts`) — **applied nowhere**.
- **UI:** `components/byod/BringYourOwnDealClient.tsx`, `app/byod/page.tsx` (server-gated).
- **UAT:** `playwright.v8.config.ts`, `uat/v8/byod.spec.ts` (8 desktop/mobile specs); scripts `uat:v8[:headed]`.
- **Save path:** BYOD deals persist via `byod_submissions` + the existing `deal_pipeline_items`
  (`listing_key = user-entered:<id>`); feedback via existing `deal_listing_feedback`.

## Verification (local)
vitest **907 pass** (+21 BYOD: engine 8, route 7, migration/RLS 6); `typecheck:ci` 0; eslint clean;
`next build` compiles (`/byod`, `/api/byod/*` registered); `warehouse:rls:check` + secret scan pass;
`uat:v8 --list` = 8 specs. Browser UAT runs at the **first V8 Preview checkpoint** (needs a Preview DB +
the founding-beta env; the isolated V7C branch was deleted, so a new data-less branch is required first).

## Deliberately deferred (documented, not silent)
- Live provider listings — gated on a signed licence (Part 4 package); BYOD is manual-entry only until then.
- Suburb picker limited to the seeded SA set; expands as official coverage grows.
- Analyse/compare/brief analytics events to be emitted into `deal_listing_feedback` for the beta funnel
  (see `V8_founding_beta_plan.md`).
