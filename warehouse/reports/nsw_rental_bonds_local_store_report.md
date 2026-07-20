# NSW Rental Bonds Local Store Report (Sprint 6 Pilot)

Generated: 2026-07-20T10:20:08.344Z
Store: `warehouse/data/local/nsw_rents.duckdb` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

Pilot LGAs: Blacktown, Parramatta, Camden, Wollongong, Newcastle, Shellharbour.
Source: NSW DCJ Rent and Sales Report, quarterly LGA + Postcode tables.

## Source files

15 raw files hashed (all: ✅).
Raw/local data files tracked by git: **0** ✅

## Coverage

Quarters loaded: **15** (2021-01-01, 2021-04-01, 2021-07-01, 2021-10-01, 2022-01-01, 2022-04-01, 2022-07-01, 2022-10-01, 2023-01-01, 2023-04-01, 2023-07-01, 2023-10-01, 2024-01-01, 2024-04-01, 2026-01-01)

| geography type | rows |
|---|---|
| LGA | 2661 |
| POA | 25478 |

## By dwelling type

| dwelling_type | rows |
|---|---|
| all | 6058 |
| apartment_unit | 5620 |
| detached_house | 5775 |
| other_residential | 5664 |
| townhouse_villa_semidetached | 5022 |

Bedroom breakdown: 23040 rows with a specific bedroom count,
5099 "Total" (all bedrooms) rows.

## Checks

| check | value |
|---|---|
| NULL geography ids | 0 |
| NULL geography codes | 0 |
| duplicate natural keys | 0 |
| non-positive rent (should never occur — DCJ never publishes negative/zero) | 0 |
| NULL median rent (suppressed cells) | 16990 / 28139 |
| NULL rental count | 21711 |
| POA codes not found in the ASGS backbone | 0 |
| unknown_residential dwelling type (preserved, not forced) | 0 |

- median_weekly_rent is NULL for DCJ-suppressed cells (<=10 bonds lodged, or <=30 lodged flagged for caution and also treated as NULL here) — never zero-filled or estimated.
- Dwelling type mapping is a direct 1:1 preservation of DCJ's own categories (House/Flat-Unit/Townhouse/Other/Total), high confidence except 'Other' (medium) and any unmapped value ('unknown_residential', low).
- POA geography join is an exact 4-digit postcode match (same reliable method as the Sprint 5 sales pilot's postcode join).
- LGA geography join is an exact name match against the 6 pilot LGA names confirmed in Sprint 5's spatial derivation.
