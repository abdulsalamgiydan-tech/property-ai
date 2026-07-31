# Sprint 18.2 Phase 5 — Frozen Source Snapshot (Minimum 21-Table Contract)

## Snapshot ID: `wh-snap-2026-07-31-ed76873c-min21`

This snapshot ID is invalidated and must be regenerated if warehouse-validation
is mutated after this point. Composition:

| Field | Value |
|---|---|
| Supabase branch id | `ed76873c-5299-482b-bb9c-27fb9a5bc7e5` (`warehouse-validation`, project `lzonauinzatmtytyoems`) |
| Parent project ref | `oshquaxsloolqucwvigc` |
| Extraction timestamp (UTC) | `2026-07-31T10:10:32Z` |
| Repo git commit at capture | `1999d089d2a3ddb961d16f703edd4242a214b12d` (`feature/sprint18-production-warehouse-bootstrap`) |
| Migration ledger head | `20260730222652` / `047_warehouse_internal_schema_rls` |
| Scope | Minimum launch contract only — 21 of 53 tables (see `sprint18_2_minimum_launch_contract.md` for the dependency trace that derived this set) |
| Combined schema+data checksum | `md5` of all 21 per-table digests below, concatenated in the sorted-table-name order they appear in this document |

## Object allow-list (exactly 21 tables — nothing else is in scope)

`core.dim_geography`; `mart.{suburb,postcode}_market_snapshot`,
`mart.{suburb,postcode}_demographic_profile_2021`,
`mart.{suburb,postcode}_market_timeseries`,
`mart.{suburb,postcode,lga}_rent_quarterly`; `meta.dataset`, `meta.source`,
`meta.dataset_freshness_status`, `meta.dataset_refresh_run`,
`meta.metric_lineage_registry`, `meta.metric_assumption`,
`meta.jurisdiction`, `meta.data_incident`, `meta.data_quality_rule`,
`meta.data_quality_run`, `meta.data_quarantine_summary`.

## Row-count / key-integrity / checksum manifest

All natural/primary keys verified 100% unique, 100% non-null across every
table — zero duplicates, zero orphaned keys, no repair needed.

| Table | Rows | Distinct keys | Duplicates | Null keys | Digest (md5 of ordered row-hash concat) |
|---|---|---|---|---|---|
| core.dim_geography | 101,215 | 101,215 | 0 | 0 | `4c8f3d4b1940d08b43118b479bf7fa3c` |
| mart.suburb_market_snapshot | 15,334 | 15,334 | 0 | 0 | `03cb19b52d995cfff5ebbafbf1723c93` |
| mart.postcode_market_snapshot | 2,641 | 2,641 | 0 | 0 | `eebfd06c9d52910abbebf6db1ca2e449` |
| mart.suburb_demographic_profile_2021 | 15,334 | 15,334 | 0 | 0 | `4e3c99361c7f21267974d307d9b3f4e1` |
| mart.postcode_demographic_profile_2021 | 2,641 | 2,641 | 0 | 0 | `3cc0f775357a8ea83e69c922bbfa8ae7` |
| mart.suburb_market_timeseries | 102,625 | 102,625 | 0 | 0 | `2f26de6aede838f7b01e42dbab1708b6` |
| mart.postcode_market_timeseries | 23,150 | 23,150 | 0 | 0 | `bdca698cc12f090ae3967dc4f49ed501` |
| mart.suburb_rent_quarterly | 99,561 | 99,561 | 0 | 0 | `3bf5193c2fad2cb52bda8950b9ba9ee8` |
| mart.postcode_rent_quarterly | 75,578 | 75,578 | 0 | 0 | `cbdda5567d407e9d78df18f6ee8c1cf7` |
| mart.lga_rent_quarterly | 13,931 | 13,931 | 0 | 0 | `b5f91ef402539ca2c0467fc74c63aa53` |
| meta.dataset | 41 | 41 | 0 | 0 | `29c1b1163b648161ce09dbfc25b9476a` |
| meta.source | 13 | 13 | 0 | 0 | `f6b234bb246c57e8ad7fe972179802f2` |
| meta.dataset_freshness_status | 7 | 7 | 0 | 0 | `b08c162ed6587468cdc5efefd768d553` |
| meta.dataset_refresh_run | 2 | 2 | 0 | 0 | `9b78a32754f708655d608ab096d5ecf7` |
| meta.metric_lineage_registry | 35 | 35 | 0 | 0 | `3c510b62f469d2cd2adc5089a6296c0a` |
| meta.metric_assumption | 7 | 7 | 0 | 0 | `7edcceec8e52edf2f36c788cb2a58215` |
| meta.jurisdiction | 8 | 8 | 0 | 0 | `aecc59e48eca925520ca9056d8d4c24f` |
| meta.data_incident | 3 | 3 | 0 | 0 | `43725b7726518c82e6ed441ec9f86b81` |
| meta.data_quality_rule | 44 | 44 | 0 | 0 | `87fe0e2d727b377743dfa2d1f96550da` |
| meta.data_quality_run | 5 | 5 | 0 | 0 | `5af18be909320510627713a18cf0110b` |
| meta.data_quarantine_summary | 1 | 1 | 0 | 0 | `92ea137df8a1e0c64c40ef2e8f0889c9` |
| **Total** | **452,176** | | | | |

Note: `meta.dataset` (41 rows) and `meta.source` (13 rows) are higher than
the earlier Sprint 18.1 full-warehouse manifest's `n_live_tup`-estimated
25/12 — this snapshot uses exact `count(*)` throughout, so these are the
correct, authoritative figures; the earlier document's estimate is
superseded for these two tables.

## Source freshness manifest (the 5 date-ranged tables)

| Table | Min date | Max date | Future-dated rows? |
|---|---|---|---|
| mart.suburb_market_timeseries | 1996-01-01 | 2026-07-01 | No |
| mart.postcode_market_timeseries | 1996-01-01 | 2026-07-01 | No |
| mart.suburb_rent_quarterly | 2017-07-01 | 2026-05-01 | No |
| mart.postcode_rent_quarterly | 2017-07-01 | 2026-05-01 | No |
| mart.lga_rent_quarterly | 2012-01-01 | 2026-04-01 | No |

Zero future-dated observations across every date-bearing table in the
minimum contract — satisfies the Phase 10 "no future-dated observations"
gate for this slice, verified now rather than deferred.

The remaining 16 tables (`core.dim_geography`, both `*_market_snapshot`,
both `*_demographic_profile_2021`, and all 11 `meta.*` tables) are
point-in-time/reference tables with no single "observation date" column —
their freshness is tracked structurally via `meta.dataset_freshness_status`
and `meta.dataset.latest_period`, not a per-row date range.

## Mutation check

Re-ran `count(*)` on `core.dim_geography` (the largest, most-referenced
table) immediately before finalizing this document: **101,215 — identical**
to the first count captured. No mutation occurred during the capture
window. If warehouse-validation changes after this point, this snapshot ID
is invalid and must be regenerated in full, not patched.

## What this snapshot explicitly excludes (by construction, not oversight)

No `auth`, `storage`, user-profile, onboarding, feedback, portfolio,
watchlist, scenario, report, or any `public` schema table — this snapshot
was captured exclusively via `core`/`mart`/`meta`-schema queries; the
`public` schema was never touched during this capture. Full private-data
exclusion proof is Phase 6, next.

## Correction (2026-08-01, Phase 9 import rehearsal)

The digests above were computed by hashing the whole row (`t::text`) on the
source. Actually running the full export -> import -> verify cycle against a
disposable Production-equivalent branch found two problems this static
capture didn't catch:

1. `core.dim_geography` exports the whole source row, but the source
   (warehouse-validation) still carries a `geom` column that the Production
   minimum-contract table (migration 049) deliberately never creates —
   `import.mjs` correctly refused to load a column the target doesn't have.
2. The `t::text` digest is therefore not comparable between source and
   target for any table with an intentionally-excluded column — even with
   byte-identical shared-column data, the digest could never match.

Both are fixed in `warehouse/scripts/snapshot/lib.mjs` (`COLUMN_EXCLUDE_LIST`,
now also excluding `meta.data_incident.unique_signature`, a generated
column that can't be an explicit COPY target) and in `export.mjs`/`verify.mjs`
(digest now hashes an explicit `row(...)` projection over the exported
column set, not the whole row). Row counts are unchanged; the corrected
per-table digests (same snapshot ID, regenerated) are:

| Table | Rows | Corrected digest |
|---|---|---|
| core.dim_geography | 101,215 | `1b1e8e7b4e819491a7ce6d267b73fa92` |
| meta.jurisdiction | 8 | `89d718d8ef6685602cfdb9dae43eec10` |
| meta.source | 13 | `de21d27db4d7d25486eeb73cfccd4b92` |
| meta.dataset | 41 | `93fb4364f77c28402e13cef2f2037210` |
| meta.dataset_freshness_status | 7 | `81e2d5b94af30efb7554172bb6ff113a` |
| meta.dataset_refresh_run | 2 | `c56257d66e0b1c56e321843a9944f4a9` |
| meta.metric_assumption | 7 | `2dbec8b9d804bc33a206d7b884d3abf9` |
| meta.metric_lineage_registry | 35 | `7b50e6e1d150d773c969776dc19717dd` |
| meta.data_quality_rule | 44 | `f5300c8f47d9f58566e3ee247eeb5c4c` |
| meta.data_quality_run | 5 | `b8533c14b3d6d208da037796dc406973` |
| meta.data_incident | 3 | `a2edf5f7a82e54fbbb57f5d1b197feab` |
| meta.data_quarantine_summary | 1 | `92ea137df8a1e0c64c40ef2e8f0889c9` |
| mart.suburb_market_snapshot | 15,334 | `6f388dc753dc629021c504e6996d0ecb` |
| mart.postcode_market_snapshot | 2,641 | `3bc95ba0ba0f42119f20b2b0c843204e` |
| mart.suburb_demographic_profile_2021 | 15,334 | `3eb4cc9f2dbc054b863c701e4075ba65` |
| mart.postcode_demographic_profile_2021 | 2,641 | `be61fcc0eddda6cd5091a3956bb7d0d3` |
| mart.suburb_market_timeseries | 102,625 | `217b8754530ed889282d42a1de80c666` |
| mart.postcode_market_timeseries | 23,150 | `7638ec00eae9b5abe62f98f0ab6d4189` |
| mart.suburb_rent_quarterly | 99,561 | `32915b7d16ce8142dba54fb53378b026` |
| mart.postcode_rent_quarterly | 75,578 | `ba5888270f7c9ec5230f87958c51246a` |
| mart.lga_rent_quarterly | 13,931 | `263e09beaf5c42cc11f66d139da62982` |

Verified: `warehouse:snapshot:export` -> `warehouse:snapshot:import` ->
`warehouse:snapshot:verify` against a disposable branch forked from
Production's actual state now passes end-to-end, 21/21 tables, row counts
AND checksums matching, 452,176 rows total, ~114s import duration. Full
detail in `sprint18_2_runbook_and_go_no_go.md`.
