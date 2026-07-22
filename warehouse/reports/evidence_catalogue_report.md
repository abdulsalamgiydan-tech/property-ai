# Research Evidence Catalogue

Generated 2026-07-22T11:36:36.366Z from the live warehouse-validation branch — 13 registered sources, 41 datasets.

Every source below is either official government/statutory data or a named independent publisher — this project never uses unofficial or scraped-without-attribution data (see `warehouse/docs/WAREHOUSE_PLAN.md`).

- **demographics**: 1 source(s)
- **geography**: 1 source(s)
- **macro**: 1 source(s)
- **rentals**: 5 source(s)
- **sales**: 3 source(s)
- **supply**: 2 source(s)

## Sources

### ABS Census of Population and Housing

- **Publisher**: Australian Bureau of Statistics (official)
- **Category**: demographics
- **Licence**: CC BY 4.0
- **Access method**: file_download · **Update frequency**: five_yearly
- **Implementation status**: in_progress
- **URL**: https://www.abs.gov.au/census

- **Datasets**: ABS official 2016-to-2021 geographic correspondence (population-weighted, SSC->SAL and POA->POA) (SSC(2016)->SAL(2021), POA(2016)->POA(2021), 2016–2021, freshness: not_tracked); 2021 Census GCP DataPack — LGA for AUS (short header) (LGA, 2021–2021, freshness: not_tracked); 2021 Census GCP DataPack — POA for AUS (short header) (POA, 2021–2021, freshness: not_tracked); 2021 Census GCP DataPack — SA1 for AUS (short header) (SA1, 2021–2021, freshness: not_tracked); 2021 Census GCP DataPack — SA2 for AUS (short header) (SA2, 2021–2021, freshness: not_tracked); 2021 Census GCP DataPack — SAL for AUS (short header) (SAL, 2021–2021, freshness: not_tracked); Census of Population and Housing: Mesh Block Counts, 2021 (dwelling + person counts per Mesh Block) (MB, 2021–2021, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.demographics, postcode_market_snapshot.dwelling_stock, postcode_market_snapshot.population_growth, suburb_market_snapshot.demographics, suburb_market_snapshot.dwelling_stock, suburb_market_snapshot.population_growth

### ABS Australian Statistical Geography Standard (ASGS) Edition 3

- **Publisher**: Australian Bureau of Statistics (official)
- **Category**: geography
- **Licence**: CC BY 4.0
- **Access method**: file_download · **Update frequency**: five_yearly
- **Implementation status**: in_progress
- **URL**: https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs-edition-3/jul2021-jun2026
- **Known limitations**: Boundary editions change every 5 years; SAL/POA are approximations of gazetted suburbs and postcodes; artefact URLs verified in warehouse/reports/asgs_source_manifest.json
- **Datasets**: ASGS Ed.3 SA1 to LGA allocation (official ABS allocation/correspondence file) (SA1->LGA, 2021–2021, freshness: not_tracked); ASGS Ed.3 SA1 to POA allocation (official ABS allocation/correspondence file) (SA1->POA, 2021–2021, freshness: not_tracked); ASGS Ed.3 SA1 to SAL allocation (official ABS allocation/correspondence file) (SA1->SAL, 2021–2021, freshness: not_tracked); ASGS Ed.3 SA2 to LGA correspondence (derived by aggregating SA1 allocations) (SA2->LGA, 2021–2021, freshness: not_tracked); ASGS Ed.3 SA2 to POA correspondence (derived by aggregating SA1 allocations) (SA2->POA, 2021–2021, freshness: not_tracked); ASGS Ed.3 SA2 to SAL correspondence (derived by aggregating SA1 allocations) (SA2->SAL, 2021–2021, freshness: not_tracked); ASGS Ed.3 Greater Capital City Statistical Areas (GCCSA) digital boundaries, GDA2020 shapefile (GCCSA, 2021–2021, freshness: not_tracked); ASGS Ed.3 Local Government Areas (LGA) digital boundaries, GDA2020 shapefile (LGA, 2021–2021, freshness: not_tracked); ASGS Ed.3 Mesh Block allocation file (MB -> SA1..STATE main structure, incl. Albers areas) (MB, 2021–2021, freshness: not_tracked); ASGS Ed.3 Postal Areas (POA) digital boundaries, GDA2020 shapefile (POA, 2021–2021, freshness: not_tracked); ASGS Ed.3 Statistical Areas Level 1 (SA1) digital boundaries, GDA2020 shapefile (SA1, 2021–2021, freshness: not_tracked); ASGS Ed.3 Statistical Areas Level 2 (SA2) digital boundaries, GDA2020 shapefile (SA2, 2021–2021, freshness: not_tracked); ASGS Ed.3 Statistical Areas Level 3 (SA3) digital boundaries, GDA2020 shapefile (SA3, 2021–2021, freshness: not_tracked); ASGS Ed.3 Statistical Areas Level 4 (SA4) digital boundaries, GDA2020 shapefile (SA4, 2021–2021, freshness: not_tracked); ASGS Ed.3 Suburbs and Localities (SAL) digital boundaries, GDA2020 shapefile (SAL, 2021–2021, freshness: not_tracked); ASGS Ed.3 States and Territories (STATE) digital boundaries, GDA2020 shapefile (STATE, 2021–2021, freshness: not_tracked)
- **Feeds published metrics**: not yet linked in the lineage registry

### Reserve Bank of Australia — Interest Rate Statistics

- **Publisher**: Reserve Bank of Australia (official)
- **Category**: macro
- **Licence**: CC BY 4.0 (Cash Rate Target has additional benchmark conditions — see Copyright Notice s.4)
- **Access method**: file_download · **Update frequency**: as_announced_or_monthly
- **Implementation status**: in_progress
- **URL**: https://www.rba.gov.au/statistics/interest-rates/

- **Datasets**: RBA Table A2 — Cash Rate Target (Changes in Monetary Policy and Administered Rates) (national, 1990-01-23–2026-05-06, freshness: not_tracked); RBA Table F6 — Housing Lending Rates (national, 2019-07-31–2026-05-31, freshness: not_tracked); RBA Table F5 — Indicator Lending Rates (housing subset) (national, 1959-01-31–2026-06-30, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.affordability, suburb_market_snapshot.affordability

### NSW DCJ Rent and Sales Report

- **Publisher**: NSW Department of Communities and Justice (official)
- **Category**: rentals
- **Licence**: NSW Government open statistical report
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: live
- **URL**: https://dcj.nsw.gov.au/about-us/families-and-communities-statistics/housing-rent-and-sales/rent-and-sales-report.html

- **Datasets**: NSW DCJ Rent tables — full state (LGA,POA, 2021-Q1–2026-Q1, freshness: manual_review); NSW DCJ Rent tables — pilot (6 LGAs) (LGA,POA, 2021-Q1–2026-Q1, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.rent (NSW), suburb_market_snapshot.rent (NSW)

### RTA Quarterly Data — Median Rents

- **Publisher**: Residential Tenancies Authority (RTA), Queensland Government (official)
- **Category**: rentals
- **Licence**: CC BY 4.0 (or equivalent open government licence, see source manifest)
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: in_progress
- **URL**: https://www.rta.qld.gov.au/forms-resources/rta-quarterly-data/median-rents-quarterly-data

- **Datasets**: QLD RTA Bond Statistics — suburb/LGA/postcode (SAL,POA,LGA, 2017-Q3–2026-Q2, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.rent (QLD), suburb_market_snapshot.rent (QLD)

### SA Housing Trust Private Rent Report

- **Publisher**: South Australian Housing Trust (official)
- **Category**: rentals
- **Licence**: CC BY 4.0 (or equivalent open government licence, see source manifest)
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: in_progress
- **URL**: https://data.sa.gov.au/data/dataset/private-rent-report

- **Datasets**: SA Private Rent Report — suburb/postcode (current era) (SAL,POA,LGA, 2024-Q3–2026-Q1, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.rent (SA), suburb_market_snapshot.rent (SA)

### Homes Victoria Rental Report

- **Publisher**: Homes Victoria (Department of Families, Fairness and Housing) (official)
- **Category**: rentals
- **Licence**: CC BY 4.0 (whole-of-government default, no dataset-specific licence page found)
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: live
- **URL**: https://www.dffh.vic.gov.au/publications/rental-report
- **Known limitations**: Suburb-grain file uses custom multi-suburb locality groupings for ~42% of rows that cannot be mapped to a single ASGS SAL; LGA-grain fallback used for those
- **Datasets**: Homes Victoria — Moving annual rent by suburb (SAL, 2000-Q1–2025-Q3, freshness: manual_review); Homes Victoria — Quarterly median rents by LGA (LGA, 1999-Q2–2025-Q3, freshness: manual_review)
- **Feeds published metrics**: postcode_market_snapshot.rent (VIC), suburb_market_snapshot.rent (VIC)

### WA Rental Bonds Data (DMIRS)

- **Publisher**: Government of Western Australia (Department of Mines, Industry Regulation and Safety) (official)
- **Category**: rentals
- **Licence**: CC BY 4.0 (or equivalent open government licence, see source manifest)
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: in_progress
- **URL**: https://housing-data-exchange.ahdap.org/dataset/west-australia-rental-bonds-data-2023-current

- **Datasets**: WA DMIRS Rental Bonds — suburb/postcode, medians derived in-house (SAL,POA,LGA, 2023-03–2026-05, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.rent (WA), suburb_market_snapshot.rent (WA)

### ABS Total Value of Dwellings (Table 2: Median Price and Number of Transfers)

- **Publisher**: Australian Bureau of Statistics (official)
- **Category**: sales
- **Licence**: CC BY 4.0
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: live
- **URL**: https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/total-value-dwellings
- **Known limitations**: GCCSA grain only (capital city / rest of state) — no SAL/POA detail. Successor to the discontinued 'Residential Property Price Indexes: Eight Capital Cities' (cat. 6432.0, ceased Dec 2021 issue). Used here specifically as the official-aggregate fallback for TAS/NT/ACT, which have no free bulk transaction-level source.
- **Datasets**: ABS TVD — TAS/NT/ACT median sale price and transfer count, GCCSA grain (GCCSA, 2002-03-01–March Quarter 2026, freshness: not_tracked)
- **Feeds published metrics**: not yet linked in the lineage registry

### NSW Valuer General Property Sales Information

- **Publisher**: NSW Valuer General (official)
- **Category**: sales
- **Licence**: CC BY 4.0
- **Access method**: file_download · **Update frequency**: weekly
- **Implementation status**: live
- **URL**: https://valuation.property.nsw.gov.au/embed/propertySalesInformation

- **Datasets**: NSW VG Property Sales Information — pilot (6 LGAs) (SAL,POA, 2021–2026, freshness: not_tracked); NSW VG PSI — full state, 2001-current (SAL,POA, 2001–2026, freshness: manual_review)
- **Feeds published metrics**: postcode_market_snapshot.sales (ACT), postcode_market_snapshot.sales (NSW), postcode_market_snapshot.sales (QLD), suburb_market_snapshot.sales (NSW)

### Victorian Property Sales Report (VPSR)

- **Publisher**: Department of Transport and Planning (Valuer-General Victoria) (official)
- **Category**: sales
- **Licence**: Creative Commons Attribution 4.0 International
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: live
- **URL**: https://discover.data.vic.gov.au/dataset/victorian-property-sales-report-median-house-by-suburb
- **Known limitations**: Pre-aggregated suburb medians only, no transaction-level data; requires a headed browser session to pass a Cloudflare JS challenge; no townhouse/villa split, no postcode grain
- **Datasets**: VPSR Median House by Suburb (SAL, 2023-Q4–2025-Q4, freshness: manual_review); VPSR Median Vacant Land by Suburb (SAL, 2023-Q4–2025-Q4, freshness: manual_review); VPSR Median Unit by Suburb (SAL, 2023-Q4–2025-Q4, freshness: manual_review)
- **Feeds published metrics**: postcode_market_snapshot.sales (VIC), suburb_market_snapshot.sales (VIC)

### ABS Building Activity, Australia (Tables 36 & 39: dwelling unit commencements/completions, states and territories)

- **Publisher**: Australian Bureau of Statistics (official)
- **Category**: supply
- **Licence**: CC BY 4.0
- **Access method**: file_download · **Update frequency**: quarterly
- **Implementation status**: live
- **URL**: https://www.abs.gov.au/statistics/industry/building-and-construction/building-activity-australia
- **Known limitations**: STATE grain only -- no free SAL/POA breakdown exists for commencements/completions (select series exist at GCCSA in this ABS publication, but not the specific tables used here). Original (not seasonally adjusted) series. Total Sectors (private+public combined), new dwellings only (excludes alterations).
- **Datasets**: Dwelling commencements and completions, state/territory grain (STATE, 1957-03-01–March 2026 quarter, freshness: not_tracked)
- **Feeds published metrics**: fact_dwelling_construction_activity.dwelling_construction_activity

### ABS Building Approvals

- **Publisher**: Australian Bureau of Statistics (official)
- **Category**: supply
- **Licence**: CC BY 4.0
- **Access method**: api · **Update frequency**: monthly
- **Implementation status**: in_progress
- **URL**: https://www.abs.gov.au/statistics/industry/building-and-construction/building-approvals-australia

- **Datasets**: ABS Building Approvals by SA2 and above, from July 2021 onwards (BA_SA2 v2.0.0) (SA2, 2021-07–2026-05-01, freshness: not_tracked)
- **Feeds published metrics**: postcode_market_snapshot.approvals, suburb_market_snapshot.approvals

## Sources with no published metric family

- abs_asgs
- abs_total_value_dwellings
