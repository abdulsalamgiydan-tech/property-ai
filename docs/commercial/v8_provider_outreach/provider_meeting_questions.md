# V8 — Provider meeting questions (for a call with Domain / PropTrack / Cotality)

Use in a follow‑up call after an initial enquiry. Grouped so you can capture written answers. Nothing here
implies an existing agreement. Australian English.

## A. Licence & rights (the ones that gate everything)
1. Which product + licence covers a **commercial analytics** use of your listing/property data for a small SA pilot?
2. **Pivotal:** may our **derived** outputs (deal‑fit score, cash‑flow scenarios, alerts, one‑page Deal Brief) be
   **behind a subscription** while your **listing display, agent contact and price/estimate remain free and
   attributed**? (Domain/PropTrack)
3. Are **Propellect‑computed** acquisition scores/estimates (distinct from your own AVM) explicitly permitted?
4. For enrichment (Cotality/PropTrack AVM): may a licensed value drive an **internal‑only, non‑displayed**
   confidence score, never redistributed?

## B. Data, coverage & delivery
5. SA coverage today; national roadmap. Endpoints/feeds relevant to listings, attributes, price/rent estimates.
6. Refresh cadence and **lifecycle webhooks** (new / price‑changed / under‑offer / withdrawn / sold)?
7. Published **rate limits** and quotas; auth model; sandbox vs production hosts.

## C. Display, attribution & storage
8. Exact **attribution** + **link‑back** + **no‑index** requirements for our surfaces.
9. Media (images/floorplans) display rights and any **event‑reporting‑back** obligations.
10. Permitted **cache TTL** for a buy‑box feed and a Deal Brief snapshot; **delete/destroy‑on‑termination** steps.
11. May we retain our **own derived output** (score/brief) after a source listing is withdrawn?

## D. Commercials & process
12. Smallest **plan/volume tier** fitting `[ESTIMATED_MONTHLY_LISTING_VOLUME]` reads/month; indicative pricing
    SA‑now / national‑later.
13. **Minimum commitment**, contract term, liability cap, and any ABN‑verification steps.
14. **Test/evaluation** access before commitment (confirming a trial is **not** production authorisation).
15. Path and timeline from enquiry → sandbox → signed production **Product Schedule**.

## E. Compliance & partnership
16. Anything about our model (evidence separation, no scraping, provenance, purge) you'd want changed?
17. Named commercial contact + expected response time.

**Placeholders to fill before the call:** `[LEGAL_ENTITY]`, `[ABN]`, `[CONTACT_NAME]`, `[CONTACT_EMAIL]`,
`[PILOT_USER_COUNT]`, `[ESTIMATED_MONTHLY_LISTING_VOLUME]`, `[PROPOSED_COMMERCIAL_MODEL]` (see `abdul_decisions.md`).
