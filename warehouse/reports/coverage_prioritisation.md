# Offline coverage prioritisation

As of: 2026-08-23

> Every opportunity below is **estimated only**. Production coverage is unchanged.

## Published baseline

- Suburb snapshots: 15334
- Sale-price coverage: 4821
- Rent coverage: 3089
- Yield coverage: 453
- 12-month growth coverage: 735

## Ranked opportunity ceilings

| Rank | Source | State | Family | Addressable ceiling | Score | Blockers |
|---:|---|---|---|---:|---:|---|
| 1 | sa_metro_median_house_sales | SA | sales | 1696 | 1377.576 | metro only; house only; suppressed low-transaction suburbs |
| 2 | vic_dffh_moving_annual_rent | VIC | rent | 2944 | 894.24 | combined localities must remain quarantined; current warehouse coverage is snapshot-thin |
| 3 | sa_private_rental_report | SA | rent | 1696 | 616.284 | historical workbook variants; small-cell suppression and rounding |
| 4 | nsw_dcj_rent_and_sales_report | NSW | rent | 4542 | 298.92 | postcode/LGA grain rather than universal SAL-direct; missing quarters; exact licence URL review |
| 5 | qld_rta_median_rents | QLD | rent | 3233 | 169.733 | exact package id and licence must be resolved before reacquisition |
| 6 | nsw_vg_bulk_psi | NSW | sales | 4542 | 82.778 | multi-GB history; current licence re-verification; official landing access-controlled in this environment |
| 7 | wa_rental_bonds | WA | rent | 1699 | 52.032 | raw bonds require median computation; v3 licence record reconciliation |
| 8 | vic_vg_property_sales | VIC | sales | 2944 | 49.68 | official portal returned 403 from prior environment; live XLSX header/checksum not acquired |
| 9 | qld_official_sales_gap | QLD | sales | 3233 | 7.759 | no free reusable bulk suburb-median source found; licensing purchase requires separate human decision |
| 10 | tas_rental_bonds | TAS | rent | 776 | 4.656 | official page confirms monthly XLSX publication through data.gov.au, but exact current resource URL is not captured; reuse licence, live workbook schema and adapter are unverified |
| 11 | tas_official_sales_gap | TAS | sales | 776 | 1.901 | no free reusable suburb sales bulk source confirmed; paid/restricted access |
| 12 | nt_official_market_gap | NT | sales_and_rent | 303 | 0.424 | all official property-group datasets reviewed; no sales or rent dataset; industry-association sources excluded |
| 13 | act_official_market_gap | ACT | sales_and_rent | 136 | 0.19 | official portal searches returned no property-sales, rent or rental-bond dataset |

Scores rank investigation effort; they are not coverage forecasts or achieved results.
