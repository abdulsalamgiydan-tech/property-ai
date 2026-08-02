# V3 official-source registry (human-readable)

Captured live this sprint (read-only probes + real CC-BY downloads). Only `accepted_official_reusable` sources enter a promotable layer. Machine-readable: `v3_source_registry.{mjs,json}`.

| id | juris | fmt | licence | comm.reuse | HTTP | disposition | blocker |
|---|---|---|---|---|---|---|---|
| sa_metro_median_house_sales | SA | XLSX | Creative Commons Attribution | yes | 200 | **accepted_official_reusable** | — |
| sa_private_rental_report | SA | XLSX | Creative Commons Attribution | yes | 200 | **accepted_official_reusable** | — |
| nsw_vg_bulk_psi | NSW | ZIP/DAT | CC BY 4.0 (per prior lineage) | yes | 200 | **reacquisition_required** | bulk host reachable (valuation.property.nsw.gov.au 200) but full history is multi-GB; boun |
| abs_asgs_census_context | AU | ZIP/CSV | Creative Commons Attribution | yes | 200 | **reacquisition_required** | abs.gov.au reachable (200) but DataPacks are large zips; the warehouse already holds ABS-d |
| qld_rta_median_rents | QLD | CSV/XLSX | verify via CKAN package | ? | 200 | **reacquisition_required** | data.qld.gov.au CKAN reachable (200); exact package id must be resolved via package_search |
| wa_rental_bonds | WA | CSV | verify AHDAP dataset licence | ? | 200 | **licence_unclear** | AHDAP CKAN reachable (200); originating-authority + commercial-reuse conditions must be ve |
| vic_vg_property_sales | VIC | XLSX | CC BY (per site) | ? | 403 | **temporarily_unreachable** | land.vic.gov.au returns HTTP 403 (access control) from this environment — not circumvented |
| tas_rental_bonds | TAS | XLSX | — | ? | 403 | **temporarily_unreachable** | cbos.tas.gov.au returns HTTP 403 (access control) from this environment — not circumvented |
| local_2p3gb_collection | AU | duckdb/parquet | — | ? | — | **provenance_unverified** | no manifest/checksum/producing-commit; preserved, never used for coverage. See LOCAL_DATA_ |

**Accepted this sprint:** SA Metro Median House Sales + SA Private Rental Report (both CC BY 4.0, real bytes downloaded, checksummed, parsed, materialised). Attribution: © Government of South Australia (CC BY 4.0).
