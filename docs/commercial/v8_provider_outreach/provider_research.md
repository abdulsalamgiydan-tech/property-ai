# V8 — Provider research (Domain · PropTrack · Cotality)

**Research date:** 2026‑08‑16. **Method:** live review of each provider's primary official pages
(WebSearch + WebFetch), cross‑checked against prior Propellect research (`docs/decisions/`). Australian English.
**Status of every commercial term below: to be confirmed in writing with the provider — do not treat as agreed.**

**Legend:** ✅ documented on an official page · ⚠️ documented‑with‑constraint · ❓ not found on the pages
reviewed → provider must confirm. Where a claim is not on a live page it is labelled **(prior research —
re‑verify)**.

Propellect context for these enquiries: an evidence‑first analytics product. In V8 "Bring Your Own Deal",
a customer **manually enters** a property's facts and pastes a listing URL **for reference only** — Propellect
**does not scrape** listing sites. We seek an **authorised commercial route** to *licensed* listing/property
data so we can replace manual entry with a compliant feed. We keep a strict separation between **user‑supplied
facts**, **official/provider data**, **derived calculations**, and **model estimates/assumptions**.

---

## 1. Domain (Domain Group)
- **Page title:** "Domain API | Property Data API | Real Estate Data API Australia | Domain Developer Portal"
- **Direct URL:** https://developer.domain.com.au/ (docs: https://developer.domain.com.au/docs/latest/apis/pkg_agents_listings/ ; FAQ: https://developer.domain.com.au/docs/v2/support/faq/ ; solutions: https://insight.domain.com.au/solutions/property-data/)
- **Access/licensing product described:** a developer API platform with ~12 packages, incl. **Agents & Listings**
  ("Access data on agents and listings directly from Domain"), **Properties & Locations**, Address Suggestions,
  Listing Management, **Price Estimation**, Property Enrichment, Property Package, PropertyRadar, **Rental AVM API**,
  Schools Data, and **Webhooks**. ✅
- **Access route / self‑serve:** "Sign up today using your Github, Google account or plain email"; **Live API
  Browser** + **sandbox environment** to test before launching; a project immediately grants "Agencies and
  Listings" and "Properties and Locations". ✅ Self‑serve sandbox exists.
- **Intended customer/use case:** agencies displaying property data on "reports, apps and websites"; CRM listing
  uploads & lead management; **banks/fintechs** estimating equity, suburb performance, median prices. ✅
- **Contact/enquiry route:** self‑serve sign‑up for sandbox; **"Contact our team for custom data solutions" /
  "Contact Us"** on the developer portal for commercial/production arrangements. ✅
- **Publicly documented restrictions relevant to display/store/analyse/derive** — *(prior research — re‑verify
  against the current Developer Terms + FAQ):* mandatory **attribution** ("Powered by Domain") + **link‑back** to
  the original listing with UTM; listing detail pages set to **no‑index**; **view/image/enquiry events reported
  back** via the API; **storing/caching discouraged** and a **delete‑cached / destroy‑retrieved‑data on
  termination** obligation; **public display allowed with attribution**, but **resale / commercial exploitation /
  direct marketing / programmatic SEO prohibited**; **liability cap A$5,000** (published). Provider‑generated
  price estimates historically **must be generated via API, not cached**. ⚠️
- **Uncertainty requiring provider confirmation:**
  - **Pivotal:** may Propellect's **derived** analysis (deal‑fit score, cash‑flow scenarios, alerts, Deal Brief)
    sit **behind a subscription** while the **listing display, agent contact and price estimate stay free and
    attributed**? ❓
  - Minimum cache TTL for a buy‑box feed + Deal Brief snapshot vs the "don't store / delete on termination" rules. ❓
  - Are Propellect‑computed acquisition scores (distinct from Domain's own AVM) explicitly permitted? ❓
  - SA‑first pilot terms, and national expansion under the same agreement. ❓

## 2. PropTrack (REA Group)
- **Page title:** "API – PropTrack" *(from search result listing; the live page fetch returned a connection
  error `ECONNRESET` on 2026‑08‑16 — re‑fetch before relying on exact wording).*
- **Direct URL:** https://www.proptrack.com/property-data/property-data-apis/ (valuations platform:
  https://www.proptrack.com/mortgage-solutions/proptrack-valuations-platform/ ; reports:
  https://www.proptrack.com/property-data/dynamic-property-reports/)
- **Access/licensing product described:** the **PropTrack Market API** ("the most comprehensive property market
  insights in Australia"), an **Auction Results API** "along with 16 other APIs", a **property report API** for
  CRM integration, and a **Valuations Platform** (order valuations via UI or API). Data is described as leveraging
  **realestate.com.au** ("the #1 listings site in Australia", ~2.4M daily users). ✅ (search snapshot)
- **Access route / self‑serve:** **account‑manager / "speak to a specialist" gated** — no self‑serve sandbox
  documented. **(prior research — re‑verify)** ⚠️
- **Intended customer/use case:** banks/lenders/valuers, proptech, and businesses needing REA‑grade listings +
  valuations/AVM and market insights. ✅ (search snapshot)
- **Contact/enquiry route:** enquiry form / "speak to a specialist" on proptrack.com (no public phone/email found
  on the reviewed pages). ❓ exact route — confirm on the live API page.
- **Publicly documented restrictions:** not found on the pages reviewed on 2026‑08‑16 (fetch failed) →
  **must confirm** display/storage/redistribution and **derived‑analytics** rights in writing. ❓
- **Uncertainty requiring provider confirmation:** all commercial terms (rate limits, pricing model, storage,
  display, derived‑score rights, attribution, sandbox/test access, minimum commitment). ❓

## 3. Cotality (formerly CoreLogic / RP Data)
- **Page title:** "Our data" (Cotality). Company rebranded from **CoreLogic** to **Cotality**.
- **Direct URL:** https://www.cotality.com/au/our-data (products: https://www.cotality.com/au/products/rp-data ,
  https://www.cotality.com/au/products/commercial-api ; store: https://www.cotality.com/au/corestore →
  https://corestore.corelogic.com.au/)
- **Access/licensing product described:** enriched property data — "**200 Million property attribute records**",
  "**950 Million digital assets and images**", AI‑powered analytics and **real‑time APIs**, enriched records
  ("ownership details and market value to construction attributes and climate risk"), Energy Efficiency Ratings,
  Hazards & Risk. **RP Data** platform (rebrand of the CoreLogic/RP Data product). ✅
- **Access route / gating:** "Connect … property data to your existing tools with a **custom API**"; data
  **marketplaces** (Snowflake now; Databricks & Google Cloud "coming soon"); **bulk data export**; a **"Buy now"**
  path to **CoreStore**. Contract / ABN verification is required for licensed feeds. **(prior research —
  re‑verify)** ⚠️
- **Intended customer/use case:** "Real estate, finance, and more" — decisioning and workflows across industries. ✅
- **Contact/sales route:** **CoreStore** "Buy now" + **Support**; **sales phone 1300 734 318** (from search
  result). ✅
- **Publicly documented restrictions** — *(prior research — re‑verify against current end‑user terms):* end‑user
  terms historically **prohibit incorporating any portion of the data into other materials**, **resale /
  commercialisation**, and require **return/destroy all copies on termination**; anti‑scraping. This is why
  Propellect scopes Cotality as **enrichment / score‑only** (drive a confidence score internally, **never
  displayed or redistributed**). ⚠️
- **Uncertainty requiring provider confirmation:** whether a **non‑display, internal‑only** derived confidence
  use is permitted; feed vs marketplace access for a small SA pilot; pricing; ABN‑gating steps. ❓

---

## Cross‑provider uncertainties (all require written confirmation)
1. **Derived‑analytics rights** — Propellect's own scores/scenarios/brief as premium output layered on licensed
   facts (distinct from the provider's own AVM).
2. **Free‑vs‑paid boundary** — keeping listing display + agent contact + price estimate free & attributed while
   charging for the derived analysis (the pivotal Domain question).
3. **Storage/retention** — cache TTL for a buy‑box feed and Deal Brief snapshot vs delete/destroy‑on‑termination.
4. **SA‑first pilot** terms, minimum commitment, and national expansion under one agreement.
5. **Pricing** — unpublished for all three; each quotes per‑deal.

## Standing guardrails (unchanged, encoded in the product)
No scraping of any portal; a developer trial is **not** production authorisation; no client‑side provider secrets;
until a signed licence exists the product runs on **manual user‑entered facts** (V8 BYOD) and labelled synthetic
data — never presented as licensed live data.

## Sources (reviewed 2026‑08‑16)
- Domain: https://developer.domain.com.au/ · https://developer.domain.com.au/docs/latest/apis/pkg_agents_listings/ · https://developer.domain.com.au/docs/v2/support/faq/
- PropTrack: https://www.proptrack.com/property-data/property-data-apis/ (live fetch failed — ECONNRESET; re‑verify)
- Cotality: https://www.cotality.com/au/our-data · https://www.cotality.com/au/products/rp-data · https://www.cotality.com/au/corestore
- Prior Propellect research (context): `docs/decisions/V7B_listing_provider_decision.md`, `docs/decisions/V7C_provider_approval_package.md`, `docs/decisions/V7C_commercial_decision_matrix.md`.
