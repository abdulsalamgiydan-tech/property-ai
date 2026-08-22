# V7C — Provider approval package (Domain · PropTrack · Cotality)

Decision-ready commercial package to secure **authorised live Australian listing data** for Deal Hunter.
Built from current provider documentation and the V7B decision (`V7B_listing_provider_decision.md`).
**Nothing is sent without Abdul's explicit approval.** Unknown commercial facts are marked **[Abdul to confirm]** —
no registration details, customer counts or traffic are invented.

Attachments: `v7c_provider_enquiries/propellect_one_pager.md` (one-page overview) + final email drafts in the
same folder. Side-by-side approval/cost table: `V7C_commercial_decision_matrix.md`.

## 1. Product overview
Evidence-first property-investment platform; live SA "Find My Investment" beta at app.propellect.com.au;
official CC-BY data with full provenance; AI narrates deterministic output, never fabricates. Deal Hunter adds
a personalised listing→deal-brief loop. **Current scale: [Abdul to confirm].**

## 2. SA beta + nationwide ambition
SA now; nationwide **state-by-state**, each state gated on present + fresh + licence-cleared data for price,
rent, yield, volume, growth. No nationwide claim until every offered state passes.

## 3. Exact Deal Hunter customer journey
Saved profile → **buy box** (hard gates + soft prefs, every answer explained) → **ranked feed** of on-market
listings (hard-gate failures shown, never hidden by score) → **deal detail** (evidence-class labelled) →
**one-page Deal Brief** → pipeline (New→Reviewing→Due diligence→Rejected→Offer considered) → alerts on new
matches / price changes / under-offer / withdrawal.

## 4. Requested listing/property fields
Address + geocode & precision; property type, bedrooms, bathrooms, parking, land/building area; advertised
price text + structured bounds + price-visibility flag; description; **image + floorplan references**;
inspection times; **agent name + contact URL**; listing lifecycle status; provider listing id + (where
available) property id; listing/updated/first-seen timestamps.

## 5. Expected volumes  **[Abdul to confirm exact figures]**
- **Initial (SA pilot):** ~**[Abdul to confirm]** listing reads/day; a modest daily refresh of active SA
  sale listings (SA has on the order of a few thousand active sale listings at a time).
- **12-month (SA→multi-state):** ~**[Abdul to confirm]** reads/day as coverage and users grow.
- We will size to whichever **plan/volume tier** you recommend; happy to start on the smallest that fits.

## 6. Refresh, caching, retention, purge
- **Refresh** on a schedule (and via **webhooks/lifecycle events** where offered) so displayed listings stay
  current; we surface staleness rather than show stale data as fresh.
- **Caching**: minimal — only what's needed to render a user's buy-box feed and a Deal Brief snapshot.
- **Retention/purge**: per-field licensing metadata + a **purge capability** (retention-window expiry,
  provider-directed takedown, and **delete-on-termination**). Proposed cache TTL: **[to agree]**.

## 7. Attribution & original-listing link-back
Every displayed listing carries the provider's **attribution** (e.g. "Powered by Domain") and a **link + UTM
back to the original listing**; listing detail pages set to **no-index** where required; view/image/enquiry
events reported back via your API where required (Domain cl. 17.1).

## 8. Free listing/agent/price presentation
Listing display, **agent contact**, and any provider price/estimate remain **free and never paywalled**.

## 9. Proposed paid boundary
Only **Propellect-derived** outputs are premium: personalised **deal-fit scores**, **cash-flow scenario
modelling**, **alerts**, and the **Deal Brief**. These are our IP layered on your facts, not your data.

## 10. Agent contact stays unrestricted
Confirmed: contacting the listing agent is never behind a paywall/login.

## 11. Privacy & security controls
Provenance on every figure; RLS-isolated per-user data; least-privilege DB access (SECURITY DEFINER consumer
RPCs; no client-side provider secrets); server-only credentials; audit-able caching/retention/purge.

## 12. No scraping / no onward redistribution
We will not scrape realestate.com.au, domain.com.au or any portal, will not bypass access controls, and will
not redistribute raw provider data onward. A developer trial is **not** treated as production authorisation.

## 13. Proposed pilot
**SA-only, time-boxed pilot** (e.g. 60–90 days) on a sandbox/trial tier: prove the listing→Deal Brief loop on
a small live SA sample under your terms, with attribution + link-back live and retention/purge enforced;
convert to a production Product Schedule on success. **[Abdul to confirm pilot length/scope.]**

## 14. Trial / sandbox / pricing / production-access asks
- Sandbox or trial credentials to integrate and demonstrate the pilot.
- The plan/volume tier + indicative **pricing** for SA-now and national-later.
- The path and requirements to **commercial-production** approval (a signed Product Schedule).

## 15. The explicit permission questions (ask each provider, in writing)
May Propellect:
1. **Rank listings** using our own **derived scores**?
2. **Combine your listing facts with public official market evidence** (ABS/state open data)?
3. **Display financial scenarios and estimated cash flow** derived from your facts + user inputs?
4. **Charge for the analysis** while keeping the required **listing information free** (display + agent + price)?
5. **Store canonical identifiers, derived values and change history** (not raw redistribution)?
6. **Cache fields and media references** (and for how long)?
7. **Notify customers** of new matches and listing changes?
8. **Retain derived outputs** (our score/brief) **after the source listing is withdrawn**?
9. **Expand nationally under the same agreement** as coverage gates pass?

## 16. Requested response timeline
An initial response within **~2 weeks**, and a call to walk through the use case. **[Abdul to confirm/adjust.]**

## 17. Contact routes (per provider)
- **Domain** — Developer portal `developer.domain.com.au` (self-serve sandbox) → commercial/API team via the
  portal's contact/commercial enquiry. **[Abdul to confirm named commercial contact if one exists.]**
- **PropTrack (REA)** — `proptrack.com/property-data/property-data-apis/` → "speak to a specialist" enquiry
  (account-manager gated; no self-serve). **[Abdul to confirm specialist contact.]**
- **Cotality (CoreLogic / RP Data)** — `cotality.com/au/support`, sales **1300 734 318**; ABN + approval
  required. **[Abdul to confirm account/sales contact.]**

## 18. Recommended negotiation order
1. **Domain** (primary) — only self-serve sandbox + published rate limits + webhooks + explicit display
   permission; fastest to a working pilot. Lead here.
2. **PropTrack** (fallback listings + strong valuations) — engage in parallel as the fallback and as the
   preferred **enrichment/AVM** source.
3. **Cotality** (enrichment only) — engage for a **redistribution-restricted, score-only** AVM/attribute feed;
   do not rely on it for display.

## 19. Fallback plan if each declines
- **Domain declines / terms don't fit** → build listings on **PropTrack**; keep the same provider-neutral
  adapter (a registry + adapter change, not an engine change).
- **PropTrack also declines** → continue Deal Hunter on **labelled replay data** as a design/QA harness; ship
  the suburb-level product (already live) and revisit listings when a provider fits; consider a **direct
  agent/agency feed** or an authorised aggregator **[Abdul to confirm options]**.
- **Cotality declines** → use PropTrack AVM for enrichment, or ship without licensed enrichment (confidence
  derived from official data only — no fabrication either way).
- In every branch: **no scraping, no unlicensed display** — the product degrades gracefully to what is licensed.

## 20. Do-not / guardrails
Do not send any enquiry without Abdul's approval. Do not treat a trial as production rights. Do not invent
company facts, customer counts or traffic. Mark unknowns **[Abdul to confirm]**.
