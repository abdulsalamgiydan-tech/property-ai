# National Jurisdiction Source Manifest (Sprint 11, Workstream 2)

Generated: 2026-07-21

Live-verified official source discovery for the 6 remaining Australian
states/territories (QLD, SA, WA, TAS, ACT, NT). Method: WebSearch to
locate candidate official pages, then live verification via `gstack
/browse` and/or direct CKAN-API/curl calls — no source accepted on a
search snippet alone.

## Summary

| jurisdiction | sales | rent |
|---|---|---|
| QLD | paid_official (Valuer-General, per-property fee) | **selected_free_automatable** (RTA quarterly, verified) |
| SA | paid_or_restricted (Land Services SA / Property Edge) | **selected_free_automatable** (SA Housing Trust Private Rent Report, verified) |
| WA | paid_official (Landgate, per-report fee) | **selected_free_automatable_with_caveat** (raw bond lodgements, needs own aggregation) |
| TAS | paid_or_restricted (Valuer-General via LIST) | blocked_access (no source found this pass — flagged for follow-up) |
| ACT | blocked_access (0 results on official portal) | blocked_access (0 results on official portal) |
| NT | blocked_access (no sales dataset in the property data group) | blocked_access (same) |

## Cross-jurisdiction finding

**Bulk, free, automatable residential SALES data beyond NSW (transaction-
level) and VIC (aggregate) does not exist in any of the 6 jurisdictions
checked.** Every one sells sales data as a paid per-property or
per-report product, or publishes no public sales dataset at all. This is
the coverage gap this sprint documents (per Mission Outcome 4), not
something to work around by scraping or purchasing without approval.

**Rental data fares much better**: QLD, SA, and WA all have genuine free
official sources — a real, substantial win for national rent coverage,
leaving TAS/ACT/NT as the true rent gaps.

**Workstream 6 update (2026-07-22)**: QLD, SA, and WA rent adapters are
now built and validated (see `qld_rents_local_store_report.md`,
`sa_rents_local_store_report.md`, `wa_rents_local_store_report.md`).
Tasmania's rent status was upgraded from "no source found" to a
definitive live-verified finding: both identified candidates are behind
Cloudflare bot protection and are therefore blocked, not merely
unresearched — see `tasmania_source_manifest.md`.

## Per-jurisdiction detail

### Queensland

- **Sales**: Valuer-General sells sales history per-property ("loading
  fee... per property sale") via business centres and QVAS broker access.
  No free bulk suburb-median aggregate exists (unlike VIC's VPSR).
- **Rent**: RTA (Residential Tenancies Authority) Quarterly Data —
  median rent + bond counts by suburb (6,245 rows), postcode (2,560),
  LGA (395), and state grain, quarterly since 2012. **Verified live**:
  downloaded the 6.1MB file, confirmed genuine, structurally inspected —
  current through Jun 2026, at a **stable URL** (no per-quarter URL
  guessing needed, an improvement over VIC's per-release URL pattern).

### South Australia

- **Sales**: Land Services SA (exclusive statutory provider since 2017)
  sells data via SAILIS and "Property Edge" — a commercial research
  platform requiring purchase/account access. No free bulk aggregate on
  data.sa.gov.au.
- **Rent**: SA Housing Trust's "Private Rent Report" on data.sa.gov.au
  (CKAN portal). **Verified live**: 72 quarterly files back to 2008,
  current to Mar 2026, CC BY licence, no bot protection (plain `curl`
  succeeded against the CKAN API and the file download). Suburb (687
  rows) / postcode (283) / region (32) / SLA (263, a pre-2011 ASGS
  geography needing its own correspondence work) grain. Documented
  small-cell suppression ("*" for 1-5 dwellings) and rounding-to-5
  convention — matches this project's established "never invent, never
  zero-fill" pattern.

### Western Australia

- **Sales**: Landgate's "Property sales reports" (property/street/
  suburb/LGA grain) are all explicitly **"Order now"** fee-based products.
  The open-data-portal "Sales Evidence data" entry hosts only a data
  dictionary, not the bulk data — and what access does exist is under a
  **"Personal Use License"**, not clearly compatible with a research
  platform's intended use (flagged, not assumed permissible).
- **Rent**: WA Rental Bonds Data (Dept. of Mines, Industry Regulation and
  Safety), mirrored on the National Housing Data Exchange, CC BY 4.0,
  monthly CSVs. **Caveat**: unlike QLD/SA/VIC, this is raw bond-lodgement
  data, not pre-computed medians — an adapter would need to compute its
  own suburb/postcode medians from individual records, the same
  methodology NSW originally considered and rejected (Sprint 6) in favour
  of a pre-aggregated report — here it's the only free option.

### Tasmania

- **Sales**: Office of the Valuer-General publishes "Property Sales
  Reports" via LIST (Land Information System Tasmania) — fees are payable
  per the Service Tasmania land-value lookup page. No free bulk aggregate
  confirmed.
- **Rent**: No official bulk rental dataset found via WebSearch or the
  LIST/Service Tasmania pages checked this pass.
- **Verification depth note**: search-only for this jurisdiction — the
  LIST property-sales-report example PDF and Consumer, Building and
  Occupational Services Tasmania's own site were not directly checked.
  Flagged for follow-up, not presented as a final determination.

### Australian Capital Territory

- **Sales**: data.act.gov.au returned **0 results** for "property sales"
  — live-verified directly. ACTLIS (ACT Land Information System) is a
  title-search service, not a bulk sales dataset.
- **Rent**: data.act.gov.au returned **0 results** for "rent" and
  "rental bond" — live-verified. The ACT Revenue Office administers
  rental bonds but does not appear to publish aggregate statistics on the
  open data portal.

### Northern Territory

- **Sales & Rent**: NT's open data portal's "Housing, property and land"
  group (12 datasets, all reviewed by name, live-verified) contains only
  infrastructure planning and public-housing-waitlist data — no sales or
  rent dataset. NT market statistics are commonly sourced from REINT
  (Real Estate Institute of the Northern Territory), an industry
  association — excluded per this project's official-sources-only rule
  (same reasoning as VIC's REIV rejection, Sprint 10).

## National context (already available, zero new work)

ASGS geography, Census demographics/dwelling-stock/tenure, ABS Building
Approvals, and RBA rates were loaded as **national** datasets in Sprints
2-4 and 8 — every jurisdiction, including all 6 checked here, already has
this context.

## Individual jurisdiction reports

See `warehouse/reports/{queensland,south_australia,western_australia,
tasmania,act,northern_territory}_source_manifest.{md,json}` for the
full structured detail per the sprint's required per-jurisdiction format.
