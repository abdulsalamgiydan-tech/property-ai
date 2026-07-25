# RBA Interest Rates Local Store Report (Sprint 8, Part C)

Generated: 2026-07-20T18:47:00.180Z
Store: `warehouse/data/local/rba_rates.duckdb` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

## Source verification

Official RBA sources verified (per `rba_rates_source_manifest.json`): **true**.
File hashes recorded for all 3 downloaded files: **true**.
Raw/local data files tracked by git: **0** ✅

| dataset | sha256 (prefix) | bytes |
|---|---|---|
| rba_cash_rate_target | 72288a85d70d68cb... | 19,970 |
| rba_housing_lending_rates | 319f78cbe904fe7d... | 37,270 |
| rba_indicator_lending_rates_housing | f522bdabf93519d7... | 72,009 |

## Coverage

Periods: **907** distinct dates, 1959-01-31 to 2026-06-30.

| rate_type | rows | NULL rate_percent |
|---|---|---|
| cash_rate_target | 98 | 3 |
| housing_lending_rate | 664 | 0 |
| indicator_lending_rate | 1502 | 0 |

## Checks

| check | value |
|---|---|
| NULL reference_period (date parsing failures) | 0 |
| duplicate natural keys (reference_period, rate_type, borrower_type, loan_type) | 0 |
| negative rates | 0 |
| rows labelled 'passed' but rate_percent NULL (should be 0 — every NULL is explicitly labelled) | 0 |
| rows with a numeric rate but a non-'passed' label (should be 0) | 0 |
| range-format rows (pre-Aug-1990 A2, rate_percent NULL by design) | 3 |
| unpublished cells (informational) | 0 |
| missing series_id | 0 |

## Cash rate target sanity

Range observed among numeric (non-range-format) rows: **0.1% – 14%**, 1990-08-02 to 2026-05-06 — consistent with the RBA's own published history. Note the true historical peak (17.00-17.50%, Jan-Aug 1990) is among the 3 range-format rows excluded from this numeric band, not a data error.

- 3 range-format A2 rows (pre-Aug-1990) are stored with rate_percent = NULL and data_quality_status = 'range_not_numeric' — never estimated to a single value. passed_but_null_rate=0 confirms every NULL rate_percent row is explicitly labelled non-passed, not a silent gap.
- F5 series that had not yet started in a given month (e.g. investor series before Aug 2015) are omitted from the store entirely for that month, never zero-filled.
- F6 has no unpublished cells across the 8 curated series in the current pull (unpublished_cells counts across all rate_type, informational only).
