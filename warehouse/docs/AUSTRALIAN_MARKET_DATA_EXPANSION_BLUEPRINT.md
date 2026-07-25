# Australian Market Data Expansion Blueprint (Sprint 9, Phase 12)

**No data ingested this sprint.** This is a planning document only, based on
each jurisdiction's well-known official land-titles/valuer-general authority
and tenancy-bond regulator. Every URL/product name below should be
re-verified via a live source-discovery script (the same pattern used for
NSW in Sprints 5/6/9) at the start of whichever sprint actually ingests that
state — this document establishes the target and rough shape, not a
verified manifest.

## Method reused from NSW (Sprints 5, 6, 9)

Every prior NSW ingestion followed the same shape: (1) a bulk sales feed from
the state's land-titles/valuer-general authority, (2) a rental statistics
feed derived from residential tenancy bond lodgements, (3) local-first
DuckDB/Parquet storage with only curated summaries promoted to the branch,
(4) deterministic, evidence-based dwelling-type classification, (5)
confidence-labelled medians with sample-size thresholds. The same shape
should be reused for every additional state below — no commercial property
portal data (CoreLogic, Domain, REA) in any jurisdiction.

## Victoria (VIC)

- **Official sales source**: Valuer-General Victoria / Land Use Victoria —
  "Property Sales Statistics" (published via DataVic, `data.vic.gov.au`),
  quarterly CSV bulk extracts by LGA/postcode.
- **Official rental source**: Residential Tenancies Bond Authority (RTBA)
  data, published as the Victorian Government's quarterly "Rental Report"
  (median rents by suburb/postcode, via the Department of Families, Fairness
  and Housing / Homes Victoria).
- **Publisher**: Victorian Government (DataVic + DFFH/Homes Victoria).
- **Licence**: Creative Commons (DataVic default CC BY 4.0 unless stated
  otherwise on the individual dataset page — verify per-dataset).
- **Access method**: bulk CSV/XLSX download, no known bot-protection
  (unlike NSW VG PSI's Cloudflare gate) — likely a simpler pipeline than NSW.
- **Geography**: LGA/suburb/postcode; VIC uses its own SA1-2021-based
  correspondence, directly compatible with this warehouse's existing ASGS
  Edition 3 backbone (no new geography work needed beyond adding VIC
  SAL/POA/LGA rows already present in `core.dim_geography` — ASGS is
  national, VIC rows should already be loaded from Sprint 2, unverified).
- **Dwelling-type detail**: sales data typically distinguishes house/unit at
  a coarser level than NSW PSI's `nature_of_property`/`strata_lot`/
  `zone_code` fields — dwelling-type classification rules will need
  jurisdiction-specific rework, not a direct reuse of the NSW rule set.
- **Historical coverage**: VIC sales statistics commonly published back to
  the early 2000s.
- **Automation difficulty**: Low-Medium (no known Cloudflare gate; standard
  CSV bulk downloads).
- **Expected local storage**: comparable to NSW (~1.5-2 GB raw + local
  DuckDB, VIC has a similar dwelling count to NSW).
- **Expected Supabase mart size**: comparable to NSW's curated marts
  (~100-150 MB after annual+trailing-12m curation).
- **Known access restrictions**: none known; standard open-data terms.
- **Recommended ingestion order position**: **1st** (largest non-NSW state,
  most mature open-data program, lowest known access friction).

## Queensland (QLD)

- **Official sales source**: Queensland Government property sales data via
  the Department of Resources / Titles Registry (`data.qld.gov.au`), or
  Queensland Treasury's residential property sales statistics.
- **Official rental source**: Residential Tenancies Authority (RTA)
  Queensland — quarterly median rent by suburb/postcode from bond
  lodgements, a well-established free public dataset
  (`rta.qld.gov.au`/`data.qld.gov.au`).
- **Publisher**: Queensland Government (Department of Resources + RTA).
- **Licence**: CC BY 4.0 (Queensland Government Information Licensing
  Framework default) — verify per-dataset.
- **Access method**: bulk file download via the Queensland open-data portal.
- **Geography**: LGA/suburb/postcode, ASGS-compatible.
- **Dwelling-type detail**: title/land-use codes differ from NSW's PSI
  fields — new classification rules required.
- **Historical coverage**: RTA rental data typically available for many
  years of quarterly history; sales coverage varies by product.
- **Automation difficulty**: Low-Medium.
- **Expected local storage**: large (QLD has substantial transaction
  volume, especially SE Queensland) — comparable order of magnitude to NSW.
- **Expected Supabase mart size**: comparable to NSW's curated marts.
- **Known access restrictions**: some QLD title/valuation products are
  commercial (paid) — the free RTA rental data and open-data sales extracts
  should be prioritised over any paid product.
- **Recommended ingestion order position**: **2nd**.

## South Australia (SA)

- **Official sales source**: Land Services SA / South Australian Government
  property sales data (`data.sa.gov.au`), or the SA Valuer-General.
- **Official rental source**: Consumer and Business Services (CBS) SA
  publishes quarterly median rent data from bond lodgements
  (`cbs.sa.gov.au`).
- **Publisher**: SA Government (Land Services SA + CBS).
- **Licence**: CC BY (South Australian Government default, verify
  per-dataset).
- **Access method**: bulk file download, exact product name to be confirmed
  at ingestion time.
- **Geography**: LGA/suburb/postcode.
- **Historical coverage**: to be confirmed at ingestion time.
- **Automation difficulty**: Medium (SA's open-data sales product is less
  well-documented publicly than VIC/QLD/NSW — needs a dedicated discovery
  pass before committing to a pipeline design).
- **Expected local storage**: smaller than NSW/VIC/QLD (SA has a
  significantly smaller dwelling stock and transaction volume).
- **Expected Supabase mart size**: smaller, proportionate to SA's size.
- **Known access restrictions**: unconfirmed — flag for the discovery phase.
- **Recommended ingestion order position**: 5th.

## Western Australia (WA)

- **Official sales source**: Landgate (WA's land information authority) —
  WA's primary sales-data product is historically more commercialised
  (Landgate sells detailed sales data products) than NSW/VIC/QLD's fully
  open feeds; a free/open subset (if any) needs confirmation at ingestion
  time.
- **Official rental source**: WA rental bond data via the Department of
  Energy, Mines, Industry Regulation and Safety (Consumer Protection
  division administers the Bond Administrator) — median rent statistics may
  be published via WA Government open data or via the Housing Authority.
- **Publisher**: WA Government (Landgate + Consumer Protection/Housing
  Authority).
- **Licence**: to be confirmed — WA's approach is less uniformly open than
  the eastern states.
- **Access method**: unconfirmed — may require a paid Landgate product for
  full sales coverage, with only summary statistics free.
- **Geography**: LGA/suburb/postcode.
- **Automation difficulty**: **Medium-High** — the most likely jurisdiction
  in this list to require either a paid data product or a narrower free
  summary-statistics-only scope rather than transaction-level bulk data.
- **Expected local storage**: unconfirmed pending the access-method
  discovery; likely narrower in scope than the eastern states if only
  summary statistics are free.
- **Expected Supabase mart size**: unconfirmed.
- **Known access restrictions**: **flagged** — WA is the jurisdiction most
  likely to hit a hard stop ("official source cannot be verified" /
  paid-only access) during discovery. Budget extra discovery time before
  committing to a WA ingestion sprint.
- **Recommended ingestion order position**: 6th (deprioritised behind
  jurisdictions with clearer free access).

## Tasmania (TAS)

- **Official sales source**: Land Tasmania / "The LIST" (`thelist.tas.gov.au`)
  publishes property sales/valuation data.
- **Official rental source**: Tasmania's Consumer, Building and Occupational
  Services (CBOS) administers residential tenancy bonds and publishes rent
  statistics.
- **Publisher**: Tasmanian Government (Land Tasmania + CBOS).
- **Licence**: to be confirmed at ingestion time.
- **Access method**: bulk download via The LIST, exact product to confirm.
- **Geography**: LGA/suburb/postcode — Tasmania's small number of LGAs (29)
  makes this one of the simplest jurisdictions to fully cover.
- **Historical coverage**: to be confirmed.
- **Automation difficulty**: Low-Medium (small state, likely simpler
  pipeline once the exact product is confirmed).
- **Expected local storage**: small (Tasmania's dwelling stock and
  transaction volume are a fraction of NSW's).
- **Expected Supabase mart size**: small.
- **Known access restrictions**: none known.
- **Recommended ingestion order position**: 4th (small, likely low-effort,
  good "quick win" after the two largest eastern states).

## Australian Capital Territory (ACT)

- **Official sales source**: ACT Government (Access Canberra / ACT Revenue
  Office) publishes weekly/periodic land sales data; ACT Planning also
  publishes property information.
- **Official rental source**: ACT rental bond data, published via Access
  Canberra or the ACT Government's open-data portal
  (`data.act.gov.au`) — the ACT median rent report is well-known and
  regularly published.
- **Publisher**: ACT Government.
- **Licence**: CC BY (ACT Government default, verify per-dataset).
- **Access method**: bulk file download via data.act.gov.au.
- **Geography**: ACT is a single territory with district/suburb-level
  detail — much smaller geography set than any state (ACT has no LGAs in
  the normal sense; it is administered as districts/suburbs directly).
  ASGS still applies (ACT has its own SAL/POA/SA rows).
- **Historical coverage**: to be confirmed.
- **Automation difficulty**: Low (small, well-organised open-data portal).
- **Expected local storage**: very small (ACT is the smallest jurisdiction
  by population/dwelling count in this list after NT).
- **Expected Supabase mart size**: very small.
- **Known access restrictions**: none known.
- **Recommended ingestion order position**: 3rd (small, low-effort, good
  "quick win").

## Northern Territory (NT)

- **Official sales source**: NT Government Land Information System / NT
  Department of Infrastructure, Planning and Logistics publishes property
  sales/valuation data.
- **Official rental source**: NT rental bond data via NT Government Housing
  or Consumer Affairs.
- **Publisher**: NT Government.
- **Licence**: to be confirmed at ingestion time.
- **Access method**: unconfirmed — the NT's open-data program is smaller
  and less well-documented publicly than the larger states'.
- **Geography**: LGA/suburb/postcode — NT's dwelling stock and transaction
  volume are the smallest in this list.
- **Historical coverage**: to be confirmed.
- **Automation difficulty**: Medium (smaller open-data program, may need
  more manual discovery than VIC/QLD/ACT).
- **Expected local storage**: smallest of any jurisdiction in this list.
- **Expected Supabase mart size**: smallest.
- **Known access restrictions**: unconfirmed — flag for discovery.
- **Recommended ingestion order position**: 7th (smallest market, lowest
  priority, and access method needs the most discovery work relative to its
  expected value).

## Recommended overall ingestion order

1. **Victoria** — largest non-NSW market, most mature open-data program.
2. **Queensland** — large market, well-established free RTA rental data.
3. **ACT** — small, low-effort, well-organised open-data portal (quick win).
4. **Tasmania** — small, likely low-effort once the exact product is confirmed.
5. **South Australia** — medium effort, needs a dedicated discovery pass.
6. **Western Australia** — flagged for likely paid-data friction; discovery
   phase should explicitly test for a free path before committing effort.
7. **Northern Territory** — smallest market, least-documented open-data
   program; lowest priority.

## Hard constraints that carry forward to every future ingestion

- Official government sources only — no CoreLogic/Domain/REA or other
  commercial property-portal data, in any jurisdiction.
- Local-first storage; only curated, confidence-labelled summaries promoted
  to the Supabase branch.
- No recommendations, scores, AVMs, or forecasts — every future state
  follows the same research-only constraint as NSW.
- A dedicated source-discovery script (mirroring
  `warehouse/scripts/*/discover_*.mjs`) must verify every URL/product live
  before any bulk download, for every future jurisdiction — this blueprint
  is a starting point for that discovery, not a substitute for it.
