# Licensed national property-data feed comparison (V5A decision pack)

_Prepared for a decision by **14 Aug 2026**. Indicative budget **≈ AUD 25,000/yr**.
No vendor was contacted; no terms accepted; no trial started. Vendor list pricing is
not public (B2B sales-gated) — cells marked **[confirm]** need a formal enquiry
(draft, unsent, at the end). Current internal coverage: SA (full incl. yields) +
VIC (partial, rents only), all CC BY; NSW has no compatible official prices._

## Why licensing matters here
Every AU feed is built on the **same public raw sources** (State land-titles
offices, Valuers General, Geoscape) but is sold as **licensed, curated** data with
**restricted redistribution/derived-display rights** — the binding constraint for a
commercial product that publishes derived medians/yields/growth. So the decision is
as much about **rights + cost** as about coverage.

## Candidate feeds

| # | Feed | Coverage (geo) | Prices+vol | Rents / yield / 12-mo growth | House/unit/bed segmentation | History / refresh | Delivery | Redistribution & derived-display rights | Attribution | Setup / trial / support | Indicative annual cost vs ~$25k |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **CoreLogic / Cotality (RP Data)** | National, suburb+ | ✅ deep | ✅ rents, yields, growth | ✅ | Decades / daily | Bulk + API | **Restrictive** — RP Data sole IP owner; derived/display negotiated per-clause | Required | Weeks; enterprise onboarding; strong support | **[confirm]** — typically **>$25k** (often $50k–$150k+) |
| 2 | **Domain Group** (Domain API / Insight / Pricefinder) | National, suburb/postcode | ✅ | ✅ estimates, rents; growth via series | ✅ | Long / daily | **Developer API** (+ Pricefinder UI seats) | Commercial licence; **more startup-accessible** terms; derived-display negotiated | Required | Days–weeks; **API sandbox exists**; good docs | **[confirm]** — tiered; **most likely to fit ~$25k** for bounded API volume |
| 3 | **PropTrack (REA Group)** | National, suburb+ | ✅ (AVM + sold) | ✅ AVM/market series | ✅ | Long / daily | API / enterprise | Restrictive; enterprise licence | Required | Weeks; enterprise | **[confirm]** — enterprise, likely **≥$25k** |
| 4 | **Value NSW commercial PSI licence** | **NSW only**, property→LGA/suburb | ✅ (NSW sales) | ✗ (rents via CC-BY Rental Bond instead) | ✅ (from sales) | 1990→ / weekly | Bulk `.DAT` supply | **Direct commercial licence** (3-yr, 22 provisions) — derived use permitted under terms | Required | Legal/onboarding weeks | **[confirm]** — single-state ⇒ likely **cheapest**; may fit ~$25k |
| 5 | **Geoscape (PSMA)** | National geography | ✗ (no transactions) | ✗ | n/a | — | Bulk/API | Geography licence; **G-NAF now free (CC BY)** | Required | — | Low/free — **complement, not a price source** |
| 6 | **Aggregator resellers** (Proptech Data, PropAPIs, etc.) | Varies | ✅ (resold) | Varies | Varies | Varies | API | **Inherit upstream restrictions**; lower assurance | Required | Fast | **[confirm]** — variable; lower trust |

## Ranked recommendation
1. **Domain Group (national)** — best fit for a ~$25k budget with a usable **API +
   sandbox** and comparatively startup-friendly commercial terms; fills NSW *and*
   uplifts national prices/rents in one contract. **Pursue first** (enquiry drafted).
2. **Value NSW commercial PSI licence (NSW-only tactical)** — if a national feed
   exceeds budget or its derived-display rights are inadequate, a single-state NSW
   PSI licence directly fills the exact NSW **price** gap while SA/VIC + NSW **rents**
   stay on CC BY. Likely the cheapest paid option.
3. **CoreLogic/Cotality or PropTrack** — gold-standard depth, but likely **>$25k**
   and restrictive rights; only pursue if budget flexes or (1)/(2) fail on rights.
4. **CC-BY-only interim (no spend)** — ship **NSW rents** (CC BY Rental Bond) into
   the existing rent lane now, and add signed growth (this release); **defer** NSW/
   national **prices** until a licence decision. Zero cost, immediate coverage gain.

## The exact decision Abdul must make by 14 Aug 2026
Pick **one** path and authorise the matching (currently unsent) enquiry:
- **(A) National feed** → authorise the **Domain** pricing+rights enquiry. Proceed
  only if annual cost ≤ ~$25k **and** derived-display/redistribution rights cover
  publishing aggregate suburb medians/yields/growth. Fallback to (B) if not.
- **(B) NSW-only** → authorise the **Value NSW commercial PSI** enquiry (cost + the
  22-provision terms), keeping everything else on CC BY.
- **(C) No spend now** → approve adding NSW **rents** (CC BY) + this signed-growth
  release; revisit prices next quarter.

Recommended default: **start (A) Domain enquiry, with (B) NSW PSI as the costed
fallback, and (C) as the immediate zero-cost coverage step** (NSW rents) regardless.

## Draft enquiries (UNSENT — do not send without approval)
**Domain (data licensing / partnerships):**
> Subject: Commercial data-licensing enquiry — suburb-level market aggregates
> We operate a NSW/SA/VIC property-research product presenting **aggregate,
> attributed suburb/postcode market metrics** (median sale price, sales volume,
> median rent, gross yield, 12-month price growth) sourced from official open data.
> We'd like to license a **national feed/API** to extend coverage. Please advise:
> (1) suburb+postcode coverage and history/refresh; (2) fields incl. house/unit and
> bedroom segmentation; (3) **redistribution/derived-display rights** for publishing
> derived aggregate metrics with attribution; (4) bulk vs API delivery + volume
> tiers; (5) indicative **annual pricing** for a small commercial user (~$25k p.a.
> target); (6) sandbox/trial and onboarding time. This is an information request
> only — not an order.

**Value NSW (Property Sales Information licensing):**
> Subject: Commercial PSI licence — cost and terms
> Please advise the **annual cost and key terms** (the 22-provision, 3-year supply
> arrangement) for a **commercial** licence to the NSW bulk Property Sales
> Information, specifically whether it permits **deriving and publishing aggregate
> suburb-level medians/yields/growth with attribution**, delivery format/cadence,
> and onboarding time. Information request only.

Sources: NSW Valuer General bulk PSI; Cotality/CoreLogic sourcing notes; PropTrack
(REA) ACCC data-sourcing statement; Domain developer platform; Geoscape G-NAF open
licence.
