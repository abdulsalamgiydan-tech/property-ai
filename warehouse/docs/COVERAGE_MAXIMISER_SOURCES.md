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
- **Measured recoverable uplift (dry-run, from data already loaded):**
  `gross_yield` +126 suburbs (453 → 579; 3.0% → 3.8%). Multi-year growth is **0**
  recoverable from the snapshot because `median_sale_price_prev_12m` is 0%
  populated — recovery requires reprocessing sales history (timeseries), a
  warehouse-refresh task, not a snapshot calc. No uplift is promised beyond what
  the dry-run measured.

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
