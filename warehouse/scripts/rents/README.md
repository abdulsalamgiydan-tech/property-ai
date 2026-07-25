# Rents scripts

Scripts for loading NSW rental market data and computing gross rental yield onto the
ASGS geography backbone (Sprint 6+, pilot). Manifest:
`warehouse/reports/nsw_rental_bonds_source_manifest.json`.

| Script | Status | Purpose |
|---|---|---|
| `discover_nsw_rent_sources.mjs` | done | Verifies the official NSW DCJ Rent and Sales Report quarterly rent tables (LGA + Postcode sheets). Strict verification: HTTP 200 alone is insufficient on this CMS (soft-404 HTML pages return 200) — requires content-type + zip magic bytes. |
| `build_nsw_rents_local_store.mjs` | done | Downloads verified quarterly xlsx files, parses both sheets (dynamic header-row detection — position shifted between report vintages), filters to the pilot LGAs/postcodes, classifies dwelling type (direct 1:1 from DCJ's own categories), and builds the local DuckDB/Parquet summary store. |
| `validate_nsw_rents_local_store.mjs` | done | Read-only validation of the local store; writes `nsw_rental_bonds_local_store_report.{json,md}`. |
| `load_nsw_rents_to_branch.mjs` | done | Branch-only load: curated rent summary + postcode rent mart (direct) + suburb rent mart (derived via chained POA→SAL correspondence) + gross-yield marts combining with the Sprint 5 sales pilot. Writes both the branch-load and yield-pilot reports. |

Ground rules (same as other warehouse scripts):

- Official NSW Government sources only (dcj.nsw.gov.au — no anti-bot challenge on this
  domain, unlike NSW VG PSI in Sprint 5, so plain HTTPS download is used).
- Raw downloads and local stores live under `warehouse/data/` (gitignored) — never in git.
- Local-first, curated-promotion-only: the full quarterly sheet data never leaves the
  local store; only pre-aggregated summaries and marts reach Supabase.
- Suppressed cells (DCJ's own <=10/<=30 bond thresholds) stay NULL — never zero-filled
  or estimated.
- Gross yield is a descriptive statistic only — never presented as a recommendation,
  score, AVM or forecast (enforced via table comments and an explicit
  `yield_confidence_label` on every row, including rows where yield could not be
  computed).
