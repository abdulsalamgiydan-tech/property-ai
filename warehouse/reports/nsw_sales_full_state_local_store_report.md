# NSW Sales Full-State Local Store Report (Sprint 7)

Generated: 2026-07-20T11:01:41.576Z
Store: `warehouse/data/local/nsw_sales.duckdb` + parquet exports (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

Scope: all of NSW (4,542 SAL suburbs / 2,641 POA postcodes), 2001-current.

## Source files

54 raw files hashed (all: ✅).
Raw/local data files tracked by git: **0** ✅

## Volumes

- Residential rows (full state): **4680129** (of 5134248 total rows;
  454119 excluded as non-residential)
- Suburbs (SAL) covered: **4281** / 4,542. Postcodes (POA) covered: **633** / 2,641
- Summary rows built (monthly + annual, SAL + POA, by dwelling_type, full history): **1359573**

## By year

| year | residential rows |
|---|---|
| 1903 | 1 |
| 1910 | 2 |
| 1911 | 10 |
| 1912 | 4 |
| 1913 | 6 |
| 1914 | 6 |
| 1915 | 6 |
| 1916 | 4 |
| 1951 | 1 |
| 1953 | 2 |
| 1955 | 3 |
| 1956 | 4 |
| 1957 | 11 |
| 1958 | 12 |
| 1959 | 11 |
| 1960 | 15 |
| 1961 | 18 |
| 1962 | 9 |
| 1963 | 8 |
| 1964 | 8 |
| 1965 | 9 |
| 1966 | 3 |
| 1967 | 3 |
| 1968 | 9 |
| 1969 | 2 |
| 1970 | 5 |
| 1971 | 8 |
| 1972 | 4 |
| 1973 | 8 |
| 1974 | 8 |
| 1975 | 17 |
| 1976 | 19 |
| 1977 | 14 |
| 1978 | 7 |
| 1979 | 8 |
| 1980 | 12 |
| 1981 | 14 |
| 1982 | 24 |
| 1983 | 30 |
| 1984 | 34 |
| 1985 | 37 |
| 1986 | 29 |
| 1987 | 40 |
| 1988 | 42 |
| 1989 | 45 |
| 1990 | 47 |
| 1991 | 51 |
| 1992 | 69 |
| 1993 | 87 |
| 1994 | 153 |
| 1995 | 169 |
| 1996 | 264 |
| 1997 | 292 |
| 1998 | 405 |
| 1999 | 1013 |
| 2000 | 3831 |
| 2001 | 202058 |
| 2002 | 236538 |
| 2003 | 235608 |
| 2004 | 187575 |
| 2005 | 164422 |
| 2006 | 165549 |
| 2007 | 187138 |
| 2008 | 170491 |
| 2009 | 184703 |
| 2010 | 164296 |
| 2011 | 153960 |
| 2012 | 151926 |
| 2013 | 174228 |
| 2014 | 197525 |
| 2015 | 205794 |
| 2016 | 218730 |
| 2017 | 202404 |
| 2018 | 183872 |
| 2019 | 4171 |
| 2020 | 179454 |
| 2021 | 223372 |
| 2022 | 183315 |
| 2023 | 174046 |
| 2024 | 200467 |
| 2025 | 228707 |
| 2026 | 91736 |
| 2029 | 1 |
| 2032 | 1 |
| null | 1089 |

## By dwelling type

| dwelling_type | rows |
|---|---|
| apartment_unit | 1504413 |
| detached_house | 2556681 |
| other_residential | 45570 |
| residential_land | 573465 |

## Geography match method

| method | rows |
|---|---|
| postcode_only | 24697 |
| suburb_and_postcode | 4650159 |
| suburb_name_only | 1345 |
| unmatched | 3928 |

## Checks

| check | value |
|---|---|
| duplicate natural keys (district+property_id+sale_counter+contract_date) | 0 |
| summary duplicate keys | 0 |
| rows with no transaction date at all | 20733 |
| NULL sale price | 1082 |
| non-positive sale price | 7597 (all flagged `missing_or_invalid`: ✅) |
| missing suburb | 2404 |
| missing postcode | 4068 |
| classified into a dwelling type | 4680129 / 4680129 (0 as `unknown_residential`, low confidence, preserved not forced) |
| flagged nominal/non-market transfers (excluded from stats) | 29381 |
| flagged invalid price (excluded) | 8679 |
| flagged statistical outlier (excluded) | 160330 |
| rows contributing to median/mean/quartile stats | 4481739 |
| geography unmatched (excluded from marts) | 3928 |

- Non-arm's-length/nominal-value transfers (price < $10,000) and IQR-based outliers per dwelling_type are flagged and excluded from median/mean/quartile statistics — never silently included, never dropped from the transaction table.
- geo_unmatched rows have no suburb-name or postcode match against the full NSW ASGS backbone (e.g. a locality name variant or data-entry inconsistency) — excluded from marts, counted here for transparency.
- unknown_residential rows are preserved with a 'low' confidence label rather than forced into a specific dwelling type, per the no-PDF field-mapping limitation documented in the source manifest.
- LGA is not a field on the PSI sale record itself (only suburb name and postcode) — LGA-level coverage is reported via the distinct SAL/POA coverage counts instead.
