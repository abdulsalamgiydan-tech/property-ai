# National Coverage Audit (Sprint 12, Workstream 1)

Generated 2026-07-22T06:06:22.310Z by `warehouse/scripts/audit/build_national_coverage_registry.mjs`.
Quantitative fields (row counts, reference periods, coverage fractions) are
live-queried against `warehouse-validation` at generation time — not
hand-narrated. Qualitative access-status findings (paid/restricted/blocked)
are carried from Sprint 11 Workstream 2's live-verified source discovery
(`national_jurisdiction_source_manifest.json`), cross-referenced here
rather than re-typed by hand. Re-run the script any time to regenerate
both the registry (`warehouse/metadata/national_coverage_registry.yml`)
and this report from current live state.

## Findings this audit surfaced (not previously documented, or documented but stale)

- **stale_population_growth_docs** (documentation): warehouse/config/jurisdiction_coverage.yml and warehouse/docs/JURISDICTION_COVERAGE_CONTRACT.md both describe population_growth as 'partially_available pending Workstream 4' for every jurisdiction. WS4 completed later in Sprint 11 (see CROSS_CENSUS_HARMONISATION_METHOD.md); this audit's live query confirms population_growth_2016_2021_pct is genuinely populated (majority of rows nationally). Needs correcting.
- **confidence_conflates_direct_and_derived** (data_quality): population_growth_2016_2021_pct rows are labelled geography_method='direct', confidence_label='official' in mart.suburb_demographic_profile_2021 — identical to the directly-published 2021 population figures in the SAME row, even though growth is a derived, correspondence-weighted value. Contradicts this project's principle that derived values must be clearly distinguished from directly published ones. Candidate for Sprint 12 WS4/WS8 (likely needs a per-column, not per-row, lineage/confidence model).
- **future_reference_period_nsw_sales** (data_quality): 2 rows in core.fact_residential_sales_summary (SAL_12348 / POA_2070, both Lindfield NSW, dataset_id=nsw_psi_2001_current_full_state) carry reference_period=2032-01-01 — a date ~5.5 years in the future, impossible for a settled sale. Both already carry sample_size_confidence='insufficient' (transaction_count=1) so they don't surface as a trustworthy statistic, but the underlying parsing defect is real and current. A small number of pre-1990 dates (as early as 1903) also exist in the same table — plausibly genuine historical transactions in the VG archive, not flagged as errors. Candidate data-quality rule for Sprint 12 WS9: reject/quarantine any reference_period outside [earliest plausible source year, current date].
- **poa_geography_has_no_state_code** (architecture): core.dim_geography.state_code is NULL for all 2,641 current POA rows (ASGS postal areas are not assigned a single definitive state at the boundary-file level). A naive join from any fact table to dim_geography.state_code therefore silently drops every postcode-grain fact from a per-jurisdiction count/filter — this audit's own first draft had exactly this bug (fixed here using the official Australia Post postcode-to-state range table, applied only within this audit script). Separately, mart.postcode_market_snapshot has its own `jurisdiction` column but it is only populated for NSW/VIC (1,334 of 2,641 POA rows have jurisdiction=NULL there) — QLD/SA/WA's rent-only postcode data has no jurisdiction label at all in that table, meaning the public map/API's jurisdiction display is likely NULL for those markers too. Candidate for Sprint 12 WS6 (national canonical marts) to fix structurally, e.g. a generated postcode_to_state column or function used consistently everywhere POA jurisdiction is needed.
- **vic_rent_bypasses_shared_fact_table** (architecture): core.fact_rental_market_summary has ZERO rows for VIC (state_code=2) across all geography types — live-verified, matches a finding already recorded in Sprint 11's session history. jurisdiction_coverage.yml describes VIC rent as 'partially_available... refresh_frequency: quarterly', implying a time series, but no VIC rent time series exists anywhere in mart.suburb_rent_quarterly / mart.lga_rent_quarterly / mart.postcode_rent_quarterly (all live-queried at 0 VIC rows). VIC's rent value exists ONLY as a single latest-value column, mart.suburb_market_snapshot.median_weekly_rent_latest (79 of 2,944 VIC suburbs populated) — VIC's rent pipeline diverged from the shared core-fact/quarterly-mart pattern every other rent-bearing jurisdiction (NSW/QLD/SA/WA) uses. This audit reports VIC rent as 'available_snapshot_only' rather than 'available' to reflect this genuinely narrower capability (no history, no trend). Candidate for Sprint 12 WS6 to either backfill VIC into the shared quarterly pipeline or explicitly document the divergence in the coverage contract rather than implying parity with the other jurisdictions.

## Jurisdiction × domain coverage

### NSW

Geography backbone: 25,795 geographies across 9 levels (SA1: 19,746, SAL: 4,542, SA2: 642, LGA: 129, POA: 613, SA3: 92, SA4: 28, GCCSA: 2, STATE: 1). Registered in `meta.jurisdiction` (status: active).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 277,687 rows | 1903-01-01 to 2032-01-01 |
| residential rents | available | 257,251 rows | 2021-01-01 to 2026-01-01 |
| gross yield | derived | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 205,376 rows | - |
| tenure | available | 154,032 rows | - |
| population | available | 4,542 rows / 4,542 | - |
| population growth | available | 3,344 rows / 4,542 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 4,542 rows / 4,542 | - |
| household income | available | 4,542 rows / 4,542 | - |
| building approvals | available | 25,038 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### VIC

Geography backbone: 19,804 geographies across 9 levels (SAL: 2,944, SA1: 15,478, SA2: 522, SA3: 66, POA: 694, LGA: 80, SA4: 17, GCCSA: 2, STATE: 1). Registered in `meta.jurisdiction` (status: active).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 190 rows | 1998-01-01 to 2026-07-01 |
| residential rents | available_snapshot_only | 79 rows | - |
| gross yield | derived | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 157,744 rows | - |
| tenure | available | 118,308 rows | - |
| population | available | 2,944 rows / 2,944 | - |
| population growth | available | 2,070 rows / 2,944 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 2,944 rows / 2,944 | - |
| household income | available | 2,944 rows / 2,944 | - |
| building approvals | available | 20,358 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### QLD

Geography backbone: 16,939 geographies across 9 levels (SAL: 3,233, POA: 433, SA2: 546, SA1: 12,545, SA3: 82, LGA: 78, SA4: 19, GCCSA: 2, STATE: 1). Registered in `meta.jurisdiction` (status: rent_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 110 rows | 2001-01-01 to 2026-07-01 |
| residential rents | available | 334,385 rows | 2012-01-01 to 2026-04-01 |
| gross yield | derived | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 134,680 rows | - |
| tenure | available | 101,010 rows | - |
| population | available | 3,233 rows / 3,233 | - |
| population growth | available | 2,371 rows / 3,233 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 3,233 rows / 3,233 | - |
| household income | available | 3,233 rows / 3,233 | - |
| building approvals | available | 21,294 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### SA

Geography backbone: 6,645 geographies across 9 levels (SAL: 1,696, SA2: 174, POA: 341, LGA: 71, SA3: 28, SA4: 7, GCCSA: 2, STATE: 1, SA1: 4,325). Registered in `meta.jurisdiction` (status: rent_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | official_source_paid_or_restricted | 0 rows | - |
| residential rents | available | 40,550 rows | 2024-07-01 to 2026-01-01 |
| gross yield | unavailable | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 52,856 rows | - |
| tenure | available | 39,642 rows | - |
| population | available | 1,696 rows / 1,696 | - |
| population growth | available | 1,137 rows / 1,696 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 1,696 rows / 1,696 | - |
| household income | available | 1,696 rows / 1,696 | - |
| building approvals | available | 6,786 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | unavailable | requires a sales price input, not available for this jurisdiction | - |
| sales volume | unavailable | - | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### WA

Geography backbone: 8,882 geographies across 9 levels (POA: 386, SA2: 265, SAL: 1,699, LGA: 137, SA3: 34, SA4: 10, GCCSA: 2, STATE: 1, SA1: 6,348). Registered in `meta.jurisdiction` (status: rent_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | official_source_paid_or_restricted | 0 rows | - |
| residential rents | available | 28,034 rows | 2023-03-01 to 2026-05-01 |
| gross yield | unavailable | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 70,680 rows | - |
| tenure | available | 53,010 rows | - |
| population | available | 1,699 rows / 1,699 | - |
| population growth | available | 1,107 rows / 1,699 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 1,699 rows / 1,699 | - |
| household income | available | 1,699 rows / 1,699 | - |
| building approvals | available | 10,335 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | unavailable | requires a sales price input, not available for this jurisdiction | - |
| sales volume | unavailable | - | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### TAS

Geography backbone: 2,518 geographies across 9 levels (SAL: 776, SA2: 99, SA4: 4, SA3: 15, POA: 115, LGA: 29, GCCSA: 2, STATE: 1, SA1: 1,477). Registered in `meta.jurisdiction` (status: sales_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 370 rows | 2002-03-01 to 2026-03-01 |
| residential rents | blocked_access | 0 rows | - |
| gross yield | unavailable | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 19,968 rows | - |
| tenure | available | 14,976 rows | - |
| population | available | 776 rows / 776 | - |
| population growth | available | 561 rows / 776 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 776 rows / 776 | - |
| household income | available | 776 rows / 776 | - |
| building approvals | available | 3,861 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | unavailable | - | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### NT

Geography backbone: 1,083 geographies across 9 levels (SAL: 303, GCCSA: 2, SA2: 68, LGA: 19, POA: 34, SA3: 9, SA4: 2, STATE: 1, SA1: 645). Registered in `meta.jurisdiction` (status: sales_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 370 rows | 2002-03-01 to 2026-03-01 |
| residential rents | blocked_access | 0 rows | - |
| gross yield | unavailable | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 8,552 rows | - |
| tenure | available | 6,414 rows | - |
| population | available | 303 rows / 303 | - |
| population growth | available | 229 rows / 303 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 303 rows / 303 | - |
| household income | available | 303 rows / 303 | - |
| building approvals | available | 2,652 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | unavailable | - | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

### ACT

Geography backbone: 1,536 geographies across 9 levels (SA2: 134, SAL: 136, POA: 25, SA4: 1, SA3: 10, GCCSA: 1, LGA: 1, STATE: 1, SA1: 1,227). Registered in `meta.jurisdiction` (status: sales_only).

| domain | status | detail | period |
|---|---|---|---|
| residential sales | available | 274 rows | 1992-01-01 to 2026-06-01 |
| residential rents | available | 689 rows | 2021-01-01 to 2026-01-01 |
| gross yield | derived | requires both a sales and a rent source for the same jurisdiction; computed at query time, not stored | - |
| dwelling stock | available | 12,184 rows | - |
| tenure | available | 9,138 rows | - |
| population | available | 136 rows / 136 | - |
| population growth | available | 111 rows / 136 | - |
| internal migration | unavailable | no ABS internal-migration dataset loaded at any grain — a genuine national gap, not jurisdiction-specific (candidate for Sprint 12 WS3) | - |
| household composition | available | 136 rows / 136 | - |
| household income | available | 136 rows / 136 | - |
| building approvals | available | 5,226 rows | 2025-06-01 to 2026-05-01 |
| dwelling commencements | unavailable | ABS Building Activity (commencements) not loaded — distinct dataset from Building Approvals, a genuine national gap (candidate for Sprint 12 WS3) | - |
| dwelling completions | unavailable | ABS Building Activity (completions) not loaded — same gap as commencements | - |
| housing lending rates | available | 664 rows | - |
| affordability | derived | computed at query time from sales + shared national assumption scenario, requires a sales source | - |
| sales volume | available | sale_count column within the sales fact/mart, same source as residential_sales | - |
| rental observations | available | observation_count column within the rent fact/mart, same source as residential_rents | - |
| supply per 1000 dwellings | derived | approvals_per_1000_dwellings, computed at query time in compare_market_geographies_v1 and similar | - |
| source freshness | meta.dataset_freshness_status tracks this per dataset_id (Sprint 11 WS16), not per jurisdiction directly | - | - |
| confidence | every populated mart row carries a confidence_label column; distribution not jurisdiction-specific | - | - |

## National context (applies identically to every jurisdiction)

RBA interest-rate series loaded (Sprint 11 WS8):

| rate_type | borrower_type | loan_type | rows | earliest | latest |
|---|---|---|---|---|---|
| cash_rate_target | - | - | 98 | 1990-01-23 | 2026-05-06 |
| housing_lending_rate | investor | all | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | investor | fixed_gt_3y | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | investor | fixed_le_3y | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | investor | variable | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | owner_occupier | all | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | owner_occupier | fixed_gt_3y | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | owner_occupier | fixed_le_3y | 83 | 2019-07-31 | 2026-05-31 |
| housing_lending_rate | owner_occupier | variable | 83 | 2019-07-31 | 2026-05-31 |
| indicator_lending_rate | investor | fixed_3y | 131 | 2015-08-31 | 2026-06-30 |
| indicator_lending_rate | investor | standard_variable | 131 | 2015-08-31 | 2026-06-30 |
| indicator_lending_rate | owner_occupier | fixed_3y | 430 | 1990-09-30 | 2026-06-30 |
| indicator_lending_rate | owner_occupier | standard_variable | 810 | 1959-01-31 | 2026-06-30 |

## Method note

This audit deliberately does not attempt a full 9-jurisdiction × 9-geography
× 19-domain cross-tabulation (1,539 cells) as a hand-authored matrix — most
combinations would be empty or redundant with the per-domain
`geography_levels` already recorded. Geography-level detail is captured
per domain in the registry YAML; this report summarises at the
jurisdiction × domain grain, which is where genuine coverage decisions
actually get made.
