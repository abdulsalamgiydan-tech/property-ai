# OFFICIAL COVERAGE UPLIFT 1.1 — SA metropolitan house-price coverage + validation readiness

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

## Acquisition provenance (real, immutable)

| Field | Value |
|---|---|
| **Acquired at (UTC, real)** | **2026-08-23T05:21:59.978Z** (`fresh_get`; reused from an immutable content-addressed sidecar on rerun) |
| `as_of` (run parameter) | 2026-08-23 |
| Reporting period end | 2026-06-30 (prior 2025-06-30) |
| Final host | `data.sa.gov.au` (allow-listed; single conservative public GET) |
| MIME | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Bytes | 37,459 |
| SHA-256 | `9cfa8aa71d2c453c09ca1d3baecc1955144863cfb5c4caef01c12266e639ef7a` |
| ETag | `"1784275937.362-37459-1231428003"` |
| Last-Modified | Fri, 17 Jul 2026 08:12:17 GMT |
| Schema fingerprint | `6297926bf4b8f7e97eb0cc7d9cbc88830b5659d3cb535135d21280e1305d547b` |

`as_of`, reporting period, acquisition time and report `generated_at` are four
distinct fields. The acquisition timestamp is the real wall-clock UTC captured at
the GET and stored once in a gitignored sidecar; deterministic reruns reuse it
(never falsified). A checksum change vs the recorded sha fails closed (drift),
preserving both artifacts — immutable raw is never overwritten. Raw bytes live in
gitignored `warehouse/data/local/coverage_uplift/`.

## Provenance classification (corrected)

| Metric | Classification | Basis |
|---|---|---|
| `median_sale_price_detached` (AUD) | **direct** (170) | a primary published quarterly median |
| `annual_price_growth_12m` (%) | **derived** (170) | a 12-month change; the publisher's own "Median Change" value + lineage are preserved, but a change is a derived quantity, not a primary median read |

**340 accepted observations = 170 direct + 170 derived.** They are NOT all direct.

## Reconciled row accounting (every source row accounted for)

Three different grains — they never sum naively (`482 ≠ 190 + 293`):

| Concept | Count |
|---|---:|
| Source data rows scanned | 482 |
| Parser-accepted source rows | 190 |
| Parser-quarantined source rows | 292 |
| Geography-quarantined source rows | 1 |
| Mapped source rows | 189 |
| Duplicate source rows (resolve to an already-seen SAL) | 19 |
| Unique canonical geographies (SALs) | 170 |
| Emitted observations before dedup | 378 |
| Accepted canonical observations after dedup | 340 |
| Deduplicated observations | 38 |
| Conflict events | 0 |
| Quarantine events | 293 |

**Why they coexist:** (1) the 482 scanned rows split cleanly into **190 + 292**
at the source-row grain; (2) the **1** geography rejection (`RIVERLEA PARK` — parsed
fine but has no ASGS 2021 SAL) is a *subset* of the 190 accepted, leaving **189**
mapped rows — it is not a third addend on 482; (3) at the observation grain each
mapped row emits a price + a derived-growth fact, so 189 rows → **378** emitted;
**38** are identical duplicates from **19** source rows resolving to an already-seen
SAL → **340** accepted across **170** SALs. Quarantine *events* = 292 parse + 1
geography + 0 conflicts = **293**.

Tested invariants (all hold): `scanned = accepted + quarantined` (source grain);
`mapped = accepted − geo_rejected`; `unique + duplicate = mapped`;
`emitted = accepted_after_dedup + deduped + conflicts`; and the no-silent-loss
identity `scanned = parse_quarantined + geo_quarantined + unique + duplicate`
(482 = 292 + 1 + 170 + 19). No row silently disappears.

## Quarantine reason breakdown

| Stage : reason | Count |
|---|---:|
| parse : insufficient_sample (< 10 sales) | 216 |
| parse : non_positive_or_suppressed_median | 76 |
| geography : geography_unmatched (`RIVERLEA PARK`) | 1 |

## Serving & target compatibility (exact)

- **Target table:** `core.official_observation` (full lineage) → `mart.official_suburb_metric`
  (consumer projection). Migrations `056` + `057` + `058` (prepared, additive; not
  applied in this run).
- **Upsert keys:** core `observation_id` (content-addressed); mart
  `(geography_id, metric, property_type, bedroom_group, period_end)`.
- **Geography id transform:** SAL code `40085` → `SAL_40085_ASGS3_2021`.
- **Metric transforms (no conflation):**
  - `median_sale_price_detached` → target `median_house_price`, `property_type=house`,
    `bedroom_group=all`, `unit=AUD`, `status=direct`. This is the DETACHED-house
    median; it is **not** converted to `median_sale_price_12m` (overall) and does
    **not** write the main snapshot's `median_sale_price_detached` column.
  - `annual_price_growth_12m` → target `price_growth_12m`, `property_type=house`,
    `unit=%`, `status=derived`, signed and bounded `[-100, 1000]` (migration 058).
- **Serving surface:** the batch surfaces on `/research/suburb/[geographyCode]`
  through the official-metrics RPC `public.get_official_suburb_metrics_v1(geography_id)`,
  which returns the direct price **and** the derived growth (with `is_derived=true`).
  The direct-only view `public.v_official_suburb_metric_v1` exposes the direct price
  only. **The main price card / `median_sale_price_detached` field / search results /
  map are served by `get_market_snapshot_v2` (NSW-fact-derived `mart.suburb_market_snapshot`)
  and are NOT written by this path — they do not change.**
- **Remains unavailable:** `gross_yield` (no rent in this source), overall
  `median_sale_price_12m`, and everything in the main snapshot for these suburbs.
- **Schema supports the batch:** yes. No migration is created or applied in this run.

## Materiality

Target ≥ 100 unique mapped geographies. Achieved **170** unique ASGS 2021 SAL ids
with a DIRECT house median. **Materiality MET.**

## Candidate footprint vs production (no inflation)

Candidate footprint **170** of the 1,696 SA SAL universe. Overlap with published
production is **unknown** (no remote database read). **Net-new production coverage
is not claimed; production coverage is unchanged.** Publishing requires a separately
approved disposable-branch validation run (see `VALIDATION_APPROVAL_PACKET.md`).

## Reproducibility

Offline quality gates **admit = true** (0 blocking failures). Two independent
executions over the same source bytes produce identical accounting, counts,
classification and accepted natural keys (`assembleCoverage` is pure); only the
honest wall-clock `generated_at` differs.
