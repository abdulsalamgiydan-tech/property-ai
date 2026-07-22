# Sprint 12, Workstream 5 — Research Evidence Catalogue

## Finding: `meta.source` was already the live authority, but nothing rendered it as a catalogue

`warehouse/metadata/source_register.csv` (8 rows) is NOT the comprehensive
source list — investigated its actual usage before assuming it was stale:
it's a narrow bootstrap input consumed by exactly one script
(`load_asgs_backbone.mjs`) and checked by `warehouse:check` for exactly
one required row (`abs_asgs`). Every other source this project has
registered across Sprints 9-12 inserts directly into `meta.source` via
its own load script — `meta.source` (13 rows) has always been the real,
live, authoritative registry. Nothing had ever queried it and rendered it
as a browsable catalogue before this workstream.

## What was built

- `warehouse/scripts/audit/build_evidence_catalogue.mjs` — live,
  re-runnable generator (matching WS1's established pattern): queries
  `meta.source` + `meta.dataset`, cross-references
  `meta.metric_lineage_registry` (WS8) to show which published metric
  families each source actually feeds, and
  `meta.dataset_freshness_status` (WS9) for currency. Writes
  `warehouse/metadata/evidence_catalogue.json` +
  `warehouse/reports/evidence_catalogue_report.md`.
- `public.v_evidence_catalogue_v1` (migration 035) — the public-facing
  version (dataset/metric counts, not the full per-dataset breakdown,
  which stays in the generated report).
- `GET /api/v1/sources` — new endpoint on the versioned public API.
- `/research/sources` — new UI page, grouped by category (geography,
  demographics, sales, rentals, supply, macro), linking to each source's
  official URL.

## Live-verified finding: 2 sources have no published metric family

`abs_asgs` (16 datasets, 0 published metrics) and
`abs_total_value_dwellings` (1 dataset, 0 published metrics) — both
correctly expected, not bugs: `abs_asgs` is the geography boundary
backbone itself, not a metric-producing source; `abs_total_value_dwellings`
is the TAS/ACT/NT GCCSA-grain sales source, which WS6 already confirmed
is deliberately excluded from the SAL/POA-grain wide snapshot marts
(a documented grain-mismatch gap, not something WS5 should force a fix
for).

## Validation

- Live-verified `public.v_evidence_catalogue_v1` and `/api/v1/sources`
  against the real branch/dev server.
- Live-verified `/research/sources` renders correctly (200, real content).
- `npm test`: 161/161 pass (no new automated tests this workstream —
  the generator script follows the exact safety/read-only pattern already
  covered by this project's established convention for audit scripts;
  the UI page verified live per this project's frontend-testing
  convention).
- `npm run build`/`lint`/`warehouse:check`: all pass.
- Production: re-confirmed untouched.

## Files

- `warehouse/scripts/audit/build_evidence_catalogue.mjs` (new)
- `supabase/migrations/035_evidence_catalogue_v1.sql` (new)
- `app/api/v1/sources/route.ts` (new)
- `app/research/sources/page.tsx` (new)
- `lib/warehouse/queries.ts` — `getEvidenceCatalogue()` (new)
- `warehouse/metadata/evidence_catalogue.json`,
  `warehouse/reports/evidence_catalogue_report.md` (generated)

## Exact next workstream

WS7 — Scenario Lab.
