# ASGS Source Manifest

Generated: 2026-07-19T12:40:12.802Z (updated 2026-07-20: all URLs page-verified)
Edition: ASGS Edition 3 (July 2021 – June 2026) (boundary_version `ASGS3_2021`)
Statuses: 19 discovered

Verification note (2026-07-20): every boundary URL was confirmed as an exact href on the
official ABS digital boundary files page. The live href path is
`.../standard-asgs/edition-3-july-2021-june-2026/...` (the earlier candidate path redirects
to it). ABS publishes no direct SA1->SAL/POA/LGA files; the official inputs are Mesh Block
allocation files (`MB_2021_AUST.xlsx` for the main structure plus `SAL/POA/LGA_2021_AUST.xlsx`)
from the official allocation files page — SA1-level pairs are derived by aggregating MB rows.

Policy: official ABS sources only; raw files land in `warehouse/data/raw/asgs/ASGS3_2021` (gitignored);
unverified URLs are `needs_review`, never guessed. Full details incl. URLs, licence
and intended staging/core targets: `asgs_source_manifest.json`.

| dataset_id | type | level | format | status | expected file |
|---|---|---|---|---|---|
| asgs_state_2021_boundaries | boundary | STATE | shp_zip | discovered | STE_2021_AUST_SHP_GDA2020.zip |
| asgs_gccsa_2021_boundaries | boundary | GCCSA | shp_zip | discovered | GCCSA_2021_AUST_SHP_GDA2020.zip |
| asgs_sa4_2021_boundaries | boundary | SA4 | shp_zip | discovered | SA4_2021_AUST_SHP_GDA2020.zip |
| asgs_sa3_2021_boundaries | boundary | SA3 | shp_zip | discovered | SA3_2021_AUST_SHP_GDA2020.zip |
| asgs_sa2_2021_boundaries | boundary | SA2 | shp_zip | discovered | SA2_2021_AUST_SHP_GDA2020.zip |
| asgs_sa1_2021_boundaries | boundary | SA1 | shp_zip | discovered | SA1_2021_AUST_SHP_GDA2020.zip |
| asgs_sal_2021_boundaries | boundary | SAL | shp_zip | discovered | SAL_2021_AUST_GDA2020_SHP.zip |
| asgs_poa_2021_boundaries | boundary | POA | shp_zip | discovered | POA_2021_AUST_GDA2020_SHP.zip |
| asgs_lga_2021_boundaries | boundary | LGA | shp_zip | discovered | LGA_2021_AUST_GDA2020_SHP.zip |
| asgs_corr_sa1_to_sal_2021 | correspondence | SA1->SAL | xlsx | discovered | SAL_2021_AUST.xlsx + MB_2021_AUST.xlsx |
| asgs_corr_sa1_to_poa_2021 | correspondence | SA1->POA | xlsx | discovered | POA_2021_AUST.xlsx + MB_2021_AUST.xlsx |
| asgs_corr_sa1_to_lga_2021 | correspondence | SA1->LGA | xlsx | discovered | LGA_2021_AUST.xlsx + MB_2021_AUST.xlsx |
| asgs_corr_sa2_to_sal_2021 | correspondence | SA2->SAL | csv | discovered | — |
| asgs_corr_sa2_to_poa_2021 | correspondence | SA2->POA | csv | discovered | — |
| asgs_corr_sa2_to_lga_2021 | correspondence | SA2->LGA | csv | discovered | — |
| asgs_ed3_landing | documentation | ALL | html | discovered | — |
| asgs_ed3_boundary_downloads | documentation | ALL | html | discovered | — |
| asgs_ed3_allocation_files | documentation | ALL | html | discovered | — |
| asgs_ed3_correspondences | documentation | ALL | html | discovered | — |

## Next actions

- All entries resolved — no `needs_review` remain (STATE verified 2026-07-20).
- Downloads go to `warehouse/data/raw/asgs/ASGS3_2021` only (gitignored), hashed into `meta.source_file`.
- Load via `load_asgs_backbone.mjs` (dry-run until approved) against the
  warehouse-validation Supabase branch — never production.
