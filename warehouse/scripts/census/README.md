# Census scripts

Scripts for loading ABS Census data onto the ASGS geography backbone (Sprint 3+).
Manifest: `warehouse/reports/census_dwelling_source_manifest.json`.

| Script | Status | Purpose |
|---|---|---|
| `discover_census_dwelling_sources.mjs` | done | Catalogue + verify official ABS 2021 GCP DataPacks (SAL/POA/SA2/SA1/LGA) and Mesh Block counts into the source manifest. Page-scan verification; nothing downloaded. |
| `build_census_dwelling_local_store.mjs` | in progress | Download manifest-approved files into gitignored raw storage (SHA-256 recorded), extract, and build the local DuckDB/Parquet store (`warehouse/data/local/census_2021.duckdb`). No Supabase contact. |
| `validate_census_dwelling_local_store.mjs` | in progress | Read-only validation of the local Census store; writes `census_dwelling_local_store_report.{json,md}`. |

Ground rules (same as geography scripts):

- Official ABS sources only (CC BY 4.0); no scraping of protected/commercial sites.
- Raw downloads and local stores live under `warehouse/data/` (gitignored) — never in git.
- Exact GCP table numbers/columns are confirmed from each pack's own Metadata
  workbook at build time, never assumed.
- Missing data stays NULL — no zero-filling; bad rows are quarantined in place.
- Branch loads (warehouse-validation only) happen in a separate, approval-gated step;
  these scripts never touch Supabase.
