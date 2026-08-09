# DRAFT — NOT SENT · Commercial enquiry to Domain (Agents & Listings API)

**To:** Domain Developer / API commercial team (developer.domain.com.au → contact/commercial)
**From:** Abdul Giydan, Propellect (app.propellect.com.au)
**Subject:** Commercial API access — investor "buy box" listing feed + derived deal analysis (SA first)

Hi Domain team,

We run Propellect, an evidence-first property-investment product (live SA beta). We already surface
official open-data suburb metrics with full provenance and are evaluating a listing-data provider for
a new "Deal Hunter" feature. Before we design against your API in production, we'd like written
confirmation that our exact use case is approved.

**What we want to do**
1. Match on-market SA sale listings to an authenticated investor's saved profile (a "buy box").
2. Display each matching listing (image, price/price text, attributes, agent contact, inspection
   times) **with a "Powered by Domain" attribution and a link + UTM back to the original listing**,
   pages set to no-index, agent contact and price-estimate data **not** behind any paywall or login.
3. Feed view/image/map/video and enquiry events back to Domain via the API, as per clause 17.1.
4. Layer **our own** deterministic analysis on top — an acquisition/"deal fit" score, a conservative
   weekly cash-flow scenario, and a one-page "Deal Brief" — computed by us from the listing facts plus
   official open data and the user's own financial inputs.

**The questions we need answered in writing**
- **Subscription gating:** may **our derived analysis** (deal score, cash-flow scenario, Deal Brief)
  sit behind a paid subscription, provided the underlying listing display, agent contact and any
  Domain price-estimate data remain free and attributed as above?
- **Derived scores:** are Propellect-computed scores/estimates (clearly distinct from your Price/Rental
  AVM) permitted, given estimates from your API must be generated via the API and not cached
  independently?
- **Retention:** what is the acceptable cache TTL for a per-user buy-box feed and for a Deal Brief
  snapshot, given the guidance against storing listing data and the delete-on-termination rule?
- **Plan/volume + cost:** which plan fits an SA-first consumer product (indicative monthly call
  volume, sandbox → production path), and the SA-now / national-later cost outline?
- **Webhooks:** confirm the listing-lifecycle events available (new/updated/under-offer/withdrawn/sold).

We will not scrape any portal or bypass access controls, and we understand a developer trial is not
production authorisation. Happy to share our data-flow diagram and provenance model.

Thanks,
Abdul Giydan — Propellect
