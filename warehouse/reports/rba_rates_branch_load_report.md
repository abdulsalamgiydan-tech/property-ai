# RBA Interest Rates Branch Load Report (Sprint 8, Part D)

Generated: 2026-07-20 (run details: `rba_rates_branch_load_report.json`)
Source: local DuckDB store `rba_rates.duckdb` (validated PASSED).
Target: Supabase branch **warehouse-validation** (`lzonauinzatmtytyoems`) only.
**Production touched: NO** (zero warehouse schemas on `oshquaxsloolqucwvigc`,
re-verified via independent MCP query after commit). **Frontend changed: NO.**
**No raw RBA files loaded to the branch** — this module is compact by design
(2,264 rows total), so the entire curated local store was promoted; no local
detail was left out.

## Module scope

Migration 011 applied to the branch: `core.fact_interest_rates` +
`mart.national_interest_rate_context`. Both use an expression-based unique
index (`coalesce(borrower_type,'')`, `coalesce(loan_type,'')`) from the
outset — applying the Sprint 7 NULL-distinctness lesson proactively instead
of discovering the same bug again.

## Loaded (branch core + mart)

| table | rows | notes |
|---|---|---|
| `core.fact_interest_rates` | 2,264 | 98 cash rate target events (1990-2026) + 664 housing lending rate rows (8 series x 83 months, 2019-2026) + 1,502 indicator lending rate rows (4 series, 1959/2015-2026) |
| `mart.national_interest_rate_context` | 2,264 | rebuilt 1:1 from the core fact with human-readable `rate_type_label` and a `source_summary` jsonb recording series_id/official table code/publisher |

## Branch DB size

| | before | after |
|---|---|---|
| branch DB size | 2,049 MB | 2,052 MB |

A 3 MB increase for 2,264 rows — confirms this module stayed well within
the task's "keep this sprint small, no large branch load" instruction, and
did not push the branch closer to any capacity concern.

## Blocking gates (in-transaction, re-verified independently via MCP after commit)

Duplicate fact grain **0** · duplicate mart grain **0** · negative rates
**0** · missing confidence label **0** · NULL reference_period **0**.

## Confidence label distribution

| confidence_label | rows |
|---|---|
| official | 2,261 |
| range_not_numeric | 3 |

Every row carries a label — the 3 pre-August-1990 A2 rows that record the
cash rate target as a range (not a single number) are `range_not_numeric`
with `rate_percent = NULL`, never estimated to a single value.

## Cash rate target sanity

Numeric range: **0.1% – 14%**, 1990-01-23 to current. The true historical
peak (17.00-17.50%, Jan-Aug 1990) is among the 3 range-format rows excluded
from this numeric range by design — not a data error.

## Next step

This is a national macro context layer only — no join to the NSW sales/rent/
yield marts has been built yet (out of scope per "keep this sprint small").
A natural Sprint 9 candidate is joining `mart.national_interest_rate_context`
against the existing yield marts for a first affordability-context view, or
backfilling the 1990-2000 NSW sales archive deferred since Sprint 5. RLS on
warehouse schemas remains undecided before anything approaches production.
