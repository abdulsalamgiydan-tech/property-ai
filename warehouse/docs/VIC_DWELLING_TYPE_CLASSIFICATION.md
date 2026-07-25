# Victoria Dwelling-Type Classification (Sprint 10, Phase 5)

## Source structure

VPSR (Victorian Property Sales Report, Valuer-General Victoria) publishes
three independent products, each a pre-aggregated suburb-by-quarter median:

- Median House by Suburb
- Median Unit by Suburb
- Median Vacant Land by Suburb

Unlike NSW's PSI (transaction-level, with `strata_lot`/`unit_number`/nature-
of-property evidence fields that support a `townhouse_villa_semidetached`
split), VPSR carries no per-transaction evidence — each product is already
a single dwelling-type aggregate with no further classification possible
from the published figures.

## Mapping to canonical vocabulary

See `warehouse/config/vic_dwelling_type_mapping.yml` for the exact mapping.
Summary:

| VPSR product | canonical dwelling_type |
|---|---|
| Median House | `detached_house` |
| Median Unit | `apartment_unit` |
| Median Vacant Land | `residential_land` |

`townhouse_villa_semidetached`, `other_residential`, and
`unknown_residential` have **no VIC VPSR coverage** this sprint — no rows
are written for these types, and this gap is documented rather than
papered over by merging townhouse/villa sales into `apartment_unit` or
`detached_house`.

## Confidence and missing-value handling

Each suburb-quarter cell in the source carries an optional flag:

- (blank) — no flag, source implies a normal sample.
- `^` — fewer than 10 sales that quarter. Mapped to
  `sample_size_confidence = 'low'`.
- `*` — no sales that quarter; the published price is a carried-forward
  stale figure from an earlier quarter. Mapped to `median_sale_price =
  NULL` (the carried-forward figure is never stored as if it were a real
  observation) and `sample_size_confidence = 'insufficient'`.

Only the latest quarter (Oct-Dec 2025) has a published transaction count,
letting `sample_size_confidence` be computed exactly against this
project's shared thresholds (high >= 30, medium >= 10, low >= 5,
insufficient < 5, from `lib/warehouse/contracts.ts`). For the four earlier
quarters, no count is published, so confidence is inferred only from the
flag: unflagged -> `medium` (source implies >= 10, exact tier unknown),
`^` -> `low`, `*` -> `insufficient`. This is a coarser, explicitly weaker
confidence signal than NSW's exact transaction-count-based confidence, and
is documented as such rather than presented as equivalent precision.

## Structural difference from NSW

VIC's local sales store (`vic_sales.duckdb :: vic_sales_summary`) is a
**summary-only** store — there is no transaction-level table, because none
exists in the official source. This differs from NSW's
`nsw_sales_transactions_raw` + `nsw_sales_summary` pair. Downstream
consumers (Phase 8/9 marts, Phase 11 comparison API) must not assume a VIC
transaction table exists.
