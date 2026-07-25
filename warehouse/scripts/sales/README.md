# Sales scripts

Scripts for loading NSW property sales onto the ASGS geography backbone
(Sprint 5+, pilot). Manifest: `warehouse/reports/nsw_sales_source_manifest.json`.

| Script | Status | Purpose |
|---|---|---|
| `discover_nsw_sales_sources.mjs` | done | Documents/re-verifies the official NSW VG PSI bulk source; regenerates the manifest from the confirmed URL patterns and file inventory already on disk. |
| `build_nsw_sales_local_store.mjs` | done | Extracts the already-downloaded PSI zip-of-zips archives, streams every district's `.DAT` file, filters to the pilot suburb/postcode allow-list, deduplicates, classifies dwelling type, flags non-market/outlier prices, joins to the ASGS backbone, and aggregates monthly/annual summaries into the local DuckDB/Parquet store. |
| `validate_nsw_sales_local_store.mjs` | done | Read-only validation of the local store; writes `nsw_sales_local_store_report.{json,md}`. |
| `load_nsw_sales_marts_to_branch.mjs` | done | Branch-only load of the curated summary + 4 marts. Raw transactions are never loaded to Supabase. |

Raw PSI files must be downloaded first — the `__psi` bulk-download endpoint sits
behind a Cloudflare managed JS challenge that plain HTTP clients cannot pass,
so files are retrieved through a real headed browser session (gstack `/browse`
skill) rather than by these Node scripts. See
`warehouse/reports/nsw_sales_source_manifest.md` for the access-method note and
URL patterns.

Pilot scope: 6 LGAs (Blacktown, Parramatta, Camden, Wollongong, Newcastle,
Shellharbour). The suburb/postcode allow-list (`warehouse/metadata/
nsw_sales_pilot_sals.json` / `_pilot_poas.json`) is derived spatially from the
local ASGS store (majority-overlap against the LGA boundaries) rather than the
VG's own numeric district codes, whose reference PDF is also inaccessible.

Ground rules (same as other warehouse scripts):

- Official NSW VG sources only; no commercial/protected property portal scraping.
- Raw downloads and local stores live under `warehouse/data/` (gitignored) — never in git.
- Local-first, curated-promotion-only: the full raw transaction history never
  leaves the local store; only pre-aggregated summaries and marts reach Supabase.
- Non-arm's-length/nominal transfers and statistical outliers are flagged and
  excluded from price statistics — never silently included, never dropped.
- Missing data stays NULL; ambiguous dwelling-type records get
  `unknown_residential` with a `low` confidence label rather than being forced.
