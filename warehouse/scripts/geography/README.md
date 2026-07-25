# Geography scripts

Scripts for building the ABS ASGS geography backbone (Sprint 2). Plan:
`warehouse/docs/SPRINT_2_ASGS_GEOGRAPHY_BACKBONE.md`.

| Script | Status | Purpose |
|---|---|---|
| `discover_asgs_sources.mjs` | done | Enumerate official ABS ASGS boundary + correspondence downloads into a manifest (`warehouse/reports/asgs_source_manifest.json`) |
| `download_asgs_sources.mjs` | done | Controlled download of manifest-approved artefacts into gitignored raw storage; SHA-256 + size + URL recorded in `warehouse/reports/asgs_download_inventory.{json,md}` |
| `inspect_asgs_local_files.mjs` | done | Extract boundary zips into `warehouse/data/processed/` (gitignored) and inspect layers, CRS, row counts and fields into `warehouse/reports/asgs_local_file_inspection.{json,md}` |
| `load_asgs_backbone.mjs` | staging phase done | Load staged ASGS files into `staging.asgs_geography` / `staging.asgs_correspondence` with lineage + quality/coverage results. Core promotion is blocked pending approval. |
| `promote_asgs_to_core.mjs` | built; paused | Staging → core promotion with blocking gates (single transaction, rollback on failure). Paused: branch disk cannot hold staging + core geometry copies. |
| `build_asgs_local_store.mjs` | done | Build the local DuckDB/Parquet staging store (`warehouse/data/local/`, gitignored) from raw ABS files — keeps the Supabase branch lean; no DB connection. |
| `validate_asgs_local_store.mjs` | done | Read-only validation of the local store; writes `asgs_local_store_report.{json,md}`. No DB connection. |
| `cleanup_branch_staging.mjs` | prepared, NOT run | Branch-only truncate of the two heavy staging tables after the local store is validated. Requires `--execute --confirm-local-store-validated` AND explicit user approval. |

Run order (local-first strategy): `discover` → `download` → `inspect` →
`build_asgs_local_store` → `validate_asgs_local_store` → (approved) branch/core loads.
`load_asgs_backbone.mjs` is a dry run by default; `--execute` needs
`WAREHOUSE_VALIDATION_DB_URL` in `.env.local` (see `.env.example`) and refuses any
database that is not the warehouse-validation branch.

Ground rules for these scripts:

- Official ABS sources only (CC BY 4.0); no scraping of protected/commercial sites.
- Raw downloads go to `warehouse/data/` (gitignored) — never into git; only hashes,
  URLs and sizes are committed (download inventory).
- Database connections come from environment variables; no secrets in code and no
  values printed. Target is the warehouse-validation Supabase branch only — the
  production ref is refused in code.
- Additive SQL only: new load runs insert alongside old ones; nothing is dropped,
  truncated or deleted.
- Missing data stays NULL — no zero-filling, no silent geometry fixes (quarantine
  instead).
