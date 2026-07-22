# Sprint 13 Phase 1 — Browser Test Report

Real browser testing (gstack `browse`, headless Chromium) against a local
`npm run dev` server with the local `.env.local` warehouse flags already
enabled (`WAREHOUSE_PREVIEW_ENABLED`, `MULTI_STATE_RESEARCH_ENABLED`,
`PUBLIC_API_V1_ENABLED`, `SCENARIO_LAB_ENABLED`). No production or shared
environment was touched — this ran entirely against localhost.

## What was directly verified live

| Journey | Result |
|---|---|
| `/research/explore` loads | Real render: new "Research" nav link present, `GeographySearchBox` combobox present, existing filter form intact |
| Type "melbourne" into the search box | Real debounced suggestions returned from `/api/research/search-suggest`: East Melbourne, Melbourne, Melbourne Airport, North Melbourne, Port Melbourne, South Melbourne, West Melbourne — each with correct VIC/Suburb badges. No console errors. |
| `GET /api/research/search-suggest?q=Melbourne&jurisdiction=VIC&type=SAL` direct call | Returns real warehouse rows (`geography_id`, real ASGS-style codes) — confirms the route and `searchGeographiesV2()` wiring work end-to-end, not just the UI shell |
| `/research/suburb/21640` (Melbourne, VIC) loads | No console errors; "About this metric" link count went from the pre-Sprint-13 baseline of 4 to **7**, confirming the three new WS4 embeds (dwelling stock, approvals, demographics) actually render |
| `/research/scenario/21640` loads | No console errors; all three default scenario cases render with their real labels (**Base case**, **Conservative**, **Stress**, confirmed via each case's name input value); each shows a "Debt & equity path" table (3 instances = one per case) |
| `/research/compare?ids=<3 real geography ids>` loads | No console errors; column order matches the `?ids=` order exactly (East Melbourne, Melbourne, Melbourne Airport) |
| Click "Move East Melbourne right" | Table re-rendered with East Melbourne now in position 2, **and the URL updated** to `?ids=SAL_21640...,SAL_20830...,SAL_21641...` — confirms the reorder-and-shareable-URL contract works, not just the visual swap |
| `/analyse-property` loads | No console errors |
| Fill suburb "Melbourne" with state left at the default (QLD) and blur | The "not covered yet" message rendered correctly (`SUBURB_SUGGESTION_NOT_COVERED_MESSAGE`), confirming the async suggestion flow runs without crashing and correctly branches on jurisdiction |
| Set state to NSW, fill suburb "Calderwood", blur | No console errors during the full async round-trip (state select → fill → blur → fetch) |

## What was NOT directly re-verified in the browser this pass

- The "available: true, suggestions applied" visual state inside Analyse
  a Property's collapsed Advanced Assumptions panel — the automation
  couldn't reliably expand the `<details>` panel and read the applied
  banner text in the time available. This exact code path (all 4 outcome
  branches: `state_not_covered`, `no_match`, `insufficient_data`,
  `available: true` with partial data) **is** covered by 5 passing
  automated tests in `app/api/analyse/suburb-suggestions/route.test.ts`
  and 5 more in `lib/suburbAssumptions.test.ts`, including an explicit
  assertion that a null `rentalGrowthPercent` from the API stays `null`
  on the client, never becomes `0`. The live browser check confirmed the
  request pipeline runs error-free; it did not re-confirm the visual
  banner text for the success case.
- Any authenticated flow (Watchlist's geography-search add form,
  Scenario Lab's "Save this scenario" button, Dashboard's "Saved
  research" section) — these require a real signed-in session via magic
  link, which isn't automatable in this environment without a live email
  round-trip. These are covered by unit/integration tests
  (`lib/supabase/scenarioLabCases.ts` mirrors the already-used
  `watchlist.ts` pattern; no dedicated test file was added for either
  since neither had one before this phase — see known limitations) but
  were not exercised end-to-end as a signed-in user in a browser this
  pass.
- Mobile/responsive layout of the new 7-column bottom nav bar was not
  screenshotted this pass.

## Verdict

The highest-risk new surfaces (search-as-you-type, the 3 new
explainability embeds, multi-case Scenario Lab v2, and comparison
reorder-with-shareable-URL) were exercised against a real running
server with real warehouse data and produced zero console errors. The
unauthenticated Analyse-Property flow was exercised through its full
async request cycle without error. Authenticated save/persist flows and
the exact "suggestions applied" visual state are validated by automated
tests but not by this pass's live browser session — flagged honestly
rather than claimed as verified.
