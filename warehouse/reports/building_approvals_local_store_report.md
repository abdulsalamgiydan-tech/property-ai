# Building Approvals Local Store Report (Sprint 4)

Generated: 2026-07-20T08:29:40.663Z
Store: `warehouse/data/local/building_approvals.duckdb` + parquet export (gitignored).
**No Supabase connection was made.** Verdict: **PASSED**

## Source

Dataset: `building_approvals_sa2_2021`, retrieved via official ABS Data API key
`1.9.1.110+150+100.SA2..M`. Size: 26.2 MB,
sha256 recorded. Raw file on disk: ✅.
Raw/local data files tracked by git: **0** ✅

## Coverage

Periods: **59** months, 2021-07-01 to 2026-05-01.

| dwelling type | cells | quarantined |
|---|---|---|
| houses | 145022 | 0 |
| other_residential | 145022 | 0 |
| total_dwellings | 145022 | 0 |

## Geography join (against the local ASGS backbone store)

| check | value |
|---|---|
| SA2 geographies joined to ASGS backbone | 2450 |
| unjoined (special codes / offshore) | 8 |
| ASGS SA2s with zero recorded approvals (expected for remote areas) | 4 |

## Checks

| check | value |
|---|---|
| NULL geography codes | 0 |
| duplicate natural keys | 0 |
| negative counts (quarantined) | 0 |
| total quarantined cells | 0 |
| unpublished cells kept NULL | 0 |

## Latest 12-month national consistency

Houses: 118,743 · Other residential:
82,606 · Total residential:
201,349
(Total should be ≈ Houses + Other residential — ABS's own aggregate, used directly.)

- ABS omits SA2-months with zero approvals rather than publishing explicit 0 rows; these are absent from the store, not quarantined — never backfilled as zero.
- unjoined geographies are typically 'Migratory/Offshore/Shipping' or 'No usual address' style SA2 special codes with no ASGS boundary — expected, not a mapping defect.
- asgs_sa2_without_approvals counts backbone SA2s that never had a recorded approval in the whole series (small regional/remote areas) — expected.
