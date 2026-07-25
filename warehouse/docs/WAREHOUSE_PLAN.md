# Propellect Research Warehouse — Plan

## Scope

Australian **residential property only**. The warehouse exists to answer suburb- and
postcode-level questions for the Propellect app (Suburb Intelligence, suggested
assumptions in Analyse Property, strategy context). Commercial property, business data
and non-Australian markets are out of scope.

## Output geography

Published marts are keyed to two levels only:

- **Suburb** — modelled as ABS **SAL** (Suburbs and Localities)
- **Postcode** — modelled as ABS **POA** (Postal Areas)

## Internal geography model

Internally the warehouse carries the full ASGS picture: **STATE, GCCSA, SA4, SA3, SA2,
SA1, LGA, SAL, POA**.

Key rule: **suburb ≠ postcode ≠ SA2.** These are three different structures. SA1–SA4,
GCCSA and STATE form a strict containment hierarchy
(`core.bridge_geography_relationship`). SAL, POA and LGA cut across that hierarchy and
are linked to it — and to each other — through weighted correspondences
(`core.bridge_geography_correspondence`) using ABS SA1-based allocation, weighted by
dwellings first, then population, then area.

Boundary versions are explicit (`core.dim_geography_version`), because ASGS editions and
LGA amalgamations change codes over time.

## Data sourcing approach

**Free-data-first.** v1 uses only free, official/public data whose licence permits reuse:

- **No commercial data** (no CoreLogic, PropTrack, Domain, REA feeds) in v1.
- **No scraping of protected or commercial property portals**, ever.
- Every source is registered in `warehouse/metadata/source_register.csv` and
  `meta.source` with its licence and limitations before implementation.

### First future source

**ABS ASGS geography backbone** — SAL, POA, SA1–SA4, GCCSA, STATE, LGA boundaries and
the SA1 correspondence files. Everything else depends on this, so it is Sprint 2.

### Later sources (in rough order)

1. ABS Census of Population and Housing (demographics, dwellings, tenure)
2. ABS Building Approvals (supply pipeline)
3. RBA statistical tables (cash rate, lending rates)
4. ABS Lending Indicators (investor vs owner-occupier finance)
5. NSW Valuer General property sales (sale prices and volumes, NSW first)
6. NSW rental bond data (rents, NSW first)

## Warehouse layers

| Schema | Purpose |
|---|---|
| `meta` | Source register, datasets, load runs, files, quality/coverage results, publication approvals |
| `raw` | Landed source data, as-received, immutable |
| `staging` | Typed, cleaned, still source-shaped |
| `core` | Conformed dimensions and facts (geography backbone lives here) |
| `mart` | Published suburb/postcode snapshots consumed by the app |
| `audit` | Change history and lineage records |

## Quality principles

1. **Missing data stays missing.** Unknown values are NULL, never zero. A zero must
   mean a true zero. Thin data (e.g. a median from fewer than 10 sales) is suppressed
   to NULL rather than published.
2. **Confidence scoring.** Every published row carries a `data_coverage_score` and a
   `confidence_label` (high / medium / low / insufficient_data) derived from coverage,
   source quality, recency and volume thresholds. The app must be able to say "we don't
   know" honestly.
3. **Approval-gated publication.** Nothing reaches `mart` consumers without a row in
   `meta.publication_approval` with `approval_status = 'approved'` for that mart and
   reference period. Loads run automatically; publication is a human decision backed by
   the quality summary.

## Sprint roadmap

- **Sprint 0 (done):** repo cleanup, real README, `.gitignore` hardening
- **Sprint 1 (done):** folder skeleton, metadata/config starters, migration
  `003_warehouse_foundation.sql`, validation script
- **Sprint 2 (next):** ABS ASGS extraction + load into `core.dim_geography`,
  relationship and correspondence bridges
- **Sprint 3+:** Census, building approvals, RBA/ABS finance series, NSW sales and
  rental bonds; first published `mart.suburb_market_snapshot` rows
