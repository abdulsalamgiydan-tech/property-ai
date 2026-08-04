# NSW official-source resolution — 48-hour investigation (V5A)

_Investigation window opened 2026-08-03. Read-only; no 403 bypass, no scraping, no
use of the local `provenance_unverified` collection. All Government portals block
automated fetch (HTTP 403 via Cloudflare/WAF); findings below are from publisher
documentation and the open-data catalogues. The 403 is recorded as access
evidence, not circumvented._

## Verdict
**LICENSED-REPLACEMENT-REQUIRED** for NSW **sales / prices / yields** (the free
bulk data exists but its licence forbids commercial + derived use); NSW **rents**
are separately **ACCESSIBLE** under CC BY. So NSW cannot join the SA/VIC lane on
prices/yields without either a paid NSW commercial PSI licence or a licensed
national feed; rents can be added lawfully now (postcode-level).

## Route-by-route evidence

### 1. Sales / prices — NSW Valuer General Bulk Property Sales Information (PSI)
- **URL:** https://www.valuergeneral.nsw.gov.au/design/bulk_psi_content/bulk_psi
  (portal: https://valuation.property.nsw.gov.au/embed/propertySalesInformation)
- **Coverage / geography:** all NSW, per **Local Government Area**; property-level
  sales (address, price, date, area, zoning). 1990→present.
- **Periods / cadence:** weekly per-LGA files (2001→current); yearly historic
  (1990–2001). Format `.DAT`.
- **Licence (verbatim):** **Creative Commons BY‑NC‑ND 4.0** (Attribution,
  **Non‑Commercial, No‑Derivatives**) under the NSW Open Data Policy.
- **Blocker:** the licence is **incompatible with Propellect** — NC forbids
  commercial use; ND forbids the derived medians/yields/growth we publish.
  Additionally, automated download returns **HTTP 403** (bot protection), so even
  the non-commercial file is not scriptable.
- **Lawful commercial route:** Value NSW issues a **commercial PSI licence** — a
  **3‑year supply arrangement with 22 provisions** (a formal, paid data-supply
  agreement). ⇒ *licensed-replacement-required*. (Cost/terms not published — see
  draft enquiry in the licensed-feed pack; do not contact without approval.)

### 2. Rents — NSW Fair Trading Rental Bond data
- **URL:** https://data.nsw.gov.au/data/dataset/rental-bond-lodgement ·
  https://www.data.gov.au/data/dataset/nsw-rental-bond-holdings
- **Coverage / geography:** **postcode (POA)**; fields include **weekly rent,
  dwelling type, number of bedrooms**, bonds held, days held.
- **Periods / cadence:** monthly lodgements + quarterly + annual.
- **Licence:** **Creative Commons Attribution (CC BY 3.0/4.0)** — commercial- and
  derivative-compatible (same family as the SA/VIC CC BY lanes).
- **Status:** **ACCESSIBLE** and lawful for our use. Caveat: postcode-level (as
  with SA/VIC rents, it needs POA→SAL correspondence to reach suburb level), and it
  is rent-only (no sale prices ⇒ no NSW yield without a price source).
- Automated fetch also 403 (portal bot-block); download via the data.nsw/data.gov.au
  UI or the CKAN datastore is the supported route.

### 3. Other lawful routes checked (no better sales option)
- **DCS Spatial Services / NSW Land Registry Services:** property/title + valuation
  services are **fee-for-service / licensed** (no free CC BY bulk residential sales).
- **data.nsw.gov.au sales datasets:** only the VG PSI (BY‑NC‑ND) reappears; no CC BY
  residential-sales bulk file exists.

## Classification (per the required scheme)
| Lane | Class | Why |
|---|---|---|
| NSW sales / prices / yields | **licensed-replacement-required** | free bulk PSI is CC BY‑NC‑ND (non-commercial, no-derivatives); commercial PSI licence (3-yr, paid) required |
| NSW rents | **accessible** | Rental Bond data, CC BY, postcode/dwelling/bedroom, monthly+ |

## Recommendation for NSW
Do **not** ingest the free VG PSI (licence forbids our use). Two lawful paths to NSW
prices/yields: (a) a **Value NSW commercial PSI licence**, or (b) a **licensed
national feed** (see the feed comparison — likely more cost-effective and national
in one contract). NSW **rents** (CC BY) can be added to the existing rent lane now
under separate approval, independent of the price decision.

Sources: NSW Valuer General bulk PSI page; NSW Valuation portal; data.nsw &
data.gov.au Rental Bond datasets; NSW Fair Trading rental bond data page.
