# Census Dwelling Source Manifest (Sprint 3)

Generated: 2026-07-20T05:08:53.296Z
Census year: 2021. Statuses: 8 discovered.

Scope: dwelling counts + household tenure onto the ASGS backbone. Median rent /
mortgage / income live in the same GCP packs (G02) but are deferred to keep the
first load simple — catalogued under `variables_deferred`.

Policy: official ABS only; raw files land in `warehouse/data/raw/census/2021` (gitignored); exact
G-table numbers/columns are confirmed from each pack's Metadata workbook at build
time. Full details: `census_dwelling_source_manifest.json`.

| dataset_id | type | level | format | size | status |
|---|---|---|---|---|---|
| census_gcp_sal_2021 | datapack | SAL | zip_csv | 102.6 MB | discovered |
| census_gcp_poa_2021 | datapack | POA | zip_csv | TBC at download | discovered |
| census_gcp_sa2_2021 | datapack | SA2 | zip_csv | TBC at download | discovered |
| census_gcp_sa1_2021 | datapack | SA1 | zip_csv | 382.3 MB | discovered |
| census_gcp_lga_2021 | datapack | LGA | zip_csv | 13.8 MB | discovered |
| census_mb_counts_2021 | mesh_block_counts | MB | xlsx | ~10 MB | discovered |
| census_datapacks_page | documentation | ALL | html | — | discovered |
| census_mb_counts_page | documentation | ALL | html | — | discovered |

## Verification evidence

- SAL / SA1 / LGA pack URLs answered direct HEAD requests HTTP 200 with sizes
  102.6 / 382.3 / 13.8 MB (2026-07-20) before ABS rate limiting kicked in.
- All five pack file names appear verbatim on the official ABS DataPacks page.
- The Mesh Block counts xlsx href appears verbatim on the official release page.

## Next actions

- Review this manifest, then run `build_census_dwelling_local_store.mjs` to
  download into `warehouse/data/raw/census/2021` (gitignored, SHA-256 recorded) and build the local
  DuckDB/Parquet store. No Supabase contact until the branch-load step.
