# Coverage Maximiser report (apply-local)

Generated 2026-08-02T04:48:03.483Z · 15,334 SAL · view `v_suburb_market_snapshot_v1`

> `naive_price_rent_overlap` is an UNQUALIFIED upper bound, not coverage. `qualified_recoverable` is 0 until the lineage audit qualifies candidates.

| metric | direct | naive overlap | qualified | coverage % | primary reason |
|---|--:|--:|--:|--:|---|
| Median house price | 4756 | 0 | 0 | 31% | source_not_ingested |
| Median unit price | 1454 | 0 | 0 | 9.5% | source_not_ingested |
| Median house rent (weekly) | 3089 | 0 | 0 | 20.1% | source_not_ingested |
| Gross rental yield | 453 | 126 | 0 | 3% | calculation_inputs_missing |
| 12-month price change (cumulative) | 735 | 0 | 0 | 4.8% | calculation_inputs_missing |
| 3-year price change (cumulative) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| 3-year price growth (CAGR) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| 5-year price change (cumulative) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| 5-year price growth (CAGR) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| 10-year price change (cumulative) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| 10-year price growth (CAGR) | 0 | 0 | 0 | 0% | calculation_inputs_missing |
| Sales volume (12m) | 4811 | 0 | 0 | 31.4% | source_not_ingested |
| Rental vacancy rate | 0 | 0 | 0 | 0% | no_reusable_source |
| Days on market | 0 | 0 | 0 | 0% | no_reusable_source |
| Population | 15334 | 0 | 0 | 100% | complete |