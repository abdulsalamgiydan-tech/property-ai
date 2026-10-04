# V7B — Listing-data provider decision (Deal Hunter Alpha)

**Status:** decision + rationale for which listing-data provider(s) Propellect pursues for the
Deal Hunter acquisition-agent loop. **No provider has been contracted, no credentials exist, and
no live provider data has been ingested.** The alpha is built and proven against a **labelled
deterministic replay dataset** (`lib/listings/fixtures/`). Commercial-enquiry drafts are prepared
(`docs/decisions/v7b_provider_enquiries/`) but **not sent**.

> Sourcing note: public T&Cs and developer docs were reviewed (Aug 2026). Every provider quotes
> pricing per-deal and gates most terms behind a signed contract, so several cells below are
> **"confirm in writing"** — that is exactly what the enquiry drafts ask. Do **not** treat a
> developer trial as commercial-production authorisation.

## Candidates
Domain (Agents & Listings API), PropTrack (REA — Listings + Properties/valuations), Cotality
(formerly CoreLogic / RP Data), and Pricefinder (Domain-owned, evaluated as a fourth option).

## Decision matrix

| Dimension | **Domain** | **PropTrack (REA)** | **Cotality (CoreLogic)** | **Pricefinder** |
|---|---|---|---|---|
| Current sale listings | ✅ Agents & Listings API | ✅ Listings API | ⚠️ not publicly documented (sales-gated) | ✅ listings/sales search |
| Historical listings/sales | ✅ property records | ✅ historic sale & rent series | ✅ deep history (titles + RP Data) | ✅ comparable sales |
| Price fields / hidden-price | ✅ + Price/Rental AVM; est. **must be generated via API, not cached** | ✅ sale & rent valuations, AVM | ✅ AVM 96% sale / 97% rent | ✅ sale+rent estimate, yield |
| Attributes / address precision | ✅ Properties & Locations (validate address) | ✅ attributes, planning, tenure | ✅ 600+ data points, 200+ filters | ✅ 188 schema defs, polygon search |
| Images / floorplans | ✅ in listing feed (view/image events must be reported back) | ⚠️ not documented publicly | ⚠️ not documented | ⚠️ not documented |
| Inspection / agent details | ✅ Agents & Listings | ⚠️ not detailed | ⚠️ not documented | ⚠️ not documented |
| Lifecycle / webhooks | ✅ **Webhooks package** (best-in-class here) | ⚠️ not documented | ⚠️ "24h refresh", no webhooks | ⚠️ none |
| SA coverage / national | ✅ national incl. SA | ✅ national incl. SA | ✅ national incl. SA | ✅ national incl. SA |
| Rate limits | ✅ **published** (1k–3k req/min by plan; auth ≤3k/hr; daily quota resets 10am AEST) | ❌ unpublished | ❌ unpublished | ❌ unpublished |
| Cost model | per-contract, by industry + monthly call volume; **liability cap A$5,000** | subscription/consumption, tiered | contract, ABN-gated | **per-seat** A$175+GST/user/mo |
| Trial / sandbox | ✅ **self-serve** (create project, get keys; sandbox host published) | ❌ account-manager only | ❌ ABN + approval, no public sandbox | ❌ sales-gated, needs paid seat |
| Attribution / link-back | ⚠️ **mandatory** "Powered by Domain" + link to original listing + UTM; pages **no-index** | ❓ confirm | ⚠️ end-user terms restrict publishing | ❓ Domain terms likely apply |
| Storage / caching / retention | ⚠️ storing **discouraged** (~4k updates/day); **delete cached + destroy retrieved data on termination** | ❓ confirm | ⚠️ **return/destroy all copies** on termination; anti-scraping | ⚠️ export limits |
| Display / redistribution | ✅ **public display allowed** *with* attribution; ❌ resale/commercial exploitation; ❌ direct marketing; ❌ programmatic SEO | ❓ not explicitly restricted publicly — confirm | ❌ **"may not incorporate any portion into other materials"**, no resale/commercialise | ❌ "not available for commercialisation"; per-user only |
| Derived scores / estimates | ✅ price/rental estimates permitted (via API) — **confirm our own deal scores** | ✅ valuations/analytics permitted | ⚠️ analytics exist but redistribution banned | ✅ CMA/valuations |
| Behind a subscription? | ⚠️ **listing data, agent contact, and price-estimate data must NOT be paywalled**; our **derived** analysis TBC — **confirm in writing** | ❓ confirm | ❓ confirm | ❌ end-user must hold a paid seat |
| Commercial-production approval | reviewed at account setup; trial ≠ production rights | account-manager arrangement | contract + ABN verification | account manager + paid status |

Legend: ✅ supported/allowed · ⚠️ allowed-with-constraint or restrictive · ❌ prohibited · ❓ unpublished, must confirm.

## Recommendation

- **Primary — Domain Agents & Listings API.** The only provider with a **self-serve sandbox**,
  **published rate limits**, first-class **webhooks** for listing lifecycle, and **explicit
  permission to display listings publicly** (with attribution). Best provider to build and prove
  an alpha against, and the constraints (attribution, no-index, feed stats/enquiries back, don't
  paywall listing/agent/price-estimate data) are workable for our model **if** Domain confirms in
  writing that Propellect's **own derived deal scores, cash-flow scenarios and Deal Brief** may sit
  behind a subscription while the underlying listing display, agent contact and price estimates
  remain free and attributed. This is the pivotal commercial question (see the Domain enquiry).

- **Fallback — PropTrack (REA) Listings + Properties API.** National REA-grade listing depth and
  strong valuations; use if Domain's terms or approval don't fit. Slower to onboard (account-manager
  only, no self-serve), so it is the fallback rather than the build-first provider.

- **Enrichment — PropTrack valuations and/or Cotality AVM (redistribution-restricted lane).** Use a
  licensed AVM/rental estimate to **raise scoring confidence internally only** — never displayed
  verbatim. This matches the existing provider-neutral registry `meta.metric_provider`
  (migration 059): `licensed_restricted` + `redistribution_ok=false`. **Cotality is enrichment-only**
  because its terms forbid incorporating any portion of its data into other materials — it can drive
  a score but must not be shown or redistributed.

**Why this shape:** it plugs straight into the provider-neutral contract already shipped in V6A —
adding a provider is a **registry + adapter** change, never an engine change. See
`docs/architecture/provider_neutral_contract.md` and `V7B_deal_hunter_alpha.md`.

## Hard guardrails (encoded in the build)
- **No scraping** of Domain, realestate.com.au, or any portal. No bypassing access controls.
- A **developer trial does not grant commercial-production rights** — production display/redistribution
  waits for a signed Product Schedule.
- **No client-side provider secrets.** Any live adapter is server-only, credential-gated, and inert
  until real credentials exist (never invented, never pasted into chat).
- Until authorised live access exists, the loop runs on the **labelled replay dataset**; retention,
  attribution and display rules are enforced by the ingestion layer's per-field provenance +
  licensing metadata and a **purge** capability.

## Open questions to confirm in writing (blockers to live production)
1. **Subscription gating** — may Propellect's *derived* deal scores / cash-flow model / Deal Brief be
   premium while listing display + agent contact + price estimates stay free & attributed? (Domain)
2. **Derived-score rights** — are Propellect-computed acquisition scores/estimates (distinct from the
   provider's own AVM) explicitly permitted? (Domain, PropTrack)
3. **Retention** — minimum cache TTL for the buy-box feed and Deal Brief snapshots vs the "delete on
   termination / don't store" rules. (Domain, Cotality)
4. **Enrichment display** — confirmation that a licensed AVM may drive a confidence score without being
   displayed. (PropTrack, Cotality)
5. **SA-first, national-later** coverage and cost per the state-expansion gates. (all)

Sources: [13Labs API comparison](https://www.13labs.au/guides/australian-property-data-apis-compared),
[Domain Developer Portal](https://developer.domain.com.au/),
[Domain Developer FAQ](https://developer.domain.com.au/docs/v2/support/faq/),
[PropTrack API](https://www.proptrack.com/property-data/property-data-apis/),
[Cotality terms](https://corelogic.com.au/about-us/terms-and-conditions).
