# Victoria Branch Load Report (Sprint 10, Phase 9)

Generated: 2026-07-21T10:23:42.296Z

- branch ref: lzonauinzatmtytyoems
- production touched: NO
- branch merged: NO

## Rows loaded

| target | rows |
|---|---|
| mart.suburb_market_snapshot (VIC) | 741 |
| mart.suburb_market_timeseries (sales) | 6727 |
| mart.suburb_market_timeseries (rent) | 8130 |
| mart.suburb_market_timeseries (yield) | 706 |
| mart.suburb_market_timeseries (approvals) | 2944 |

## Validation gates

| gate | result |
|---|---|
| duplicate snapshot rows | 0 |
| duplicate timeseries rows | 0 |
| orphan snapshot geography | 0 |
| yield rows missing confidence label | 0 |

Branch DB size: 2358 MB -> 2359 MB

## Scope notes

- SAL (suburb) grain only — VPSR has no postcode-level figures, unlike NSW PSI.
- Only geography_confidence IN ('direct','alias') rows promoted — unresolved localities never written to Supabase.
- No townhouse_villa_semidetached coverage — VPSR has no such product.
- Demographics/dwelling-stock/approvals/RBA-rate data reused from already-national branch tables — no new download this phase.
