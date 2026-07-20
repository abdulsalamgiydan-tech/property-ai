# Canonical Property Data Contracts (Sprint 10, Phase 2)

Every state adapter's local store must produce rows satisfying these shapes
before any branch promotion. TypeScript types live in
`lib/warehouse/contracts.ts` (used by the contract tests); this document is
the authoritative prose definition.

## Canonical sales transaction contract

| field | type | notes |
|---|---|---|
| `jurisdiction` | `'NSW' \| 'VIC'` | matches `meta.dataset.jurisdiction` |
| `source_transaction_id` | string | natural key component from the source system |
| `source_version` | string \| null | republish/correction version if the source provides one |
| `contract_date` | date \| null | |
| `settlement_date` | date \| null | |
| `sale_price` | number \| null | never zero-filled when missing |
| `property_address_raw` | string \| null | preserved exactly as sourced |
| `locality_raw` | string \| null | preserved exactly as sourced, before any normalisation |
| `postcode_raw` | string \| null | |
| `property_type_raw` | string \| null | the source's own free-text/coded property type, preserved unmodified |
| `dwelling_type_canonical` | `'detached_house' \| 'apartment_unit' \| 'townhouse_villa_semidetached' \| 'residential_land' \| 'other_residential' \| 'unknown_residential'` | the shared canonical vocabulary — no state may introduce its own values |
| `classification_confidence` | `'high' \| 'medium' \| 'low'` | how sure the classification RULE is (distinct from sample-size confidence) |
| `transaction_status` | string \| null | e.g. settled/pending, source-dependent |
| `market_transaction_flag` | boolean | true only for arm's-length market transactions |
| `nominal_transfer_flag` | boolean | true for identified non-market/nominal transfers |
| `outlier_flag` | boolean | flagged, never removed from the local store |
| `geography_id_sal` | string \| null | resolved `core.dim_geography` id |
| `geography_id_poa` | string \| null | resolved `core.dim_geography` id |
| `source_id` / `dataset_id` / `source_file_id` / `load_run_id` | string/uuid | `meta.*` lineage |
| `retrieved_at` | timestamp | |

NSW's existing `nsw_sales_transactions_raw` table already satisfies this
shape under different column names (`district_code`+`property_id`+
`sale_counter` = `source_transaction_id`, `nature_of_property` =
`property_type_raw`, `dwelling_type` = `dwelling_type_canonical`,
`dwelling_type_confidence` = `classification_confidence`, `price_flag`
encodes `market_transaction_flag`/`nominal_transfer_flag`/`outlier_flag`) —
no column rename was performed on the already-branch-proven NSW table;
`lib/warehouse/contracts.ts` documents the mapping instead.

## Canonical rental summary contract

| field | type | notes |
|---|---|---|
| `jurisdiction` | `'NSW' \| 'VIC'` | |
| `geography_type` | `'SAL' \| 'POA' \| 'LGA'` | LGA only when a state's official source has no finer grain (see Phase 6 rule) |
| `geography_code` | string | |
| `reference_period` | date | first day of the period |
| `dwelling_type` | canonical vocabulary or `'all'` | |
| `bedroom_count` | number \| null | null = "Total" across bedroom counts |
| `median_weekly_rent` | number \| null | |
| `rental_count` | number \| null | sample size where the source publishes it |
| `direct_or_derived` | `'direct' \| 'derived'` | `'derived'` when suburb-level figures are apportioned from a coarser official grain via documented correspondence — never fabricated |
| `confidence_label` | `'high' \| 'medium' \| 'low' \| 'insufficient'` | shared sample-size thresholds |
| source metadata | — | same `meta.*` lineage shape as sales |

NSW's `core.fact_rental_market_summary` already satisfies this shape.

## Shared sample-size confidence thresholds (never redefined per state)

- `high`: sample size ≥ 30
- `medium`: sample size ≥ 10
- `low`: sample size ≥ 5
- `insufficient`: sample size < 5, published (never suppressed), with the
  label attached

## Shared dwelling-type vocabulary

`detached_house`, `apartment_unit`, `townhouse_villa_semidetached`,
`residential_land`, `other_residential`, `unknown_residential` — the exact
6 values used by NSW since Sprint 5/9. Victoria's classification rules
(`warehouse/config/vic_dwelling_type_mapping.yml`) map VIC's own source
fields into this same vocabulary; they never add a 7th value or redefine
what any of these 6 mean.
