# Local warehouse data — provenance inventory & evidence request (V2.1)

> **V2.1.1 scope note (explicit):** the **zero fully-lineage-qualified yields**
> conclusion is valid. The residential-active / source-eligible **per-record
> gap-ledger coverage remains incomplete** (the coverage report is still largely
> aggregate). The ~2.3 GB of local data below is **preserved but unusable for any
> coverage claim until its provenance is verified or the resources are officially
> reacquired**. **No external coverage was added** in V2.1 or V2.1.1.


`warehouse/data/local/` contains ~2.3 GB of pre-existing DuckDB/Parquet/JSON
artifacts that were **not created by any committed script on this branch** and
carry **no manifest, checksum, retrieval log, source URL, or licence evidence**
(the only manifest present is `nsw_yield_candidates.manifest.json`, which this
sprint created for the read-only warehouse pull).

**Classification: every asset below is `provenance_unverified`.** None has been
used for any coverage claim in PR #32. They are preserved (gitignored, never
deleted), per the guardrails.

## Inventory (size · asset · classification)

| Size | Asset | Classification |
|--:|---|---|
| 700 MB | `asgs_2021.duckdb` | provenance_unverified |
| 517 MB | `asgs_geography.parquet` | provenance_unverified |
| 430 MB | `nsw_sales.duckdb` | provenance_unverified |
| 197 MB | `nsw_sales_archive.duckdb` | provenance_unverified |
| 141 MB | `nsw_sales_transactions.parquet` | provenance_unverified |
| 54 MB | `nsw_sales_archive_transactions.parquet` | provenance_unverified |
| 39 MB | `census_2021.duckdb` | provenance_unverified |
| 27 MB | `nsw_sales_summary.parquet` | provenance_unverified |
| 11 MB | `nsw_rents.duckdb` | provenance_unverified |
| 5 MB | `qld_rents.duckdb`, `building_approvals.duckdb` | provenance_unverified |
| 3 MB | `asgs_correspondence.parquet`, `wa_rents.duckdb`, `census_dwelling_stock.parquet` | provenance_unverified |
| 1–2 MB | `vic_rents.duckdb`, `census_demographics*`, `national_population.duckdb`, `geography_bridge_2016_2021.duckdb`, `cross_census_harmonisation.duckdb`, `correspondence_dwelling_weights.parquet`, `nsw_rental_summary.parquet` | provenance_unverified |
| < 1 MB | `vic_sales*.duckdb/parquet`, `sa_rents.duckdb`, `sa_rental_summary.parquet`, `qld/wa_rental_summary.parquet`, `rba_rates.duckdb`, `rba_interest_rates.parquet`, `sa2_population_*.parquet`, `abs_tvd_tas_act_nt.json`, `dwelling_construction_activity.json` | provenance_unverified |

(Full `ls -la` listing reproducible via `ls -la warehouse/data/local/`.)

## Why not verified (evidence checked)

- Repository history on this branch (`git log`) shows only the two Coverage
  Maximiser commits and the PR-30/31 merges — no committed script that produces
  `nsw_sales.duckdb`, `asgs_2021.duckdb`, `census_2021.duckdb`, etc.
- No per-asset manifest, checksum, or retrieval log exists alongside them.
- Filenames imply official sources (NSW VG sales, ABS ASGS/Census, RBA,
  multi-state rents) but **filenames and mtimes are not provenance**.

## Exact evidence request (for Abdul)

For each family below, please confirm so it can be reclassified and (if
`verified_official_reusable`) run through the raw→staging→core→mart pipeline:

1. **NSW sales** (`nsw_sales*.duckdb/parquet`): generating script + commit,
   official download URL (NSW VG Bulk PSI?), retrieval date, raw checksum, and
   the **licence** (CC BY 4.0?) permitting commercial display + derivatives.
2. **ASGS geography** (`asgs_2021.duckdb`, `asgs_geography.parquet`,
   `asgs_correspondence.parquet`): ABS ASGS edition/URL, licence (CC BY 4.0?),
   and whether boundaries were transformed.
3. **Census** (`census_2021.duckdb`, `census_*`): ABS DataPack product + URL +
   licence.
4. **Multi-state rents** (`vic/qld/sa/wa_rents.duckdb`): per-source provider,
   URL, licence, and whether geography is suburb-direct or postcode/LGA context.
5. **RBA rates**, **building approvals**, **population**: source URL + licence.

Until each is confirmed, these remain `provenance_unverified` and are excluded
from coverage. If confirmed reusable, they unlock the highest-value lanes
(NSW multi-year growth, VIC/SA/QLD/WA rents, ABS context) immediately, since the
parsers, registry, lineage contract and materialiser are already in place.
