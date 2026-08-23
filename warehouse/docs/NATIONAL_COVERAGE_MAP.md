# National property-data coverage map

Status: Phase 2A offline foundation, 23 August 2026.

This document reconciles the committed warehouse coverage report, V3 source
catalogue, refresh registry and jurisdiction manifests. It does **not** claim a
Production refresh or any new published coverage.

## Evidence policy

| Label | Meaning |
|---|---|
| `published` | Count or availability already present in a committed warehouse report. |
| `verified_local` | Sanitised fixture or local candidate parsed, mapped and quality-gated; not in Production. |
| `estimated` | Addressable ceiling used only to rank future investigation. |
| `unavailable` | No approved reusable source/row evidence for the requested grain. |

These labels are never added together into a headline coverage figure.

## Reconciled published baseline

Source: `warehouse/reports/suburb_metric_coverage.json`.

| Metric | Published geographies | Total snapshots | Coverage |
|---|---:|---:|---:|
| Median sale price (overall) | 4,821 | 15,334 | 31.4% |
| Median weekly rent | 3,089 | 15,334 | 20.1% |
| Gross yield (derived) | 453 | 15,334 | 3.0% |
| 12-month price growth (derived) | 735 | 15,334 | 4.8% |
| Geography spine | 15,334 | 15,334 | 100% |

Phase 2A changes none of these numbers.

## State/territory position

| Jurisdiction | Sales | Rent | Phase 2A disposition |
|---|---|---|---|
| National | ABS ASGS/Census geography and demographic context only | Not a market-rent source | Existing context pipeline retained for strict mapping; never counted as direct sale/rent evidence. |
| NSW | Existing VG bulk sales pipeline | Existing DCJ quarterly postcode/LGA rent pipeline | DCJ rent is now represented in V3; exact current reuse terms still require capture. No new adapter. |
| VIC | Existing warehouse lane plus fixture-tested VG candidate | Existing DFFH lane, presently thin at serving layer | Manual XLSX inbox is fail-closed; a real workbook/header is required before candidate activation. |
| QLD | No free reusable bulk suburb-median source confirmed; official access is paid | Existing RTA rent pipeline | Sales remains an evidence-backed paid-source gap; RTA package/licence reacquisition details remain to resolve. |
| SA | Official metro house-sales lane | Official Private Rent Report lane | Both have verified CC-BY catalogue metadata and are eligible for selective public-metadata acquisition. |
| WA | Official Landgate bulk sales remains paid/restricted | Existing rental-bonds pipeline | New candidate handles only weekly sales count/turnover context. It is not a median-price source and changes no price coverage. |
| TAS | Official sales reports appear fee-based/restricted | CBOS confirms monthly rental-bond XLSX publication through data.gov.au | Exact file URL, reuse licence, live schema and adapter remain unverified; discovery only, no activation. |
| ACT | No state open-data sales source found; only broader ABS context | No official rent source found | National context only; gap retained. |
| NT | Official portal property group contains no market-sales source | No official rent source found | National context only; industry-association data remains excluded. |

The machine-readable version, including official URLs, licence status,
acquisition mode, blockers and estimated investigation ceilings, is
`warehouse/reports/national_source_matrix.json`.

## Critical WA correction

The Australian Government catalogue lists **Property Sales and Trends, WA** as
CC BY and describes top weekly property sales by suburb, turnover and valuation
statistics. That description does not prove a reusable suburb-median CSV.

Accordingly, `warehouse/adapters/wa_property_sales/`:

- parses a versioned normalised weekly count/turnover contract;
- emits only `weekly_property_sales_count` and
  `weekly_property_sales_turnover`;
- strictly rejects schema drift, wrong states, invalid periods, suppressed or
  non-positive values, missing/ambiguous ASGS mappings and invalid checksums;
- never emits a median price or property valuation; and
- remains context-only/non-publishable until a real official resource header is
  acquired and matched.

This is intentional fail-closed behaviour, not a coverage uplift.

## Local-only acquisition modes

| Mode | Network | Writes | Use |
|---|---|---|---|
| `--plan` | none | none | Show registered source lanes. |
| `--dry-run` | none | none | Show cache state and intended local action. |
| `--acquire --source ID` | public HTTPS GET only | gitignored immutable local cache | Only verified-reusable, allow-listed official hosts. |
| Inbox dry-run | none | none | Inspect a human-supplied official file. |
| Inbox ingest | none | gitignored local inspection manifest | Records checksum/parser result only. |

There is no database client or publication operation in the acquisition layer.

## Commands

```bash
npm run warehouse:acquire:plan
npm run warehouse:acquire:dry-run
npm run warehouse:acquire:inbox
npm run warehouse:coverage:matrix
npm run warehouse:coverage:prioritise
npm run warehouse:coverage:simulate
```

For the only network-enabled command, select exactly one allow-listed source:

```bash
npm run warehouse:acquire:source -- --source sa_metro_median_house_sales
```

The two coverage commands produce review artifacts with `published`,
`verified_local` and `estimated` kept separate. Production counts remain
unchanged until a separately approved validation and publication process.

## Recommended next data work

1. Capture exact current reuse terms and resource identity for the existing NSW
   DCJ rent and WA rental-bond pipelines.
2. Acquire and checksum a real VIC VG workbook through the manual inbox; accept
   only if its live header matches or a reviewed parser revision is made.
3. Decide whether paid official QLD/WA/TAS sales data is commercially justified;
   do not substitute listing portals or industry estimates.
4. Capture the exact TAS data.gov.au rental-bond resource, reuse terms and live
   workbook schema before building or activating an adapter.
5. Re-check ACT/NT official portals periodically, retaining national ABS context
   while direct market sources remain unavailable.

## Official Coverage Uplift 1 — SA metropolitan house price (proven end-to-end)

A genuine official source has now been run end-to-end through the offline
pipeline. Evidence: `warehouse/reports/sa_metro_house_coverage_uplift.{json,md}`;
runner: `warehouse/scripts/coverage/sa_metro_house_price_uplift.mjs`; adapter:
`warehouse/adapters/sa_metro_house_sales/{parse,normalize}.mjs`.

- **Source:** SA Metropolitan Median House Sales, Q2 2026 (Government of South
  Australia, Valuer-General / Office of Land Value), CC BY 4.0, verified reusable.
  SHA-256 `9cfa8aa7…`, retrieved 2026-08-23, period 2026-06-30.
- **Pipeline:** discover → single conservative public GET (host allow-list
  `data.sa.gov.au`) → strict parse (fail-closed) → strict ASGS 2021 SAL mapping
  against the committed `warehouse/metadata/sa_all_sals.json` spine → dedupe/
  conflict reconciliation → offline quality gates (admit) → coverage simulation.
- **Result:** **170 unique ASGS 2021 SAL ids** carry a DIRECT
  `median_sale_price_detached`, plus 170 DIRECT publisher-reported
  `annual_price_growth_12m` (the source's own "Median Change" column). 293 rows
  quarantined with reasons (216 insufficient sample, 76 suppressed/non-positive,
  1 zero-match `RIVERLEA PARK`), 0 ambiguous, 0 natural-key conflicts, 38
  identical duplicates deduped. **Materiality target (≥100) met.**
- **Evidence label:** `verified_local`. This is a **candidate footprint**
  (170 of 1,696 SA SALs); overlap with published production is unknown because no
  remote database was read, so **net-new production coverage is not claimed** and
  the published baseline above is unchanged. Idempotent (byte-identical rerun).

## Guardrails retained

No remote database read/write, migration, Supabase branch, Vercel/environment
change, deployment, authentication flow, founding-beta change, commercial-portal
scrape, WAF bypass, PR merge or Phase 2 push is part of this work.
