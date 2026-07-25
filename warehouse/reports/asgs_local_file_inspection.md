# ASGS Local File Inspection

Generated: 2026-07-19T18:57:51.673Z
Extraction root: `warehouse/data/processed/asgs/ASGS3_2021 (gitignored)`. Raw zips untouched; nothing here is committed
except this report.

| dataset_id | type | rows | geometry | CRS | key fields | maps to | status |
|---|---|---|---|---|---|---|---|
| asgs_gccsa_2021_boundaries | GCCSA | 35 | Polygon | GDA2020 (EPSG:7844) | GCC_CODE21, GCC_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_lga_2021_boundaries | LGA | 566 | Polygon | GDA2020 (EPSG:7844) | LGA_CODE21, LGA_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_poa_2021_boundaries | POA | 2644 | Polygon | GDA2020 (EPSG:7844) | POA_CODE21, POA_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_sa1_2021_boundaries | SA1 | 61845 | Polygon | GDA2020 (EPSG:7844) | SA1_CODE21, SA2_CODE21, SA2_NAME21, SA3_CODE21, SA3_NAME21, SA4_CODE21, SA4_NAME21, GCC_CODE21, GCC_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_sa2_2021_boundaries | SA2 | 2473 | Polygon | GDA2020 (EPSG:7844) | SA2_CODE21, SA2_NAME21, SA3_CODE21, SA3_NAME21, SA4_CODE21, SA4_NAME21, GCC_CODE21, GCC_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_sa3_2021_boundaries | SA3 | 359 | Polygon | GDA2020 (EPSG:7844) | SA3_CODE21, SA3_NAME21, SA4_CODE21, SA4_NAME21, GCC_CODE21, GCC_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_sa4_2021_boundaries | SA4 | 108 | Polygon | GDA2020 (EPSG:7844) | SA4_CODE21, SA4_NAME21, GCC_CODE21, GCC_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_sal_2021_boundaries | SAL | 15353 | Polygon | GDA2020 (EPSG:7844) | SAL_CODE21, SAL_NAME21, STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_state_2021_boundaries | STATE | 10 | Polygon | GDA2020 (EPSG:7844) | STE_CODE21, STE_NAME21, AUS_CODE21, AUS_NAME21 | staging.asgs_geography | inspected |
| asgs_corr_sa1_to_lga_2021 | MB->target | 368286 | — | — | MB_CODE_2021, LGA_CODE_2021, LGA_NAME_2021, STATE_CODE_2021, STATE_NAME_2021, AUS_CODE_2021, AUS_NAME_2021, AREA_ALBERS_SQKM | staging.asgs_correspondence | inspected |
| asgs_mb_2021_allocation | MB | 368286 | — | — | MB_CODE_2021, SA1_CODE_2021, SA2_CODE_2021, SA2_NAME_2021, SA3_CODE_2021, SA3_NAME_2021, SA4_CODE_2021, SA4_NAME_2021, GCCSA_CODE_2021, GCCSA_NAME_2021, STATE_CODE_2021, STATE_NAME_2021, AUS_CODE_2021, AUS_NAME_2021, AREA_ALBERS_SQKM | staging.asgs_correspondence | inspected |
| asgs_corr_sa1_to_poa_2021 | MB->target | 368286 | — | — | MB_CODE_2021, POA_CODE_2021, POA_NAME_2021, AUS_CODE_2021, AUS_NAME_2021, AREA_ALBERS_SQKM | staging.asgs_correspondence | inspected |
| asgs_corr_sa1_to_sal_2021 | MB->target | 368286 | — | — | MB_CODE_2021, SAL_CODE_2021, SAL_NAME_2021, STATE_CODE_2021, STATE_NAME_2021, AUS_CODE_2021, AUS_NAME_2021, AREA_ALBERS_SQKM | staging.asgs_correspondence | inspected |

Full layer listings, .prj text and xlsx headers: `asgs_local_file_inspection.json`.
