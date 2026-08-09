# DRAFT — NOT SENT · Commercial enquiry to PropTrack (REA)

**To:** PropTrack API / data solutions team (proptrack.com → speak to a specialist)
**From:** Abdul Giydan, Propellect (app.propellect.com.au)
**Subject:** Listings + Properties/valuations API — investor buy-box feed & confidence enrichment (SA first)

Hi PropTrack team,

Propellect is an evidence-first property-investment product (live SA beta). We're selecting a listing
provider (and, separately, a valuations/enrichment source) for a new investor "Deal Hunter" feature and
would like to confirm terms for our exact use case before building against you in production.

**Use case**
- **Listings:** match on-market SA sale listings to an authenticated investor's saved buy box, display
  the listing with attribution/link-back, and layer our own deterministic deal score, conservative
  cash-flow scenario and one-page Deal Brief on top.
- **Enrichment (separate, internal):** use your **sale/rent valuations (AVM)** and **historic
  sale/rent series** to *raise the confidence* of our scoring — used internally to drive a score, **not
  displayed verbatim or redistributed**.

**Questions we need in writing**
- Display, attribution and link-back requirements for listings in a consumer web product.
- Whether Propellect's **derived** deal scores/estimates (distinct from your AVM) are permitted, and
  whether our derived analysis may sit behind a subscription while listings remain appropriately shown.
- **Retention/caching** rules for a per-user feed and Deal Brief snapshots.
- Confirmation that a licensed AVM/rental estimate may **drive an internal confidence score without
  being displayed**.
- Coverage/cost for **SA now, national later**, plan/volume tiers, sandbox → production path, and rate
  limits.
- Listing lifecycle signals available (new / price-changed / under-offer / withdrawn / sold).

We will not scrape realestate.com.au or any portal, and we treat a trial as non-production. Glad to
share our provenance model and data-flow diagram.

Thanks,
Abdul Giydan — Propellect
