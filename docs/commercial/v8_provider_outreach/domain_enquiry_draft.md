# DRAFT — Domain commercial data enquiry (UNSENT)

> **Status: unsent draft.** Do not send until Abdul supplies the bracketed facts and approves. Route:
> Domain Developer Portal → self‑serve sandbox sign‑up (github/google/email) for evaluation, and **"Contact our
> team for custom data solutions"** on https://developer.domain.com.au/ for the commercial/production
> conversation. Propellect holds **no** Domain licence or agreement today.

**To:** Domain Group — Developer / API commercial team (via developer.domain.com.au "Contact Us")
**From:** `[CONTACT_NAME]`, `[LEGAL_ENTITY]` (ABN `[ABN]`), `[CONTACT_EMAIL]`
**Subject:** Authorised commercial API access for a small SA property‑analytics founding beta

Hello Domain team,

I'm building **Propellect** (`[LEGAL_ENTITY]`), an evidence‑first property‑investment analytics product for
Australian investors. We'd like to explore an **authorised commercial route** to Domain's **Agents & Listings**
and **Properties & Locations** APIs for a small, time‑boxed **South Australian founding beta**. To be clear
up‑front: **we do not have any current Domain agreement, licence, or access**, and we're seeking the correct
commercial path before building anything on live data.

**The limited use case.** Invited SA investors (up to `[PILOT_USER_COUNT]`) match a specific property to a saved
"buy box" and receive a one‑page "Deal Brief". In the current build the customer **enters the property's facts
manually** and pastes a listing URL **for reference only — we never scrape** any site. We want to replace manual
entry with a **licensed feed**, shown with your required attribution and link‑back.

**How we'd respect your terms.** We would keep the **listing display, agent contact and price/estimate free and
attributed** ("Powered by Domain" + link‑back to the original listing), set listing pages to no‑index where
required, and report enquiry/view events back via your API. Our **own derived analysis** (a deal‑fit score,
conservative cash‑flow scenarios, alerts, and the Deal Brief) is Propellect IP layered on your facts — not your
data — and we would keep raw data un‑redistributed with configurable caching, retention and delete‑on‑termination.

**Our questions (in writing, please):**
1. **Licensing/product:** which package(s) and licence cover a commercial analytics use of listing + property
   data for a small SA pilot, and the path from sandbox to production authorisation?
2. **API/feed availability:** SA coverage, endpoints, rate limits, and **Webhooks** for listing lifecycle.
3. **Storage/caching:** the minimum cache TTL you permit for a buy‑box feed and a Deal Brief snapshot, given the
   "don't store / delete on termination" guidance.
4. **Display & attribution:** exact attribution + link‑back + no‑index requirements for our surfaces.
5. **Derived outputs (pivotal):** may Propellect's derived analysis (score/scenarios/alerts/Deal Brief) sit
   **behind a subscription** while the listing display, agent contact and price estimate remain **free and
   attributed**?
6. **Test environment:** confirm the sandbox is appropriate for our evaluation (we understand a trial is **not**
   production authorisation).
7. **Minimum commitment & pricing:** the smallest plan/volume tier that fits `[ESTIMATED_MONTHLY_LISTING_VOLUME]`
   reads/month, and indicative pricing for SA‑now and national‑later. Our proposed model: `[PROPOSED_COMMERCIAL_MODEL]`.

Happy to share a one‑page overview and take a short call. We want to build this the right way, under your terms.

Kind regards,
`[CONTACT_NAME]` — `[LEGAL_ENTITY]` — app.propellect.com.au — `[CONTACT_EMAIL]`

*Sources for our understanding of your offering (reviewed 2026‑08‑16): developer.domain.com.au and its
Agents & Listings docs + FAQ. Please correct anything we've misread.*
