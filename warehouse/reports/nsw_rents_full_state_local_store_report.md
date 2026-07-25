# NSW Rents Full-State Local Store Report (Sprint 7)

Generated: 2026-07-20T10:49:24.813Z
Store: `warehouse/data/local/nsw_rents.duckdb` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

Scope: all of NSW (129 LGAs, full postcode coverage).
Source: NSW DCJ Rent and Sales Report, quarterly LGA + Postcode tables.

## Source files

15 raw files hashed (all: ✅).
Raw/local data files tracked by git: **0** ✅

## Coverage

Quarters loaded: **15** (2021-01-01, 2021-04-01, 2021-07-01, 2021-10-01, 2022-01-01, 2022-04-01, 2022-07-01, 2022-10-01, 2023-01-01, 2023-04-01, 2023-07-01, 2023-10-01, 2024-01-01, 2024-04-01, 2026-01-01)
LGAs covered: **121** / 129. Postcodes covered: **615**

| geography type | rows |
|---|---|
| LGA | 48024 |
| POA | 209916 |

## By dwelling type

| dwelling_type | rows |
|---|---|
| all | 60489 |
| apartment_unit | 50525 |
| detached_house | 56788 |
| other_residential | 50756 |
| townhouse_villa_semidetached | 39382 |

Bedroom breakdown: 206815 rows with a specific bedroom count,
51125 "Total" (all bedrooms) rows.

## Checks

| check | value |
|---|---|
| NULL geography ids | 0 |
| NULL geography codes | 0 |
| duplicate natural keys | 0 |
| non-positive rent (should never occur — DCJ never publishes negative/zero) | 0 |
| NULL median rent (suppressed cells) | 178868 / 257940 |
| NULL rental count | 213879 |
| POA codes not found in the ASGS backbone | 0 |
| LGA codes not found in the ASGS backbone | 0 |
| unknown_residential dwelling type (preserved, not forced) | 0 |

- median_weekly_rent is NULL for DCJ-suppressed cells (<=10 bonds lodged, or <=30 lodged flagged for caution and also treated as NULL here) — never zero-filled or estimated.
- Dwelling type mapping is a direct 1:1 preservation of DCJ's own categories (House/Flat-Unit/Townhouse/Other/Total), high confidence except 'Other' (medium) and any unmapped value ('unknown_residential', low).
- POA geography join is an exact 4-digit postcode match against the full national ASGS POA list (DCJ's own report is inherently NSW-scoped, so no out-of-state code appears in the source data).
- LGA geography join is an exact name match against all 129 NSW LGA names (filtered by state_code to avoid cross-state name collisions).
