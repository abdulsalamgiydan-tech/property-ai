# Warehouse Coverage Maximiser V1 — source evaluation & architecture

## Status of this sprint

- **No live bulk government download or ingestion was performed.** Per the
  guardrails ("record licence and commercial-display evidence before accepting
  any source", "fail closed on licensing/schema/quality uncertainty"), no source
  is marked *accepted+ingested* here. Sources are **evaluated and ranked**; each
  must have its licence/commercial-display rights recorded and a parser+fixtures
  landed before ingestion.
- Delivered this sprint: reproduced + extended coverage measurement, the
  **Coverage Maximiser** engine (dry-run), the metric-definition registry, the
  growth and yield **recovery calculation engines** (tested), a **schema-drift-safe
  parser proof** (QLD RTA rents, with fixtures), and a safe read-only CI workflow.
- **CORRECTION (V2.1): the earlier "+126 recoverable (453 → 579)" yield claim
  was wrong.** 126 is only a *naive* price+rent overlap, not qualified coverage.
  The lineage audit (`warehouse/scripts/coverage/materialise_nsw_yield.mjs`)
  requalified all 126 against the full contract → **0 promotion-ready** (all
  `lineage_unverified`: aggregate `all` type, and no upstream observation ids /
  actual sample sizes / bedroom groups exposed). See
  `warehouse/reports/coverage_v2/nsw_yield_lineage_audit.*`. Multi-year growth is
  **0** recoverable from the snapshot (`median_sale_price_prev_12m` is 0%
  populated) — needs reprocessing of sales history. **No uplift is claimed.**

## Ranking method

`priority = recoverable_missing_suburbs × expected_valid_match_rate × sample_pass_rate ÷ implementation/licensing_risk`

Ranking is indicative until each source's licence and real match rate are verified.

## Priority A — market pipelines (evaluate → licence → parser+fixtures → local validate)

| Source | Metric(s) | Geo | Cadence | Licence (VERIFY before ingest) | Commercial display | Raw available | Est. gain | Effort | Decision |
|---|---|---|---|---|---|---|---|---|---|
| NSW Valuer General Bulk PSI | House/unit median price, volume, **growth history (1990→)** | Property→SAL/POA | Weekly | NSW VG bulk PSI terms — confirm reuse/derivative | Confirm | Yes (bulk files) | High | High | **Defer (highest priority)** — enables multi-year growth |
| NSW Rental Bond Data | Median rent by dwelling/bedroom | Postcode | Monthly | NSW open data — confirm | Confirm | Yes | Med | Med | Defer — **postcode context only** |
| NSW DCJ Rent & Sales | Rent, sales medians | Suburb/LGA (mixed) | Quarterly | Confirm | Confirm | Yes (xlsx) | Med | Med | Defer — exact-geo only = direct |
| VIC Valuer-General | House/unit/land medians, counts, published 12m change | Suburb | Annual + quarterly | Confirm | Confirm | Yes | High | Med | Defer — keep annual/quarterly series separate |
| VIC DFFH Rental Report | Moving-annual rent by suburb/type | Suburb (some combined) | Quarterly | Confirm | Confirm | Yes | Med | Med | Defer — detect **combined localities** |
| QLD RTA Median Rents | Rent by house/townhouse/unit + bedrooms | Suburb/postcode/LGA | Quarterly | Confirm | Confirm | Yes (CSV) | Med | **Low** | **Parser proof landed** (`warehouse/adapters/qld_rta_rent`) — ingest deferred |
| SA Metro Median House Sales | House median (metro only) | Suburb | Quarterly | CC BY (verify attribution) | Likely (CC BY) | Yes | Low | Low | Defer — mark house-only/metro-only |
| SA Private Rent Report | Rent by type/bedroom | Suburb/postcode | Quarterly | CC BY (verify) | Likely | Yes | Med | Med | Defer — historic format variants |
| TAS Rental Bond Stats | Rent by type/bedroom | Suburb | Monthly | Confirm | Confirm | Yes | Low | Med | Defer — fix registry if it says "blocked" |
| WA Rental Bonds (AHDAP) | Rent, bond counts | Suburb/postcode | Monthly | AHDAP dataset licence — confirm | Confirm | Yes | Med | Med | Defer |
| QLD/WA/other bulk **sales** | Sale prices | — | — | **Paid** (Landgate, QLD titles) | — | No (paid) | — | — | **Reject (paid)** — record ceiling honestly |

## Priority B — national contextual (ABS/ATO, official, mostly reusable)

ABS 2021 SAL Census DataPacks, ABS Regional Population, ABS Building Approvals,
ATO postcode tax stats, ABS SEIFA, ASGS boundaries/correspondences. Candidate
metrics: population/growth, age, household size, income, dwelling stock, tenure,
housing cost, SEIFA, SA2 growth context. **Rules:** Census unoccupied dwellings
is **not** current rental vacancy; an SA2 value shown to a suburb is **`SA2
context`**, never projected down. Decision: **Defer** (ABS SAL DataPacks are the
best next contextual expansion; population already 100%).

## Priority C — discovery (official portals only)

Vacancy, days-on-market, listing volume, supply pipeline, crime, schools,
transport, health, hazard exposure. **Finding:** no **free, official, reusable**
current-vacancy or days-on-market source with suburb coverage was identified;
both are recorded as `no_reusable_source` and kept at honest **0% direct**
(never estimated from bonds, dwelling stock, or Census). Hazard/crime/amenity
layers exist on state open-data portals and are **deferred** pending licence +
geography-join evaluation.

## Remaining free-data ceiling / paid gaps (no purchase recommended yet)

- **Current rental vacancy** and **days on market**: no free official source →
  remain 0% direct.
- **QLD/WA/SA/TAS bulk sale prices**: largely **paid** (Landgate, titles
  offices) → house-price coverage outside NSW/VIC is capped by free rent-only +
  limited free medians.
- **Multi-year growth**: recoverable from NSW VG history (free) once ingested;
  other states gated by the paid-sales ceiling.

---

## V2 real-ingestion attempt log (this sprint)

**Environment egress is partial.** From this sandbox: `data.gov.au` and
`www.abs.gov.au` are unreachable (HTTP 000); `rta.qld.gov.au` and generic hosts
are reachable (HTTP 200); the Propellect warehouse REST is reachable. Official
bulk portals (ABS DataPacks/Regional Population/Approvals, data.gov.au, and the
data.sa.gov.au CKAN API) could **not** be downloaded here.

**Disposition of attempted external sources:**
- **QLD RTA median rents** → `deferred_licence_unclear`: the median-rents page
  exposes no downloadable median-rents file with a stated licence (only an
  interactive quick-finder and an old `rta-bond-statistics.xlsx`); no CC BY /
  reuse statement was verifiable on the page. Not materialised (guardrail:
  ambiguous terms → defer, do not expose).
- **SA metro house sales / private rent (data.sa.gov.au, CC BY)** →
  `source_unavailable` here: CKAN endpoint unreachable (HTTP 000). Highest-value
  *reachable-elsewhere* CC BY candidate; ingest in an environment with egress.
- **ABS Census/Regional Population/Approvals (data portals)** →
  `source_unavailable` here (HTTP 000).

**Real coverage materialised this sprint** used **existing valid Propellect
observations only** (no external download, no third-party licence question): the
NSW suburb gross-yield recovery (Phase 3A) — 126 candidates → 6 quality-gated
yields, through a real ephemeral DuckDB raw→staging→core→mart pipeline with
SQL-generated evidence and a deterministic rerun. See
`warehouse/reports/coverage_v2/` and the promotion package.

The parsers, registry, geography-resolution rules, disposition engine and
Coverage Maximiser are ready to ingest the deferred external sources once run in
an environment with open-data egress and verified licences.
