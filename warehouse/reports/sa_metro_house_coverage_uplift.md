# OFFICIAL COVERAGE UPLIFT 1 — SA metropolitan house-price coverage evidence

Generated offline (`warehouse/scripts/coverage/sa_metro_house_price_uplift.mjs`).
Machine-readable twin: `warehouse/reports/sa_metro_house_coverage_uplift.json`.
**Production coverage is unchanged. No database was read or written.**

## Source (genuine, official, reusable)

| Field | Value |
|---|---|
| Source id | `sa_metro_median_house_sales` |
| Dataset | Metropolitan Median House Sales — Q2 2026 |
| Publisher | Government of South Australia (Valuer-General / Office of Land Value) |
| Landing page | https://data.sa.gov.au/data/dataset/metro-median-house-sales |
| Resource (XLSX) | `…/resource/8428aa95-…/download/lsg_stats_2026_2q.xlsx` |
| Licence | Creative Commons Attribution 4.0 (`cc-by`) — commercial reuse + derivatives permitted |
| Attribution | © Government of South Australia (CC BY 4.0) |

## Acquisition provenance

| Field | Value |
|---|---|
| Retrieved (UTC) | 2026-08-23T00:00:00Z |
| Final host | `data.sa.gov.au` (allow-listed; single conservative public GET) |
| MIME | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Bytes | 37,459 |
| SHA-256 | `9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a` |
| ETag | `"1784275937.362-37459-1231428003"` |
| Last-Modified | Fri, 17 Jul 2026 08:12:17 GMT |
| Schema fingerprint | `6297926bf4b8f7e97eb0cc7d9cbc88830b5659d3cb535135d21280e1305d547b` |
| Header | `City, Suburb, Sales 2Q 2025, Median 2Q 2025, Sales 2Q 2026, Median 2Q 2026, Median Change` |

Raw bytes are content-addressed into gitignored `warehouse/data/local/coverage_uplift/` — never committed.

## Data periods & geography

- Reporting period: **2026-06-30** (prior comparison 2025-06-30).
- Geography level: **SAL** (ASGS 2021 Suburbs and Localities), state SA (`4`).
- Trusted baseline-ID set: `warehouse/metadata/sa_all_sals.json` (1,696 SA SALs).

## Counts (from the full genuine resource)

| Measure | Value |
|---|---:|
| Source data rows scanned | 482 |
| Parsed records (median > 0 AND sales ≥ 10) | 190 |
| Accepted canonical observations | 340 |
| — `median_sale_price_detached` (AUD, DIRECT) | 170 |
| — `annual_price_growth_12m` (%, DIRECT publisher figure) | 170 |
| **Unique mapped ASGS 2021 SAL ids** | **170** |
| Unique source suburb labels accepted | 170 |
| Unmatched (zero-match, quarantined) | 1 |
| Ambiguous (quarantined) | 0 |
| Identical duplicates deduped | 38 |
| Natural-key conflicts (quarantined) | 0 |
| Quarantined total | 293 |

### Quarantine reason breakdown

| Stage : reason | Count |
|---|---:|
| parse : insufficient_sample (< 10 sales) | 216 |
| parse : non_positive_or_suppressed_median | 76 |
| geography : geography_unmatched (`RIVERLEA PARK`, a post-2021 suburb absent from the ASGS 2021 spine) | 1 |

Every rejected row carries an explicit reason. No value is fabricated; suppressed
medians and blank change cells are never coerced to zero.

## Metric classification (honest)

- **Direct:** 340 (both metrics are publisher-reported for these suburbs).
- **Derived:** 0.
- **Gross yield / rent:** *unavailable* — this source carries no rent, so a yield
  would require a second source; it is honestly left unavailable, never zeroed.

## Freshness

All 340 observations are **fresh** (period 2026-06-30 within the 120-day SLA of
the 2026-08-23 acquisition).

## Materiality

- Target: ≥ 100 unique valid mapped geographies.
- Achieved: **170** unique ASGS 2021 SAL ids with a DIRECT median house price.
- **Materiality MET.**

## Candidate footprint vs production (no inflation)

- Candidate footprint: **170** of the 1,696 SA SAL universe carry a direct house
  median from this genuine source this quarter.
- Overlap with already-published production coverage: **unknown here** — no remote
  warehouse/database was read (prohibited by this milestone).
- Net-new production uplift: **not proven**, and not claimed. Production coverage
  is unchanged; the warehouse baseline (`median_house_price` = 4,756 populated)
  is untouched. Turning this candidate footprint into published coverage requires
  a separately approved database validation/publication run.

## Reproducibility

- Offline quality gates: **admit = true**, 0 blocking failures.
- Idempotency: two independent executions over the same source bytes produced a
  **byte-identical** report (same 340 natural keys, same totals). `assembleCoverage`
  is pure and deterministic given the input bytes.

## What this advances

Propellect gains a proven, offline, end-to-end pipeline that converts a genuine
official SA house-price workbook into 170 strictly-mapped, fully-provenanced,
quality-gated suburb HOUSE median-price candidate observations (plus a direct
publisher YoY change), ready for a future separately-approved validation run —
directly advancing the ability to search and refresh property **prices**.
