# Sprint 12, Workstream 13 — Export and Reproducibility

## What "reproducible" means here, and why the export bundle is the deliverable

Not a raw-numbers CSV — a bundle that lets a reader independently
re-derive any published figure using only public sources and documented
methodology, with no access to this application required. Directly builds
on WS8 (lineage), WS9 (quality), and WS11 (public API): the export is a
packaging exercise over infrastructure that already existed, not new
data-fetching logic.

## What was built

- **`GET /api/v1/export/:geographyId?format=json|csv`** — bundles the
  snapshot, the full timeseries, and per-metric-family lineage (only for
  metric families actually populated for that geography — avoids firing
  8 lineage lookups when only 2-3 have data) into one response.
  - `json`: the full structured bundle.
  - `csv`: the timeseries as a downloadable file
    (`Content-Disposition: attachment`) with a methodology header comment
    block (one line per populated metric family: source, publisher,
    transformation method, licence) prepended above the data rows —
    genuinely self-documenting, not just a data dump with a separate
    README a reader has to go find.
- **`lib/warehouse/queries.ts`**: `getExportBundle()` (infers SAL vs POA
  grain from the `geography_id` prefix — the established convention
  throughout this codebase), `exportBundleToCsv()` (pure function, proper
  CSV quoting for fields containing commas).
- **UI**: "Export CSV" / "Export JSON" links added to
  `MarketSnapshotView.tsx`'s header, next to every suburb/postcode page.
- **`warehouse/docs/DATA_REPRODUCIBILITY.md`**: documents, metric family
  by metric family, exactly how a reader would reproduce each number —
  including the 2 genuine exceptions (the QLD/ACT cross-border anomaly,
  quarantined future-dated data) disclosed honestly rather than glossed
  over, consistent with WS8/WS9's own reporting style.

## Live verification

Started the dev server, curled both formats for Lindfield
(`SAL_12348_ASGS3_2021`):
- JSON: full bundle returned, snapshot data correct.
- CSV: methodology header block correctly shows real source/publisher/
  licence for every populated family — e.g. `# population_growth: ABS
  Census of Population and Housing (Australian Bureau of Statistics) --
  cross_census_boundary_reconciliation -- CC BY 4.0`.
- CSV response headers confirmed: `content-disposition: attachment;
  filename="SAL_12348_ASGS3_2021_export.csv"`, correct `content-type`.

## Validation

- `npm test`: 161/161 pass (4 new — pure-function tests for
  `exportBundleToCsv`: methodology header formatting, correct column
  order, CSV quoting for embedded commas, and a well-formed empty export).
- `npm run build`: passes, new `/api/v1/export/[geographyId]` route
  compiles.
- `npm run lint`: 0 errors, 6 pre-existing warnings.
- Production (`oshquaxsloolqucwvigc`): re-confirmed untouched (no schema
  changes this workstream — pure application-layer addition over
  existing `/api/v1` infrastructure).

## Known limitation

Like WS12's "About this metric" panel, the export links are gated behind
`PUBLIC_API_V1_ENABLED` independently of the `/research` UI's own
`WAREHOUSE_PREVIEW_ENABLED` flag — a deployment with research enabled but
the public API flag off will show a graceful `404` JSON response if a
reader clicks Export, not a crash, but also not a working download. Both
flags need to be on together for the full experience; documented in
`PUBLIC_API_V1_CONTRACT.md`, not silently assumed.

## This closes the Sprint 12 workstream chain WS9→WS13

This report marks the requested "continue till WS13 is done" chain
complete: WS9 (quality/freshness) → WS10 (refresh engine v3) → WS11
(public API v1) → WS12 (surfacing WS4/WS6/WS8 in the UI) → WS13 (export/
reproducibility) — each workstream's report cites and builds on the one
before it, not a disconnected sequence.
